import type * as Party from "partykit/server";
import type {
  BattleCard,
  BattleClientMessage,
  BattlePhase,
  BattlePlayerPublicState,
  BattleSeatId,
  BattleServerMessage,
  BattleSelfState,
  BattleState,
  ChatMessage,
} from "../../shared/types";
import { fetchProfile, fetchTcgDeckById } from "./lib/supabase";
import {
  type DeckCard,
  dealOpeningHand,
  expandDeck,
  isBasicPokemon,
  shuffle,
  takePrizes,
} from "./lib/battle-engine";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRIZE_COUNT = 6;
const MAX_BENCH = 5;
const LOG_KEEP = 30;

type SeatState = {
  authId: string;
  username: string;
  conn: Party.Connection | null; // null si déconnecté
  // Cartes du deck (mélangé) — la fin du tableau est le sommet de la pile.
  deck: DeckCard[];
  hand: DeckCard[];
  prizes: DeckCard[]; // 6 cartes face cachée (que le joueur peut voir au draw d'une prize)
  discard: DeckCard[];
  active: BattleCard | null;
  bench: BattleCard[]; // jusqu'à 5
  hasSetup: boolean;
};

export default class BattleServer implements Party.Server {
  private seats: { p1: SeatState | null; p2: SeatState | null } = {
    p1: null,
    p2: null,
  };
  private connToSeat = new Map<string, BattleSeatId>();
  private phase: BattlePhase = "waiting";
  private activeSeat: BattleSeatId | null = null;
  private turnNumber = 0;
  private winner: BattleSeatId | null = null;
  private log: string[] = [];
  // Compteur d'instances pour générer des uid de cartes posées sur le board.
  private uidCounter = 0;

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const rawAuthId = url.searchParams.get("authId");
    const authId =
      typeof rawAuthId === "string" && UUID_RE.test(rawAuthId)
        ? rawAuthId
        : null;
    const username = sanitizeName(url.searchParams.get("name"));
    const deckId = url.searchParams.get("deck");
    if (!authId || !username || !deckId) {
      this.sendError(conn, "Connexion invalide (auth/deck manquant).");
      conn.close();
      return;
    }

    // Identifier le siège : si déjà siégé (reconnexion), reprendre. Sinon
    // attribuer p1 ou p2 selon disponibilité.
    let seatId: BattleSeatId | null = null;
    if (this.seats.p1?.authId === authId) seatId = "p1";
    else if (this.seats.p2?.authId === authId) seatId = "p2";
    else if (!this.seats.p1) seatId = "p1";
    else if (!this.seats.p2) seatId = "p2";

    if (!seatId) {
      // Spectateur — pour MVP on close.
      this.sendError(conn, "Cette partie est complète.");
      conn.close();
      return;
    }

    if (!this.seats[seatId]) {
      // Première connexion sur ce siège : load deck depuis la DB.
      const deckRow = await fetchTcgDeckById(this.room, deckId);
      if (!deckRow) {
        this.sendError(conn, "Deck introuvable.");
        conn.close();
        return;
      }
      const total = (deckRow.cards ?? []).reduce((s, c) => s + c.count, 0);
      if (total !== 60) {
        this.sendError(
          conn,
          `Deck invalide (${total}/60 cartes).`,
        );
        conn.close();
        return;
      }
      const deck = expandDeck(
        (deckRow.cards ?? []).map((c) => ({
          cardId: c.card_id,
          count: c.count,
        })),
      );
      shuffle(deck);
      const { hand, mulligans } = dealOpeningHand(deck);
      const prizes = takePrizes(deck, PRIZE_COUNT);
      this.seats[seatId] = {
        authId,
        username,
        conn,
        deck,
        hand,
        prizes,
        discard: [],
        active: null,
        bench: [],
        hasSetup: false,
      };
      this.connToSeat.set(conn.id, seatId);

      if (mulligans > 0) {
        this.pushLog(
          `${username} mulligan ×${mulligans} (aucun Pokémon de Base au départ).`,
        );
      }
    } else {
      // Reconnexion (même authId).
      const existing = this.seats[seatId];
      if (existing) existing.conn = conn;
      this.connToSeat.set(conn.id, seatId);
    }

    this.sendTo(conn, {
      type: "battle-welcome",
      selfId: conn.id,
      selfSeat: seatId,
    });

    // Si les 2 sièges sont remplis et qu'on attendait, on passe en setup.
    if (this.phase === "waiting" && this.seats.p1 && this.seats.p2) {
      this.phase = "setup";
      this.pushLog("Les deux joueurs sont là. Choisissez votre Pokémon Actif.");
    }
    this.broadcastState();
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const seatId = this.connToSeat.get(sender.id);
    if (!seatId) return;
    let data: BattleClientMessage;
    try {
      data = JSON.parse(raw) as BattleClientMessage;
    } catch {
      return;
    }
    switch (data.type) {
      case "chat": {
        const text = sanitizeChat(data.text);
        if (!text) return;
        const seat = this.seats[seatId];
        if (!seat) return;
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          playerId: sender.id,
          playerName: seat.username,
          text,
          timestamp: Date.now(),
        };
        this.broadcast({ type: "chat", message });
        break;
      }
      case "battle-set-active":
        this.handleSetActive(seatId, data.handIndex);
        break;
      case "battle-add-bench":
        this.handleAddBench(seatId, data.handIndex);
        break;
      case "battle-remove-bench":
        this.handleRemoveBench(seatId, data.benchIndex);
        break;
      case "battle-confirm-setup":
        this.handleConfirmSetup(seatId);
        break;
      case "battle-end-turn":
        this.handleEndTurn(seatId);
        break;
      case "battle-concede":
        this.handleConcede(seatId);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    const seatId = this.connToSeat.get(conn.id);
    this.connToSeat.delete(conn.id);
    if (!seatId) return;
    const seat = this.seats[seatId];
    if (seat) seat.conn = null;
    // Si la partie a démarré, on garde le siège pour permettre la reconnexion.
    // Si on attendait encore (setup pas terminé) et que les 2 sont déco, on reset.
  }

  // ─────────────── handlers ───────────────

  private handleSetActive(seatId: BattleSeatId, handIndex: number) {
    if (this.phase !== "setup") return;
    const seat = this.seats[seatId];
    if (!seat || seat.hasSetup) return;
    if (seat.active) return; // déjà placé
    const card = seat.hand[handIndex];
    if (!card || !isBasicPokemon(card.cardId)) {
      this.sendErrorToSeat(seatId, "Choisis un Pokémon de Base de ta main.");
      return;
    }
    seat.hand.splice(handIndex, 1);
    seat.active = this.makeBattleCard(card.cardId);
    this.broadcastState();
  }

  private handleAddBench(seatId: BattleSeatId, handIndex: number) {
    if (this.phase !== "setup") return;
    const seat = this.seats[seatId];
    if (!seat || seat.hasSetup) return;
    if (seat.bench.length >= MAX_BENCH) {
      this.sendErrorToSeat(seatId, "Banc complet (5 max).");
      return;
    }
    const card = seat.hand[handIndex];
    if (!card || !isBasicPokemon(card.cardId)) {
      this.sendErrorToSeat(seatId, "Seuls des Pokémon de Base au banc.");
      return;
    }
    seat.hand.splice(handIndex, 1);
    seat.bench.push(this.makeBattleCard(card.cardId));
    this.broadcastState();
  }

  private handleRemoveBench(seatId: BattleSeatId, benchIndex: number) {
    if (this.phase !== "setup") return;
    const seat = this.seats[seatId];
    if (!seat || seat.hasSetup) return;
    const card = seat.bench[benchIndex];
    if (!card) return;
    seat.bench.splice(benchIndex, 1);
    seat.hand.push({ uid: card.uid, cardId: card.cardId });
    this.broadcastState();
  }

  private handleConfirmSetup(seatId: BattleSeatId) {
    if (this.phase !== "setup") return;
    const seat = this.seats[seatId];
    if (!seat) return;
    if (!seat.active) {
      this.sendErrorToSeat(
        seatId,
        "Tu dois choisir un Pokémon Actif avant de confirmer.",
      );
      return;
    }
    seat.hasSetup = true;
    this.pushLog(`${seat.username} a placé son Actif et son Banc.`);
    this.broadcastState();

    // Si les deux ont confirmé → coin flip et début de la partie.
    if (this.seats.p1?.hasSetup && this.seats.p2?.hasSetup) {
      const first: BattleSeatId = Math.random() < 0.5 ? "p1" : "p2";
      this.activeSeat = first;
      this.phase = "playing";
      this.turnNumber = 1;
      const name = this.seats[first]!.username;
      this.pushLog(`Pile/Face : ${name} commence !`);
      this.broadcastState();
    }
  }

  private handleEndTurn(seatId: BattleSeatId) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    const seat = this.seats[seatId];
    if (!seat) return;

    // Phase 3 ajoutera : reset playedThisTurn, status effects, etc.
    for (const c of [seat.active, ...seat.bench]) {
      if (c) c.playedThisTurn = false;
    }
    const next: BattleSeatId = seatId === "p1" ? "p2" : "p1";
    this.activeSeat = next;
    this.turnNumber++;
    // Pioche de début de tour pour le suivant.
    const nextSeat = this.seats[next];
    if (nextSeat) {
      const drawn = nextSeat.deck.pop();
      if (drawn) nextSeat.hand.push(drawn);
      else this.declareWinner(seatId, "Adversaire deck-out.");
    }
    this.pushLog(`Tour ${this.turnNumber} — ${nextSeat?.username} joue.`);
    this.broadcastState();
  }

  private handleConcede(seatId: BattleSeatId) {
    if (this.phase === "ended") return;
    const winner: BattleSeatId = seatId === "p1" ? "p2" : "p1";
    this.declareWinner(winner, `${this.seats[seatId]?.username} abandonne.`);
  }

  private declareWinner(winner: BattleSeatId, reason: string) {
    this.phase = "ended";
    this.winner = winner;
    this.pushLog(`🏆 ${this.seats[winner]?.username} gagne — ${reason}`);
    this.broadcastState();
  }

  // ─────────────── utils ───────────────

  private makeBattleCard(cardId: string): BattleCard {
    return {
      uid: `b${this.uidCounter++}`,
      cardId,
      attachedEnergies: [],
      damage: 0,
      statuses: [],
      playedThisTurn: true,
    };
  }

  private pushLog(line: string) {
    this.log.push(line);
    if (this.log.length > LOG_KEEP) this.log.shift();
  }

  private snapshotPublic(seat: SeatState | null): BattlePlayerPublicState | null {
    if (!seat) return null;
    return {
      authId: seat.authId,
      username: seat.username,
      deckSize: seat.deck.length,
      handCount: seat.hand.length,
      active: seat.active,
      bench: seat.bench,
      discardCount: seat.discard.length,
      prizesRemaining: seat.prizes.length,
      hasSetup: seat.hasSetup,
    };
  }

  private snapshotSelf(seat: SeatState | null): BattleSelfState | null {
    const pub = this.snapshotPublic(seat);
    if (!pub || !seat) return null;
    return {
      ...pub,
      hand: seat.hand.map((c) => c.cardId),
    };
  }

  private snapshotForSeat(seatId: BattleSeatId | null): BattleState {
    const selfSeat = seatId ? this.seats[seatId] : null;
    const opponentSeatId: BattleSeatId | null =
      seatId === "p1" ? "p2" : seatId === "p2" ? "p1" : null;
    const opponentSeat = opponentSeatId ? this.seats[opponentSeatId] : null;
    return {
      roomId: this.room.id,
      phase: this.phase,
      self: this.snapshotSelf(selfSeat),
      opponent: this.snapshotPublic(opponentSeat),
      selfSeat: seatId,
      activeSeat: this.activeSeat,
      turnNumber: this.turnNumber,
      winner: this.winner,
      log: [...this.log],
    };
  }

  private broadcastState() {
    for (const conn of this.room.getConnections()) {
      const seatId = this.connToSeat.get(conn.id) ?? null;
      this.sendTo(conn, {
        type: "battle-state",
        state: this.snapshotForSeat(seatId),
      });
    }
  }

  private sendError(conn: Party.Connection, message: string) {
    this.sendTo(conn, { type: "battle-error", message });
  }

  private sendErrorToSeat(seatId: BattleSeatId, message: string) {
    const seat = this.seats[seatId];
    if (seat?.conn) this.sendError(seat.conn, message);
  }

  private sendTo(conn: Party.Connection, msg: BattleServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: BattleServerMessage) {
    this.room.broadcast(JSON.stringify(msg));
  }
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length >= 2 ? trimmed : null;
}

function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 200);
  return trimmed || null;
}

void fetchProfile; // placeholder pour usage futur (ratings, etc.)
