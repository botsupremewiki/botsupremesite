// One Piece TCG — battle server (Phase 3a : squelette).
//
// Mécaniques fidèles au jeu officiel Bandai. Implémentation progressive :
//   3a (cette phase) : connexion, seating, load deck, état "waiting".
//   3b : setup phase (mulligan, pose Vies, DON deck).
//   3c : phases de tour (refresh/draw/don/main/end), jouer une carte,
//        attacher DON.
//   3d : combat vanilla (attaque, KO, Vies, victoire) sans Counter/Blocker.
//   3e : Counter, Blocker, Trigger sur Vie + whitelist d'effets de cartes
//        ([Jouée], [En attaquant], [Activation : Principale], [Initiative],
//         [Double Attaque], [En cas de KO]).
//
// Séparé de party/src/battle.ts (Pokémon Pocket) car les modèles diffèrent
// trop pour qu'une couche commune soit rentable.

import type * as Party from "partykit/server";
import type {
  ChatMessage,
  OnePieceBattleCardInPlay,
  OnePieceBattleClientMessage,
  OnePieceBattlePendingAttack,
  OnePieceBattlePendingTrigger,
  OnePieceBattlePhase,
  OnePieceBattlePlayerPublicState,
  OnePieceBattleSeatId,
  OnePieceBattleSelfState,
  OnePieceBattleServerMessage,
  OnePieceBattleState,
  OnePiecePendingChoice,
  OnePieceTurnPhase,
} from "../../shared/types";
import { OP_BATTLE_CONFIG } from "../../shared/types";
import {
  ONEPIECE_BASE_SET_BY_ID,
  ONEPIECE_BASE_SET,
} from "../../shared/tcg-onepiece-base";
import {
  fetchTcgDeckById,
  recordBattleResult,
  recordBotWin,
} from "./lib/supabase";
import {
  applyAllPowerMods,
  type BattleEffectAccess,
  CARD_HANDLERS,
  type CardRef,
  type ChoiceSelection,
  type EffectContext,
  type EffectHook,
  fireCardEffect,
  fireOnLeaveField,
  getGrantedKeywords,
  isKoBlocked,
} from "./lib/onepiece-effects";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOG_KEEP = 30;

const BOT_AUTH_ID = "bot-supreme";
const BOT_USERNAME = "Bot Suprême";
const BOT_ACTION_DELAY_MS = 700;

type DeckCard = { cardId: string };

type SeatState = {
  authId: string;
  username: string;
  deckName: string | null;
  conn: Party.Connection | null;
  // Leader posé hors deck.
  leaderId: string | null;
  // État du Leader : épuisé (rested) après avoir attaqué, redressé en refresh.
  leaderRested: boolean;
  // Nombre de DON attachées au Leader (boost +1000 power chacune).
  leaderAttachedDon: number;
  // Personnages sur le terrain (≤ maxCharacters).
  characters: OnePieceBattleCardInPlay[];
  // Lieu actif (max 1).
  stage: OnePieceBattleCardInPlay | null;
  // Cartes restantes dans le deck principal (pile de pioche).
  deck: DeckCard[];
  // Main du joueur.
  hand: DeckCard[];
  // Cartes Vie face cachée (le contenu ne fuit pas à l'adverse).
  life: DeckCard[];
  // Défausse (publique en count, contenu privé pour l'instant).
  discard: DeckCard[];
  // DON deck séparé (10 au début).
  donDeck: number;
  // DON area : actives + épuisées.
  donActive: number;
  donRested: number;
  // True si le joueur a décidé du mulligan (peu importe le choix).
  mulliganDecided: boolean;
  // Buffs de puissance temporaires (jusqu'à fin de tour) par target.
  // Clé : "leader" ou uid d'un Personnage. Valeur : +/- N de puissance.
  // Reset à end-turn du seat. Utilisé par les effets type [En attaquant]
  // gagne +X / Persos adverse perd -X.
  tempPowerBuffs: Map<string, number>;
  // Cartes ayant déjà utilisé leur effet [Activation : Principale] [Une fois
  // par tour] ce tour. Reset à end-turn. Clé = uid (ou "leader").
  usedActivationsThisTurn: Set<string>;
};

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length >= 2 ? trimmed : null;
}

export default class OnePieceBattleServer implements Party.Server {
  private seats: { p1: SeatState | null; p2: SeatState | null } = {
    p1: null,
    p2: null,
  };
  private connToSeat = new Map<string, OnePieceBattleSeatId>();
  private phase: OnePieceBattlePhase = "waiting";
  private turnPhase: OnePieceTurnPhase = "main";
  private activeSeat: OnePieceBattleSeatId | null = null;
  private turnNumber = 0;
  private winner: OnePieceBattleSeatId | null = null;
  private log: string[] = [];
  private uidCounter = 0;
  private pendingAttack: OnePieceBattlePendingAttack | null = null;
  private pendingTrigger: OnePieceBattlePendingTrigger | null = null;
  private pendingChoice: OnePiecePendingChoice | null = null;
  private botActScheduled = false;
  private questRecorded = false;
  private resultRecorded = false;
  private readonly botMode: boolean;
  private readonly rankedMode: boolean;

  constructor(readonly room: Party.Room) {
    this.botMode = room.id.startsWith("bot-");
    this.rankedMode = room.id.startsWith("ranked-");
  }

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

    // Identifier le siège : reprise de session OU nouveau seat dispo.
    let seatId: OnePieceBattleSeatId | null = null;
    if (this.seats.p1?.authId === authId) seatId = "p1";
    else if (this.seats.p2?.authId === authId) seatId = "p2";
    else if (!this.seats.p1) seatId = "p1";
    else if (!this.seats.p2) seatId = "p2";

    if (!seatId) {
      this.sendError(conn, "Cette partie est complète.");
      conn.close();
      return;
    }

    if (this.botMode && seatId === "p2") {
      this.sendError(conn, "Cette partie bot est déjà occupée.");
      conn.close();
      return;
    }

    if (!this.seats[seatId]) {
      const deckRow = await fetchTcgDeckById(this.room, deckId);
      if (!deckRow || deckRow.game_id !== "onepiece") {
        this.sendError(conn, "Deck One Piece introuvable.");
        conn.close();
        return;
      }
      if (!deckRow.leader_id) {
        this.sendError(conn, "Ce deck n'a pas de Leader.");
        conn.close();
        return;
      }
      const total = (deckRow.cards ?? []).reduce((s, c) => s + c.count, 0);
      if (total !== OP_BATTLE_CONFIG.deckSize) {
        this.sendError(
          conn,
          `Deck invalide (${total}/${OP_BATTLE_CONFIG.deckSize} cartes).`,
        );
        conn.close();
        return;
      }

      // Expand + shuffle.
      const deck: DeckCard[] = [];
      for (const c of deckRow.cards ?? []) {
        for (let i = 0; i < c.count; i++) deck.push({ cardId: c.card_id });
      }
      shuffle(deck);

      // Pose les Vies (face cachée) selon la stat Vie du Leader.
      const leaderMeta = ONEPIECE_BASE_SET_BY_ID.get(deckRow.leader_id);
      const lifeCount =
        leaderMeta && leaderMeta.kind === "leader" ? leaderMeta.life : 5;
      const life: DeckCard[] = deck.splice(0, lifeCount);

      // Pioche initiale (5 cartes).
      const hand: DeckCard[] = deck.splice(0, OP_BATTLE_CONFIG.openingHandSize);

      this.seats[seatId] = {
        authId,
        username,
        deckName: deckRow.name ?? null,
        conn,
        leaderId: deckRow.leader_id,
        leaderRested: false,
        leaderAttachedDon: 0,
        characters: [],
        stage: null,
        deck,
        hand,
        life,
        discard: [],
        donDeck: OP_BATTLE_CONFIG.donDeckSize,
        donActive: 0,
        donRested: 0,
        mulliganDecided: false,
        tempPowerBuffs: new Map(),
        usedActivationsThisTurn: new Set(),
      };
      this.connToSeat.set(conn.id, seatId);

      // En mode bot : dès que p1 est seated, on remplit p2 avec le Bot Suprême
      // (mirror du même deck pour un match équilibré).
      if (this.botMode && seatId === "p1" && !this.seats.p2) {
        this.fillBotSeat(deckRow.cards ?? [], deckRow.leader_id);
      }
    } else {
      // Reconnexion (même authId).
      const existing = this.seats[seatId];
      if (existing) existing.conn = conn;
      this.connToSeat.set(conn.id, seatId);
    }

    this.sendTo(conn, {
      type: "op-welcome",
      selfId: conn.id,
      selfSeat: seatId,
    });

    // Si les 2 sièges sont remplis et qu'on attendait, on passe en mulligan.
    if (this.phase === "waiting" && this.seats.p1 && this.seats.p2) {
      this.phase = "mulligan";
      this.pushLog("Les deux joueurs sont prêts. Mulligan…");
    }
    this.broadcastState();
  }

  async onMessage(raw: string, sender: Party.Connection) {
    let data: OnePieceBattleClientMessage;
    try {
      data = JSON.parse(raw) as OnePieceBattleClientMessage;
    } catch {
      return;
    }
    const seatId = this.connToSeat.get(sender.id);
    if (!seatId) return;

    if (data.type === "chat") {
      this.handleChat(seatId, data.text);
      return;
    }
    if (data.type === "op-concede") {
      this.handleConcede(seatId);
      return;
    }
    if (data.type === "op-mulligan") {
      this.handleMulligan(sender, seatId, data.take);
      return;
    }
    if (data.type === "op-play-character") {
      this.handlePlayCharacter(sender, seatId, data.handIndex);
      return;
    }
    if (data.type === "op-play-event") {
      this.handlePlayEvent(sender, seatId, data.handIndex);
      return;
    }
    if (data.type === "op-play-stage") {
      this.handlePlayStage(sender, seatId, data.handIndex);
      return;
    }
    if (data.type === "op-attach-don") {
      this.handleAttachDon(sender, seatId, data.targetUid);
      return;
    }
    if (data.type === "op-attack") {
      this.handleAttack(sender, seatId, data.attackerUid, data.targetUid);
      return;
    }
    if (data.type === "op-block") {
      this.handleBlock(sender, seatId, data.blockerUid);
      return;
    }
    if (data.type === "op-counter") {
      this.handleCounter(sender, seatId, data.handIndex);
      return;
    }
    if (data.type === "op-pass-defense") {
      this.handlePassDefense(sender, seatId);
      return;
    }
    if (data.type === "op-trigger-resolve") {
      this.handleTriggerResolve(sender, seatId, data.activate);
      return;
    }
    if (data.type === "op-resolve-choice") {
      this.handleResolveChoice(
        sender,
        seatId,
        data.choiceId,
        data.skipped,
        data.selection ?? {},
      );
      return;
    }
    if (data.type === "op-activate-main") {
      this.handleActivateMain(sender, seatId, data.uid);
      return;
    }
    if (data.type === "op-end-turn") {
      this.handleEndTurn(sender, seatId);
      return;
    }
    this.sendError(sender, "Action non reconnue.");
  }

  onClose(conn: Party.Connection) {
    const seatId = this.connToSeat.get(conn.id);
    if (seatId) {
      const seat = this.seats[seatId];
      if (seat && seat.conn === conn) seat.conn = null;
    }
    this.connToSeat.delete(conn.id);
  }

  // ─── Actions implémentées ────────────────────────────────────────────────

  private handleChat(seatId: OnePieceBattleSeatId, text: string) {
    if (typeof text !== "string") return;
    const seat = this.seats[seatId];
    if (!seat) return;
    const trimmed = text.trim().slice(0, 200);
    if (!trimmed) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      playerId: seat.authId,
      playerName: seat.username,
      text: trimmed,
      timestamp: Date.now(),
    };
    this.broadcast({ type: "chat", message: msg });
  }

  private handleConcede(seatId: OnePieceBattleSeatId) {
    if (this.phase === "ended") return;
    const winner: OnePieceBattleSeatId = seatId === "p1" ? "p2" : "p1";
    this.declareWinner(winner, `${seatNameFromSeat(this.seats, seatId)} abandonne`);
  }

  /** Mulligan : 1× max par joueur. Si take=true, on remet la main au fond du
   *  deck, on shuffle et on repioche 5 cartes. Si false, on garde. Une fois
   *  les 2 joueurs décidés, on tire au sort qui commence et on passe en
   *  playing. */
  private handleMulligan(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
    take: boolean,
  ) {
    if (this.phase !== "mulligan") {
      this.sendError(conn, "Pas en phase de mulligan.");
      return;
    }
    const seat = this.seats[seatId];
    if (!seat) return;
    if (seat.mulliganDecided) {
      this.sendError(conn, "Tu as déjà décidé pour le mulligan.");
      return;
    }
    if (take) {
      // Refait la main : remet les 5 cartes dans le deck + shuffle + retire 5.
      seat.deck.push(...seat.hand);
      seat.hand = [];
      shuffle(seat.deck);
      seat.hand = seat.deck.splice(0, OP_BATTLE_CONFIG.openingHandSize);
      this.pushLog(`${seat.username} fait un mulligan.`);
    } else {
      this.pushLog(`${seat.username} garde sa main.`);
    }
    seat.mulliganDecided = true;

    // Si les 2 ont décidé : transition vers playing.
    if (this.seats.p1?.mulliganDecided && this.seats.p2?.mulliganDecided) {
      this.startGame();
    } else {
      this.broadcastState();
    }
  }

  /** Transition mulligan → playing : tire au sort qui commence, démarre le
   *  tour 1 sans broadcast (nextTurn s'en charge). */
  private startGame() {
    this.phase = "playing";
    this.activeSeat = Math.random() < 0.5 ? "p1" : "p2";
    this.turnNumber = 0; // sera incrémenté à 1 par nextTurn
    this.runTurnStartPhases(this.activeSeat, true /* isFirstTurnEver */);
    this.broadcastState();
  }

  /** Déroule les phases de début de tour (refresh → draw → don) puis place
   *  le tour en `main`. isFirstTurnEver = true pour le tout premier tour
   *  du joueur 1 (pas de pioche, 1 DON au lieu de 2). */
  private runTurnStartPhases(
    seatId: OnePieceBattleSeatId,
    isFirstTurnEver: boolean,
  ) {
    const seat = this.seats[seatId];
    if (!seat) return;
    this.turnNumber++;

    // Refresh : redresse Leader, Persos en jeu, et toutes les DON épuisées.
    this.turnPhase = "refresh";
    seat.leaderRested = false;
    for (const c of seat.characters) {
      c.rested = false;
      c.playedThisTurn = false;
    }
    if (seat.stage) {
      seat.stage.rested = false;
      seat.stage.playedThisTurn = false;
    }
    seat.donActive += seat.donRested;
    seat.donRested = 0;

    // Draw : pioche 1 (sauf 1er tour ever).
    this.turnPhase = "draw";
    if (!isFirstTurnEver && seat.deck.length > 0) {
      const card = seat.deck.shift()!;
      seat.hand.push(card);
    }

    // DON : ajoute 1 (1er tour ever) ou 2 (sinon) DON depuis le DON deck.
    this.turnPhase = "don";
    const donAdded = isFirstTurnEver ? 1 : 2;
    const taken = Math.min(donAdded, seat.donDeck);
    seat.donDeck -= taken;
    seat.donActive += taken;

    // Main phase.
    this.turnPhase = "main";
    this.pushLog(
      `Tour ${this.turnNumber} — ${seat.username} (${
        isFirstTurnEver ? "1er tour : 1 DON, pas de pioche" : `+1 carte, +${taken} DON`
      }).`,
    );
  }

  /** Joue un Personnage depuis la main : paie le coût en épuisant des DON
   *  actives, retire la carte de la main, ajoute aux Personnages en jeu. */
  private handlePlayCharacter(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
    handIndex: number,
  ) {
    if (this.phase !== "playing") {
      this.sendError(conn, "Pas en phase de jeu.");
      return;
    }
    if (this.activeSeat !== seatId) {
      this.sendError(conn, "Ce n'est pas ton tour.");
      return;
    }
    if (this.turnPhase !== "main") {
      this.sendError(conn, "Tu ne peux jouer une carte qu'en phase principale.");
      return;
    }
    const seat = this.seats[seatId];
    if (!seat) return;
    const handCard = seat.hand[handIndex];
    if (!handCard) {
      this.sendError(conn, "Carte invalide.");
      return;
    }
    const meta = ONEPIECE_BASE_SET_BY_ID.get(handCard.cardId);
    if (!meta) {
      this.sendError(conn, "Carte inconnue.");
      return;
    }
    if (meta.kind !== "character") {
      this.sendError(
        conn,
        "Tu peux seulement jouer des Personnages avec cette action (Évents/Lieux : Phase 3c-bis).",
      );
      return;
    }
    if (seat.characters.length >= OP_BATTLE_CONFIG.maxCharacters) {
      this.sendError(
        conn,
        `Terrain plein (${OP_BATTLE_CONFIG.maxCharacters} Personnages max).`,
      );
      return;
    }
    if (seat.donActive < meta.cost) {
      this.sendError(
        conn,
        `Coût ${meta.cost} > DON disponibles (${seat.donActive}).`,
      );
      return;
    }
    // Paye le coût : épuise N DON actives.
    seat.donActive -= meta.cost;
    seat.donRested += meta.cost;
    // Retire de la main.
    seat.hand.splice(handIndex, 1);
    // Ajoute au terrain. Une carte arrive redressée mais ne peut pas attaquer
    // ce tour (sauf [Initiative] — moteur d'effets en Phase 3e).
    const newCard: OnePieceBattleCardInPlay = {
      uid: `c${++this.uidCounter}`,
      cardId: handCard.cardId,
      attachedDon: 0,
      rested: false,
      playedThisTurn: true,
    };
    seat.characters.push(newCard);
    this.pushLog(
      `${seat.username} joue ${meta.name} (coût ${meta.cost}, ${seat.donActive} DON restantes).`,
    );
    // Hook on-play : déclenche l'effet [Jouée] s'il est implémenté.
    this.fireEffectFor(handCard.cardId, "on-play", newCard.uid, seatId);
    this.broadcastState();
  }

  /** Attache une DON active au Leader ou à un Personnage en jeu. La DON
   *  passe en "attachée" sur la cible (boost +1000 power). À la fin du tour
   *  toutes les DON attachées retournent dans la zone DON épuisée. */
  private handleAttachDon(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
    targetUid: string,
  ) {
    if (this.phase !== "playing") {
      this.sendError(conn, "Pas en phase de jeu.");
      return;
    }
    if (this.activeSeat !== seatId) {
      this.sendError(conn, "Ce n'est pas ton tour.");
      return;
    }
    if (this.turnPhase !== "main") {
      this.sendError(conn, "Attache des DON uniquement en phase principale.");
      return;
    }
    const seat = this.seats[seatId];
    if (!seat) return;
    if (seat.donActive < 1) {
      this.sendError(conn, "Aucune DON active disponible.");
      return;
    }
    if (targetUid === "leader") {
      if (!seat.leaderId) {
        this.sendError(conn, "Pas de Leader.");
        return;
      }
      seat.donActive--;
      seat.leaderAttachedDon++;
      this.pushLog(`${seat.username} attache 1 DON à son Leader.`);
    } else {
      const target = seat.characters.find((c) => c.uid === targetUid);
      if (!target) {
        this.sendError(conn, "Cible invalide.");
        return;
      }
      seat.donActive--;
      target.attachedDon++;
      const meta = ONEPIECE_BASE_SET_BY_ID.get(target.cardId);
      this.pushLog(
        `${seat.username} attache 1 DON à ${meta?.name ?? "?"}.`,
      );
    }
    this.broadcastState();
  }

  /** Fin de tour : détache toutes les DON attachées (retournent en DON
   *  épuisée), reset les flags du tour, passe au joueur suivant. */
  private handleEndTurn(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
  ) {
    if (this.phase !== "playing") {
      this.sendError(conn, "Pas en phase de jeu.");
      return;
    }
    if (this.activeSeat !== seatId) {
      this.sendError(conn, "Ce n'est pas ton tour.");
      return;
    }
    const seat = this.seats[seatId];
    if (!seat) return;

    // End phase : détache les DON, retournent dans la pool DON épuisée.
    this.turnPhase = "end";
    // Hook on-turn-end : effets [Fin de votre tour] des cartes en jeu.
    if (seat.leaderId) {
      this.fireEffectFor(seat.leaderId, "on-turn-end", "leader", seatId);
    }
    for (const c of seat.characters) {
      this.fireEffectFor(c.cardId, "on-turn-end", c.uid, seatId);
    }
    const detached = seat.leaderAttachedDon;
    seat.donRested += seat.leaderAttachedDon;
    seat.leaderAttachedDon = 0;
    let charDetached = 0;
    for (const c of seat.characters) {
      seat.donRested += c.attachedDon;
      charDetached += c.attachedDon;
      c.attachedDon = 0;
    }
    if (detached + charDetached > 0) {
      this.pushLog(
        `${seat.username} détache ${detached + charDetached} DON (fin de tour).`,
      );
    }
    // Reset des buffs temporaires des deux seats : les effets "pour tout le
    // tour" expirent à la fin du tour de l'attaquant (convention courante).
    seat.tempPowerBuffs.clear();
    seat.usedActivationsThisTurn.clear();
    for (const c of seat.characters) c.costBuff = 0;
    const opponentSeat = seatId === "p1" ? "p2" : "p1";
    this.seats[opponentSeat]?.tempPowerBuffs.clear();
    if (this.seats[opponentSeat]) {
      for (const c of this.seats[opponentSeat]!.characters) c.costBuff = 0;
    }
    this.pushLog(`${seat.username} termine son tour.`);

    // Passe au joueur suivant.
    const nextSeat: OnePieceBattleSeatId = seatId === "p1" ? "p2" : "p1";
    if (this.seats[nextSeat]) {
      this.activeSeat = nextSeat;
      this.runTurnStartPhases(nextSeat, false);
    }
    this.broadcastState();
  }

  /** Joue un Évènement : paie le coût en DON, retire de la main, va à la
   *  défausse. L'effet de la carte n'est pas exécuté (descriptif, voir
   *  prose sur la carte). */
  private handlePlayEvent(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
    handIndex: number,
  ) {
    if (!this.requireMyTurnAndMain(conn, seatId)) return;
    const seat = this.seats[seatId]!;
    const handCard = seat.hand[handIndex];
    if (!handCard) {
      this.sendError(conn, "Carte invalide.");
      return;
    }
    const meta = ONEPIECE_BASE_SET_BY_ID.get(handCard.cardId);
    if (!meta || meta.kind !== "event") {
      this.sendError(conn, "Cette carte n'est pas un Évènement.");
      return;
    }
    if (seat.donActive < meta.cost) {
      this.sendError(
        conn,
        `Coût ${meta.cost} > DON disponibles (${seat.donActive}).`,
      );
      return;
    }
    seat.donActive -= meta.cost;
    seat.donRested += meta.cost;
    seat.hand.splice(handIndex, 1);
    seat.discard.push(handCard);
    this.pushLog(
      `${seat.username} joue l'Évènement ${meta.name} (effet descriptif uniquement).`,
    );
    this.broadcastState();
  }

  /** Joue un Lieu : paie le coût, le Lieu actuel (s'il y en a un) va à la
   *  défausse, le nouveau Lieu prend sa place. */
  private handlePlayStage(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
    handIndex: number,
  ) {
    if (!this.requireMyTurnAndMain(conn, seatId)) return;
    const seat = this.seats[seatId]!;
    const handCard = seat.hand[handIndex];
    if (!handCard) {
      this.sendError(conn, "Carte invalide.");
      return;
    }
    const meta = ONEPIECE_BASE_SET_BY_ID.get(handCard.cardId);
    if (!meta || meta.kind !== "stage") {
      this.sendError(conn, "Cette carte n'est pas un Lieu.");
      return;
    }
    if (seat.donActive < meta.cost) {
      this.sendError(
        conn,
        `Coût ${meta.cost} > DON disponibles (${seat.donActive}).`,
      );
      return;
    }
    seat.donActive -= meta.cost;
    seat.donRested += meta.cost;
    seat.hand.splice(handIndex, 1);
    // Lieu actuel à la défausse.
    if (seat.stage) {
      seat.discard.push({ cardId: seat.stage.cardId });
    }
    seat.stage = {
      uid: `s${++this.uidCounter}`,
      cardId: handCard.cardId,
      attachedDon: 0,
      rested: false,
      playedThisTurn: true,
    };
    this.pushLog(`${seat.username} joue le Lieu ${meta.name}.`);
    this.broadcastState();
  }

  /** Lance une attaque : valide source/cible, calcule la puissance, ouvre
   *  la fenêtre de défense (pendingAttack). L'adversaire peut Bloquer,
   *  Counter, ou Passer. */
  private handleAttack(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
    attackerUid: string,
    targetUid: string,
  ) {
    if (this.phase !== "playing") {
      this.sendError(conn, "Pas en phase de jeu.");
      return;
    }
    if (this.activeSeat !== seatId) {
      this.sendError(conn, "Ce n'est pas ton tour.");
      return;
    }
    if (this.turnPhase !== "main") {
      this.sendError(conn, "Tu ne peux attaquer qu'en phase principale.");
      return;
    }
    if (this.pendingAttack || this.pendingTrigger) {
      this.sendError(conn, "Une autre action est en cours.");
      return;
    }
    const seat = this.seats[seatId]!;
    const opponentSeatId: OnePieceBattleSeatId =
      seatId === "p1" ? "p2" : "p1";
    const opponent = this.seats[opponentSeatId];
    if (!opponent) {
      this.sendError(conn, "Pas d'adversaire.");
      return;
    }

    // Règle officielle : joueur 1 ne peut pas attaquer au tour 1.
    if (this.turnNumber === 1) {
      this.sendError(
        conn,
        "Le premier joueur ne peut pas attaquer au tour 1 (règle officielle).",
      );
      return;
    }

    // Source : Leader ou Personnage côté seat. Doit être redressée et ne pas
    // avoir été posée ce tour (sauf [Initiative]).
    let attackerPower = 0;
    let attackerName = "";
    let attackerHasInitiative = false;
    let attackerHasDoubleAttack = false;
    if (attackerUid === "leader") {
      if (!seat.leaderId) {
        this.sendError(conn, "Pas de Leader.");
        return;
      }
      if (seat.leaderRested) {
        this.sendError(conn, "Ton Leader est épuisé.");
        return;
      }
      const meta = ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId);
      if (!meta || meta.kind !== "leader") {
        this.sendError(conn, "Leader introuvable.");
        return;
      }
      attackerPower = meta.power + seat.leaderAttachedDon * 1000;
      attackerName = meta.name;
      attackerHasDoubleAttack = this.cardHasKeyword(
        seatId,
        "leader",
        seat.leaderId!,
        "Double Attaque",
      );
    } else {
      const c = seat.characters.find((x) => x.uid === attackerUid);
      if (!c) {
        this.sendError(conn, "Attaquant invalide.");
        return;
      }
      if (c.rested) {
        this.sendError(conn, "Ce Personnage est épuisé.");
        return;
      }
      const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
      if (!meta || meta.kind !== "character") {
        this.sendError(conn, "Personnage invalide.");
        return;
      }
      attackerHasInitiative = this.cardHasKeyword(
        seatId,
        c.uid,
        c.cardId,
        "Initiative",
      );
      attackerHasDoubleAttack = this.cardHasKeyword(
        seatId,
        c.uid,
        c.cardId,
        "Double Attaque",
      );
      if (c.playedThisTurn && !attackerHasInitiative) {
        this.sendError(
          conn,
          "Ce Personnage a été posé ce tour et n'a pas [Initiative].",
        );
        return;
      }
      attackerPower = meta.power + c.attachedDon * 1000;
      attackerName = meta.name;
    }

    // Cible : Leader (toujours) ou Personnage adverse épuisé (rested).
    let defenderBasePower = 0;
    let defenderName = "";
    if (targetUid === "leader") {
      if (!opponent.leaderId) {
        this.sendError(conn, "Pas de Leader adverse.");
        return;
      }
      const meta = ONEPIECE_BASE_SET_BY_ID.get(opponent.leaderId);
      if (!meta || meta.kind !== "leader") {
        this.sendError(conn, "Leader adverse introuvable.");
        return;
      }
      defenderBasePower = meta.power + opponent.leaderAttachedDon * 1000;
      defenderName = meta.name;
    } else {
      const c = opponent.characters.find((x) => x.uid === targetUid);
      if (!c) {
        this.sendError(conn, "Cible invalide.");
        return;
      }
      if (!c.rested) {
        this.sendError(
          conn,
          "Tu peux seulement attaquer un Personnage adverse épuisé (ou le Leader).",
        );
        return;
      }
      const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
      if (!meta || meta.kind !== "character") {
        this.sendError(conn, "Personnage adverse invalide.");
        return;
      }
      defenderBasePower = meta.power + c.attachedDon * 1000;
      defenderName = meta.name;
    }

    // Épuise l'attaquant immédiatement (même si l'attaque rate plus tard).
    if (attackerUid === "leader") seat.leaderRested = true;
    else {
      const c = seat.characters.find((x) => x.uid === attackerUid)!;
      c.rested = true;
    }

    // Hook on-attack : applique les buffs avant le calcul final.
    const sourceCardId =
      attackerUid === "leader"
        ? seat.leaderId!
        : seat.characters.find((c) => c.uid === attackerUid)?.cardId;
    if (sourceCardId) {
      this.fireEffectFor(sourceCardId, "on-attack", attackerUid, seatId);
    }
    // Ré-ajoute les buffs temporaires sur l'attaquant après l'effet on-attack.
    attackerPower += this.getPowerBuff(seatId, attackerUid);

    // Le défenseur peut aussi avoir des buffs temporaires (ex: Leader Shanks
    // qui inflige -1000 à l'adversaire). On les applique au defenderBasePower.
    defenderBasePower += this.getPowerBuff(opponentSeatId, targetUid);

    // Applique les modificateurs passifs de toutes les cartes en jeu.
    const attackerRef: CardRef =
      attackerUid === "leader"
        ? { kind: "leader", seat: seatId }
        : { kind: "character", seat: seatId, uid: attackerUid };
    const defenderRef: CardRef =
      targetUid === "leader"
        ? { kind: "leader", seat: opponentSeatId }
        : { kind: "character", seat: opponentSeatId, uid: targetUid };
    attackerPower += this.applyPassivesTo(attackerRef, "attack");
    defenderBasePower += this.applyPassivesTo(defenderRef, "defend");

    // Ouvre la defense window.
    this.pendingAttack = {
      attackerSeat: seatId,
      attackerUid,
      targetUid,
      attackerPower,
      defenderBasePower,
      defenderBoost: 0,
      doubleAttack: attackerHasDoubleAttack,
    };
    this.pushLog(
      `${seat.username} : ${attackerName} (${attackerPower}) attaque ${defenderName} (${defenderBasePower})${attackerHasDoubleAttack ? " — Double Attaque" : ""}.`,
    );
    void attackerHasInitiative; // utilisé juste pour la validation
    this.broadcastState();
  }

  /** Bloqueur : redirige l'attaque vers un Personnage avec [Bloqueur]. Le
   *  bloqueur devient la nouvelle cible et est épuisé. Le défenseur peut
   *  encore Counter avant la résolution. */
  private handleBlock(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
    blockerUid: string,
  ) {
    if (!this.pendingAttack) {
      this.sendError(conn, "Aucune attaque en cours.");
      return;
    }
    if (this.pendingAttack.attackerSeat === seatId) {
      this.sendError(conn, "Tu ne peux pas bloquer ta propre attaque.");
      return;
    }
    const seat = this.seats[seatId]!;
    const blocker = seat.characters.find((c) => c.uid === blockerUid);
    if (!blocker) {
      this.sendError(conn, "Bloqueur invalide.");
      return;
    }
    const meta = ONEPIECE_BASE_SET_BY_ID.get(blocker.cardId);
    if (
      !meta ||
      !this.cardHasKeyword(seatId, blocker.uid, blocker.cardId, "Bloqueur")
    ) {
      this.sendError(conn, "Ce Personnage n'a pas [Bloqueur].");
      return;
    }
    if (blocker.rested) {
      this.sendError(conn, "Ce Bloqueur est déjà épuisé.");
      return;
    }
    if (this.pendingAttack.targetUid === blockerUid) {
      this.sendError(conn, "Ce Bloqueur est déjà la cible.");
      return;
    }
    // Redirige l'attaque + épuise le bloqueur. Recalcule defenderBasePower
    // (base + DON + temp buffs + passifs sur le nouveau défenseur).
    blocker.rested = true;
    if ("power" in meta) {
      this.pendingAttack.targetUid = blockerUid;
      let blockerPower = meta.power + blocker.attachedDon * 1000;
      blockerPower += this.getPowerBuff(seatId, blockerUid);
      blockerPower += this.applyPassivesTo(
        { kind: "character", seat: seatId, uid: blockerUid },
        "defend",
      );
      this.pendingAttack.defenderBasePower = blockerPower;
    }
    this.pushLog(
      `${seat.username} bloque avec ${meta.name} (${this.pendingAttack.defenderBasePower}).`,
    );
    this.broadcastState();
  }

  /** Counter : joue une carte de la main avec valeur counter > 0 pour
   *  booster la puissance défensive. La carte va à la défausse. */
  private handleCounter(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
    handIndex: number,
  ) {
    if (!this.pendingAttack) {
      this.sendError(conn, "Aucune attaque en cours.");
      return;
    }
    if (this.pendingAttack.attackerSeat === seatId) {
      this.sendError(conn, "Tu ne peux pas counter ta propre attaque.");
      return;
    }
    const seat = this.seats[seatId]!;
    const card = seat.hand[handIndex];
    if (!card) {
      this.sendError(conn, "Carte invalide.");
      return;
    }
    const meta = ONEPIECE_BASE_SET_BY_ID.get(card.cardId);
    if (!meta) {
      this.sendError(conn, "Carte inconnue.");
      return;
    }
    const counterValue =
      "counter" in meta && meta.counter && meta.counter > 0 ? meta.counter : 0;
    if (counterValue <= 0) {
      this.sendError(conn, "Cette carte n'a pas de Counter.");
      return;
    }
    seat.hand.splice(handIndex, 1);
    seat.discard.push(card);
    this.pendingAttack.defenderBoost += counterValue;
    this.pushLog(
      `${seat.username} joue Counter ${meta.name} (+${counterValue}).`,
    );
    this.broadcastState();
  }

  /** Passe la défense : déclenche la résolution de l'attaque. */
  private handlePassDefense(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
  ) {
    if (!this.pendingAttack) {
      this.sendError(conn, "Aucune attaque en cours.");
      return;
    }
    if (this.pendingAttack.attackerSeat === seatId) {
      this.sendError(conn, "Tu ne peux pas passer ta propre attaque.");
      return;
    }
    this.resolveAttack();
  }

  /** Résout l'attaque pendante : Power vs Power final, KO ou Vie prise.
   *  Si une Vie est révélée et a un Trigger → ouvre pendingTrigger. */
  private resolveAttack() {
    const att = this.pendingAttack;
    if (!att) return;
    const attackerSeat = this.seats[att.attackerSeat]!;
    const defenderSeatId: OnePieceBattleSeatId =
      att.attackerSeat === "p1" ? "p2" : "p1";
    const defender = this.seats[defenderSeatId]!;

    const totalDefenderPower = att.defenderBasePower + att.defenderBoost;
    const success = att.attackerPower >= totalDefenderPower;

    if (!success) {
      this.pushLog(
        `Attaque ratée (${att.attackerPower} < ${totalDefenderPower}).`,
      );
      this.pendingAttack = null;
      this.broadcastState();
      return;
    }

    this.pushLog(
      `Attaque réussie (${att.attackerPower} ≥ ${totalDefenderPower}).`,
    );

    if (att.targetUid === "leader") {
      // Leader hit → prend des Vies (1 ou 2 si Double Attaque).
      const lifesToTake = att.doubleAttack ? 2 : 1;
      this.pendingAttack = null;
      this.takeLives(defenderSeatId, lifesToTake);
    } else {
      // Personnage hit → KO (sauf immunité combat).
      const idx = defender.characters.findIndex((c) => c.uid === att.targetUid);
      if (idx >= 0) {
        const target = defender.characters[idx];
        const blocked = isKoBlocked(
          { seat: defenderSeatId, uid: target.uid, cardId: target.cardId },
          "combat",
          this.getBattleAccess(),
        );
        if (blocked) {
          const meta = ONEPIECE_BASE_SET_BY_ID.get(target.cardId);
          this.pushLog(
            `${meta?.name ?? "?"} résiste au KO (immunité combat).`,
          );
        } else {
          const ko = defender.characters.splice(idx, 1)[0];
          defender.donRested += ko.attachedDon;
          defender.discard.push({ cardId: ko.cardId });
          const meta = ONEPIECE_BASE_SET_BY_ID.get(ko.cardId);
          this.pushLog(`${meta?.name ?? "?"} est mis KO.`);
          this.fireEffectFor(ko.cardId, "on-ko", ko.uid, defenderSeatId);
          // Notifie tous les listeners on-leave-field (ex. Thousand Sunny).
          fireOnLeaveField(
            { seat: defenderSeatId, uid: ko.uid, cardId: ko.cardId },
            "ko-combat",
            this.getBattleAccess(),
          );
        }
      }
      this.pendingAttack = null;
      this.broadcastState();
    }
    void attackerSeat;
  }

  /** Le défenseur prend N Vies. Pour chaque Vie, si trigger → pendingTrigger
   *  (résolu par le défenseur via op-trigger-resolve). Sinon va direct à la
   *  main. Si Vie à 0 et il faut en prendre encore → défaite. */
  private takeLives(defenderSeatId: OnePieceBattleSeatId, count: number) {
    const defender = this.seats[defenderSeatId]!;
    for (let i = 0; i < count; i++) {
      if (defender.life.length === 0) {
        // Vie à 0 et on essaie d'en prendre une → game over.
        this.declareWinner(
          defenderSeatId === "p1" ? "p2" : "p1",
          `${defender.username} : Vies à 0`,
        );
        return;
      }
      const lifeCard = defender.life.shift()!;
      const meta = ONEPIECE_BASE_SET_BY_ID.get(lifeCard.cardId);
      const trigger = meta?.trigger ?? null;
      this.pushLog(
        `${defender.username} prend une Vie (${meta?.name ?? "?"})${trigger ? " — Trigger révélé !" : ""}.`,
      );
      // Notif privée au défenseur du contenu de la Vie révélée.
      if (defender.conn) {
        this.sendTo(defender.conn, {
          type: "op-trigger-reveal",
          cardId: lifeCard.cardId,
          trigger,
        });
      }
      if (trigger) {
        // On pause la résolution : le défenseur choisit activer/passer.
        this.pendingTrigger = {
          defenderSeat: defenderSeatId,
          cardId: lifeCard.cardId,
          trigger,
        };
        // La carte va à la main du défenseur quoi qu'il arrive.
        defender.hand.push(lifeCard);
        this.broadcastState();
        return; // attendre op-trigger-resolve avant de continuer
      }
      defender.hand.push(lifeCard);
    }
    this.broadcastState();
  }

  /** Le défenseur a choisi : active=true → effet déclenché (descriptif,
   *  loggé), false → ignore. Dans tous les cas la Vie est déjà dans sa
   *  main. */
  private handleTriggerResolve(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
    activate: boolean,
  ) {
    if (!this.pendingTrigger) {
      this.sendError(conn, "Aucun Trigger en attente.");
      return;
    }
    if (this.pendingTrigger.defenderSeat !== seatId) {
      this.sendError(conn, "Ce n'est pas ton Trigger.");
      return;
    }
    const meta = ONEPIECE_BASE_SET_BY_ID.get(this.pendingTrigger.cardId);
    if (activate) {
      this.pushLog(
        `Trigger activé : ${meta?.name ?? "?"} — effet descriptif (non exécuté par le moteur).`,
      );
    } else {
      this.pushLog(`Trigger ignoré : ${meta?.name ?? "?"}.`);
    }
    this.pendingTrigger = null;
    this.broadcastState();
  }

  /** Active manuellement un effet [Activation : Principale] sur une carte
   *  en jeu (Leader ou Persos). Si l'effet a [Une fois par tour], on
   *  marque la carte pour empêcher la ré-activation. */
  private handleActivateMain(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
    uid: string,
  ) {
    if (this.phase !== "playing") {
      this.sendError(conn, "Pas en phase de jeu.");
      return;
    }
    if (this.activeSeat !== seatId) {
      this.sendError(conn, "Ce n'est pas ton tour.");
      return;
    }
    if (this.turnPhase !== "main") {
      this.sendError(conn, "Activation possible seulement en phase principale.");
      return;
    }
    if (this.pendingAttack || this.pendingTrigger || this.pendingChoice) {
      this.sendError(conn, "Une autre action est en cours.");
      return;
    }
    const seat = this.seats[seatId];
    if (!seat) return;

    // Identifie le cardId de la cible.
    let cardId: string | null = null;
    if (uid === "leader") {
      cardId = seat.leaderId;
    } else {
      const c = seat.characters.find((x) => x.uid === uid);
      if (c) cardId = c.cardId;
    }
    if (!cardId) {
      this.sendError(conn, "Cible d'activation invalide.");
      return;
    }
    const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
    if (!meta || !meta.effect) {
      this.sendError(conn, "Cette carte n'a pas d'effet activable.");
      return;
    }
    // Vérifie que l'effet contient [Activation : Principale].
    if (!/\[Activation\s*:\s*Principale\]/i.test(meta.effect)) {
      this.sendError(
        conn,
        "Cette carte n'a pas [Activation : Principale].",
      );
      return;
    }
    // Vérifie [Une fois par tour].
    const oncePerTurn = /\[Une fois par tour\]/i.test(meta.effect);
    if (oncePerTurn && seat.usedActivationsThisTurn.has(uid)) {
      this.sendError(conn, "Cet effet a déjà été utilisé ce tour.");
      return;
    }
    // Pour les Persos, vérifier qu'ils ne sont pas épuisés (la plupart des
    // [Activation] demandent d'épuiser la carte, mais le coût exact est
    // décrit dans la prose — laissé au handler).
    seat.usedActivationsThisTurn.add(uid);
    this.fireEffectFor(cardId, "on-activate-main", uid, seatId);
    this.broadcastState();
  }

  /** Résolution d'un PendingChoice : valide le seat, ré-appelle le handler
   *  de la card source avec hook 'on-choice-resolved'. Si skipped=true,
   *  l'effet est simplement annulé (rien à faire). */
  private handleResolveChoice(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
    choiceId: string,
    skipped: boolean,
    selection: ChoiceSelection,
  ) {
    const pending = this.pendingChoice;
    if (!pending) {
      this.sendError(conn, "Aucun choix en attente.");
      return;
    }
    if (pending.id !== choiceId) {
      this.sendError(conn, "Choix obsolète.");
      return;
    }
    if (pending.seat !== seatId) {
      this.sendError(conn, "Ce n'est pas à toi de choisir.");
      return;
    }
    // Reset avant d'appeler le handler (pour permettre la réouverture d'un
    // nouveau choix dans la suite de l'effet).
    const cardNumber = pending.sourceCardNumber;
    const sourceUid = pending.sourceUid;
    const sourceSeat = pending.seat;
    this.pendingChoice = null;

    if (skipped) {
      this.pushLog(`Effet ignoré (choix passé).`);
    }

    const handler = CARD_HANDLERS[cardNumber];
    if (handler) {
      try {
        handler({
          hook: "on-choice-resolved",
          sourceUid,
          sourceSeat,
          battle: this.getBattleAccess(),
          choice: { skipped, selection },
        });
      } catch (err) {
        console.warn(`[op-effect] resolve threw for ${cardNumber}:`, err);
      }
    }
    this.broadcastState();
  }

  /** Déclare un vainqueur et termine la partie. Persiste l'historique +
   *  ELO + quête bot via les helpers Supabase partagés avec battle.ts. */
  private declareWinner(winner: OnePieceBattleSeatId, reason: string) {
    this.winner = winner;
    this.phase = "ended";
    this.pendingAttack = null;
    this.pendingChoice = null;
    this.pendingTrigger = null;
    const loser: OnePieceBattleSeatId = winner === "p1" ? "p2" : "p1";
    this.pushLog(
      `🏁 Victoire ${this.seats[winner]?.username ?? winner} (${reason}).`,
    );
    this.broadcastState();

    // Quête bot (joueur humain bat le bot 3× pour 1 pack gratuit).
    if (this.botMode && !this.questRecorded && winner === "p1" && this.seats.p1) {
      this.questRecorded = true;
      const authId = this.seats.p1.authId;
      void recordBotWin(this.room, authId, "onepiece")
        .then((res) => {
          if (!res) return;
          const conn = this.seats.p1?.conn;
          if (conn) {
            // Réutilise le type Pokémon battle-quest-reward (générique : juste
            // botWins + granted).
            conn.send(
              JSON.stringify({
                type: "battle-quest-reward",
                botWins: res.bot_wins,
                granted: res.granted,
              }),
            );
          }
          if (res.granted) {
            this.pushLog(
              `🎁 Quête remplie ! ${this.seats.p1?.username} reçoit 1 booster gratuit.`,
            );
            this.broadcastState();
          }
        })
        .catch(() => {});
    }

    // PvP (fun ou ranked) : historique + ELO si ranked.
    if (
      !this.botMode &&
      !this.resultRecorded &&
      this.seats[winner] &&
      this.seats[loser]
    ) {
      this.resultRecorded = true;
      const w = this.seats[winner]!;
      const l = this.seats[loser]!;
      const ranked = this.rankedMode;
      void recordBattleResult(this.room, {
        gameId: "onepiece",
        winnerId: w.authId,
        loserId: l.authId,
        winnerUsername: w.username,
        loserUsername: l.username,
        winnerDeckName: w.deckName,
        loserDeckName: l.deckName,
        ranked,
        reason,
      })
        .then((res) => {
          if (!res || !ranked) return;
          this.pushLog(
            `📊 ELO — ${w.username} ${res.winner_elo_before}→${res.winner_elo_after} · ${l.username} ${res.loser_elo_before}→${res.loser_elo_after}.`,
          );
          this.broadcastState();
        })
        .catch(() => {});
    }
  }

  // ─── Bot Suprême ─────────────────────────────────────────────────────────

  /** Remplit p2 avec le Bot Suprême en utilisant un mirror du deck p1. */
  private fillBotSeat(
    deckCards: { card_id: string; count: number }[],
    leaderId: string,
  ) {
    const deck: DeckCard[] = [];
    for (const c of deckCards) {
      for (let i = 0; i < c.count; i++) deck.push({ cardId: c.card_id });
    }
    shuffle(deck);
    const leaderMeta = ONEPIECE_BASE_SET_BY_ID.get(leaderId);
    const lifeCount =
      leaderMeta && leaderMeta.kind === "leader" ? leaderMeta.life : 5;
    const life = deck.splice(0, lifeCount);
    const hand = deck.splice(0, OP_BATTLE_CONFIG.openingHandSize);
    this.seats.p2 = {
      authId: BOT_AUTH_ID,
      username: BOT_USERNAME,
      deckName: "Bot Mirror",
      conn: null,
      leaderId,
      leaderRested: false,
      leaderAttachedDon: 0,
      characters: [],
      stage: null,
      deck,
      hand,
      life,
      discard: [],
      donDeck: OP_BATTLE_CONFIG.donDeckSize,
      donActive: 0,
      donRested: 0,
      mulliganDecided: false,
      tempPowerBuffs: new Map(),
      usedActivationsThisTurn: new Set(),
    };
    if (this.phase === "waiting") this.phase = "mulligan";
  }

  /** Décide si le bot doit agir maintenant et planifie son action avec
   *  un petit délai pour la lisibilité. */
  private maybeBotAct() {
    if (!this.botMode) return;
    if (this.phase === "ended") return;
    if (this.botActScheduled) return;
    const bot = this.seats.p2;
    if (!bot || bot.authId !== BOT_AUTH_ID) return;

    let shouldAct = false;
    if (this.phase === "mulligan" && !bot.mulliganDecided) {
      shouldAct = true;
    } else if (this.phase === "playing") {
      if (this.pendingTrigger?.defenderSeat === "p2") shouldAct = true;
      else if (this.pendingAttack && this.pendingAttack.attackerSeat !== "p2")
        shouldAct = true;
      else if (this.activeSeat === "p2") shouldAct = true;
    }
    if (!shouldAct) return;

    this.botActScheduled = true;
    setTimeout(() => {
      this.botActScheduled = false;
      try {
        if (this.phase === "mulligan") this.botDoMulligan();
        else if (this.pendingTrigger?.defenderSeat === "p2")
          this.botResolveTrigger();
        else if (
          this.pendingAttack &&
          this.pendingAttack.attackerSeat !== "p2"
        )
          this.botDoDefense();
        else if (this.activeSeat === "p2") this.botPlayTurn();
      } catch (err) {
        console.warn("[op-bot] threw:", err);
      }
    }, BOT_ACTION_DELAY_MS);
  }

  private botDoMulligan() {
    const bot = this.seats.p2;
    if (!bot || bot.mulliganDecided) return;
    // Stratégie : mulligan si la main est trop chère (aucun Persos ≤ 2 OU
    // moins de 2 Persos ≤ 4). Sinon garde.
    let cheapCount = 0; // ≤ 2
    let earlyCount = 0; // ≤ 4
    for (const card of bot.hand) {
      const meta = ONEPIECE_BASE_SET_BY_ID.get(card.cardId);
      if (!meta || meta.kind !== "character") continue;
      if (meta.cost <= 2) cheapCount++;
      if (meta.cost <= 4) earlyCount++;
    }
    const shouldMulligan = cheapCount === 0 || earlyCount < 2;
    if (shouldMulligan) {
      bot.deck.push(...bot.hand);
      bot.hand = [];
      shuffle(bot.deck);
      bot.hand = bot.deck.splice(0, OP_BATTLE_CONFIG.openingHandSize);
      this.pushLog(`${bot.username} fait un mulligan (main trop chère).`);
    } else {
      this.pushLog(`${bot.username} garde sa main.`);
    }
    bot.mulliganDecided = true;
    if (this.seats.p1?.mulliganDecided) {
      this.startGame();
    } else {
      this.broadcastState();
    }
  }

  private botResolveTrigger() {
    if (!this.pendingTrigger) return;
    const meta = ONEPIECE_BASE_SET_BY_ID.get(this.pendingTrigger.cardId);
    // Le bot ignore systématiquement (l'effet n'est pas exécuté de toute
    // façon, donc activer ou non n'a pas d'impact mécanique aujourd'hui).
    this.pushLog(
      `${BOT_USERNAME} ignore le Trigger de ${meta?.name ?? "?"}.`,
    );
    this.pendingTrigger = null;
    this.broadcastState();
  }

  private botDoDefense() {
    const att = this.pendingAttack;
    if (!att) return;
    const bot = this.seats.p2!;

    // L'attaque toucherait-elle ?
    const totalDef = att.defenderBasePower + att.defenderBoost;
    const wouldHit = att.attackerPower >= totalDef;

    if (!wouldHit) {
      // Pas besoin de réagir, on passe.
      this.handlePassDefenseInternal();
      return;
    }

    // Cherche un Bloqueur disponible (Persos avec [Bloqueur] — text ou
    // grant dynamique —, rested=false, pas la cible actuelle).
    const blocker = bot.characters.find(
      (c) =>
        !c.rested &&
        c.uid !== att.targetUid &&
        this.cardHasKeyword("p2", c.uid, c.cardId, "Bloqueur"),
    );
    if (blocker) {
      // Bloque
      blocker.rested = true;
      const meta = ONEPIECE_BASE_SET_BY_ID.get(blocker.cardId);
      if (meta && "power" in meta) {
        att.targetUid = blocker.uid;
        att.defenderBasePower = meta.power + blocker.attachedDon * 1000;
      }
      this.pushLog(
        `${BOT_USERNAME} bloque avec ${meta?.name ?? "?"} (${att.defenderBasePower}).`,
      );
      // Recalcule wouldHit après le block — peut-être plus besoin de counter.
      const newTotalDef = att.defenderBasePower + att.defenderBoost;
      if (att.attackerPower < newTotalDef) {
        // L'attaque rate maintenant : on passe pour résoudre.
        this.broadcastState();
        setTimeout(() => this.handlePassDefenseInternal(), 400);
        return;
      }
      this.broadcastState();
      // Sinon on continue avec counter.
    }

    // Cherche un counter dans la main qui suffit pour faire rater.
    const target = att.attackerPower - (att.defenderBasePower + att.defenderBoost);
    if (target > 0) {
      // Trouve une carte counter qui ferait basculer.
      let bestIdx = -1;
      let bestVal = 0;
      for (let i = 0; i < bot.hand.length; i++) {
        const meta = ONEPIECE_BASE_SET_BY_ID.get(bot.hand[i].cardId);
        if (!meta) continue;
        const cv =
          "counter" in meta && meta.counter && meta.counter > 0
            ? meta.counter
            : 0;
        if (cv > 0 && cv > bestVal) {
          bestVal = cv;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestVal >= target) {
        // Joue ce counter pour faire rater
        const card = bot.hand.splice(bestIdx, 1)[0];
        bot.discard.push(card);
        att.defenderBoost += bestVal;
        const meta = ONEPIECE_BASE_SET_BY_ID.get(card.cardId);
        this.pushLog(
          `${BOT_USERNAME} joue Counter ${meta?.name ?? "?"} (+${bestVal}).`,
        );
        this.broadcastState();
        setTimeout(() => this.handlePassDefenseInternal(), 400);
        return;
      }
    }

    // Sinon, on passe.
    this.handlePassDefenseInternal();
  }

  /** Variante de handlePassDefense sans Connection (pour le bot). */
  private handlePassDefenseInternal() {
    if (!this.pendingAttack) return;
    this.resolveAttack();
  }

  private botPlayTurn() {
    const bot = this.seats.p2;
    if (!bot || this.phase !== "playing" || this.activeSeat !== "p2") return;

    // 1. Joue les Persos abordables (greedy : coût le plus élevé d'abord
    //    pour spend les DON efficacement).
    while (bot.characters.length < OP_BATTLE_CONFIG.maxCharacters) {
      let bestIdx = -1;
      let bestCost = -1;
      for (let i = 0; i < bot.hand.length; i++) {
        const meta = ONEPIECE_BASE_SET_BY_ID.get(bot.hand[i].cardId);
        if (!meta || meta.kind !== "character") continue;
        if (meta.cost > bot.donActive) continue;
        if (meta.cost > bestCost) {
          bestCost = meta.cost;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) break;
      const card = bot.hand[bestIdx];
      const meta = ONEPIECE_BASE_SET_BY_ID.get(card.cardId)!;
      if (meta.kind !== "character") break;
      bot.donActive -= meta.cost;
      bot.donRested += meta.cost;
      bot.hand.splice(bestIdx, 1);
      bot.characters.push({
        uid: `c${++this.uidCounter}`,
        cardId: card.cardId,
        attachedDon: 0,
        rested: false,
        playedThisTurn: true,
      });
      this.pushLog(`${bot.username} joue ${meta.name} (coût ${meta.cost}).`);
    }

    // 2. Attaque tant que possible (sauf tour 1) — avec DON-management
    //    intelligent : on attache des DON à un attaquant pour KO un Persos
    //    adverse rested si possible, sinon au Leader pour booster l'attaque
    //    Leader→Leader.
    const human = this.seats.p1;
    while (this.turnNumber > 1 && !this.pendingAttack && human) {
      // Liste des attaquants dispos (Leader + Persos redressés non-played
      // ou avec Initiative).
      type Attacker = {
        uid: string;
        basePower: number;
        attachedDon: number;
        meta: { name: string };
      };
      const attackers: Attacker[] = [];
      if (bot.leaderId && !bot.leaderRested) {
        const lm = ONEPIECE_BASE_SET_BY_ID.get(bot.leaderId);
        if (lm && lm.kind === "leader") {
          attackers.push({
            uid: "leader",
            basePower: lm.power,
            attachedDon: bot.leaderAttachedDon,
            meta: { name: lm.name },
          });
        }
      }
      for (const c of bot.characters) {
        if (c.rested) continue;
        const cm = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
        if (!cm || cm.kind !== "character") continue;
        const hasInit = this.cardHasKeyword(
          "p2",
          c.uid,
          c.cardId,
          "Initiative",
        );
        if (c.playedThisTurn && !hasInit) continue;
        attackers.push({
          uid: c.uid,
          basePower: cm.power,
          attachedDon: c.attachedDon,
          meta: { name: cm.name },
        });
      }
      if (attackers.length === 0) break;

      // Cibles potentielles : Persos rested adverses (KO = gain de tempo)
      // + Leader. On préfère KO un Persos coûteux (≥ 4) si possible.
      type Target = {
        uid: string;
        defenderPower: number;
        priority: number; // plus haut = mieux
        kind: "leader" | "character";
      };
      const targets: Target[] = [];
      if (human.leaderId) {
        const lm = ONEPIECE_BASE_SET_BY_ID.get(human.leaderId);
        if (lm && lm.kind === "leader") {
          targets.push({
            uid: "leader",
            defenderPower: lm.power + human.leaderAttachedDon * 1000,
            // Priorité Leader : modérée, on prend des Vies si rien de mieux.
            priority: 30,
            kind: "leader",
          });
        }
      }
      for (const c of human.characters) {
        if (!c.rested) continue;
        const cm = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
        if (!cm || cm.kind !== "character") continue;
        const dPower = cm.power + c.attachedDon * 1000;
        // Priorité Persos rested : très élevé si KO possible (gain tempo
        // + carte adverse défaussée).
        targets.push({
          uid: c.uid,
          defenderPower: dPower,
          priority: 50 + cm.cost * 10,
          kind: "character",
        });
      }

      // Choix attacker × target qui maximise un score : KO un Persos > toucher
      // Leader > rater. On peut attacher des DON pour augmenter le power.
      let bestPlan: {
        attacker: Attacker;
        target: Target;
        donToAttach: number;
        score: number;
      } | null = null;
      for (const att of attackers) {
        for (const tg of targets) {
          // Power requis pour toucher.
          const need = tg.defenderPower;
          const currentPower = att.basePower + att.attachedDon * 1000;
          let donNeeded = 0;
          if (currentPower < need) {
            donNeeded = Math.ceil((need - currentPower) / 1000);
            if (donNeeded > bot.donActive) continue; // pas assez de DON dispo
          }
          // Score : prioriser KO Persos coûteux, puis hits Leader, puis touché
          // tout court. On garde aussi des DON pour les attaques suivantes
          // donc on pénalise donNeeded.
          const willHit = currentPower + donNeeded * 1000 >= need;
          if (!willHit) continue;
          const score = tg.priority - donNeeded * 5 + att.attachedDon;
          if (!bestPlan || score > bestPlan.score) {
            bestPlan = {
              attacker: att,
              target: tg,
              donToAttach: donNeeded,
              score,
            };
          }
        }
      }
      if (!bestPlan) break;

      // Attache les DON nécessaires à l'attaquant choisi avant l'attaque.
      if (bestPlan.donToAttach > 0) {
        bot.donActive -= bestPlan.donToAttach;
        if (bestPlan.attacker.uid === "leader") {
          bot.leaderAttachedDon += bestPlan.donToAttach;
        } else {
          const c = bot.characters.find(
            (x) => x.uid === bestPlan!.attacker.uid,
          );
          if (c) c.attachedDon += bestPlan.donToAttach;
        }
        this.pushLog(
          `${bot.username} attache ${bestPlan.donToAttach} DON à ${bestPlan.attacker.meta.name}.`,
        );
      }

      this.botExecuteAttack(bestPlan.attacker.uid, bestPlan.target.uid);
      // Si une defense window humaine est ouverte, on stoppe — le tour
      // reprendra quand l'humain résoudra sa défense.
      if (this.pendingAttack) return;
    }

    // 3. Reste du DON ? Attache au Leader pour le tour suivant (réserve).
    if (bot.donActive > 0 && bot.leaderId) {
      const n = bot.donActive;
      bot.leaderAttachedDon += n;
      bot.donActive = 0;
      this.pushLog(`${bot.username} attache ${n} DON à son Leader (réserve).`);
    }

    // 4. Fin de tour automatique.
    this.botEndTurn();
  }

  /** Equivalent de handleAttack mais sans Connection (pour le bot). */
  private botExecuteAttack(attackerUid: string, targetUid: string) {
    if (this.pendingAttack || this.pendingTrigger) return;
    const seat = this.seats.p2!;
    const opponent = this.seats.p1;
    if (!opponent) return;
    if (this.turnNumber === 1) return;

    let attackerPower = 0;
    let attackerName = "";
    let attackerHasDoubleAttack = false;
    if (attackerUid === "leader") {
      if (!seat.leaderId || seat.leaderRested) return;
      const meta = ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId);
      if (!meta || meta.kind !== "leader") return;
      attackerPower = meta.power + seat.leaderAttachedDon * 1000;
      attackerName = meta.name;
      attackerHasDoubleAttack = this.cardHasKeyword(
        "p2",
        "leader",
        seat.leaderId,
        "Double Attaque",
      );
      seat.leaderRested = true;
    } else {
      const c = seat.characters.find((x) => x.uid === attackerUid);
      if (!c || c.rested) return;
      const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
      if (!meta || meta.kind !== "character") return;
      const hasInit = this.cardHasKeyword(
        "p2",
        c.uid,
        c.cardId,
        "Initiative",
      );
      if (c.playedThisTurn && !hasInit) return;
      attackerPower = meta.power + c.attachedDon * 1000;
      attackerName = meta.name;
      attackerHasDoubleAttack = this.cardHasKeyword(
        "p2",
        c.uid,
        c.cardId,
        "Double Attaque",
      );
      c.rested = true;
    }

    let defenderBasePower = 0;
    let defenderName = "";
    if (targetUid === "leader") {
      if (!opponent.leaderId) return;
      const meta = ONEPIECE_BASE_SET_BY_ID.get(opponent.leaderId);
      if (!meta || meta.kind !== "leader") return;
      defenderBasePower = meta.power + opponent.leaderAttachedDon * 1000;
      defenderName = meta.name;
    }

    // Hook on-attack : applique les effets [En attaquant] du bot.
    const sourceCardId =
      attackerUid === "leader"
        ? seat.leaderId!
        : seat.characters.find((c) => c.uid === attackerUid)?.cardId;
    if (sourceCardId) {
      this.fireEffectFor(sourceCardId, "on-attack", attackerUid, "p2");
    }
    attackerPower += this.getPowerBuff("p2", attackerUid);
    defenderBasePower += this.getPowerBuff("p1", targetUid);

    // Modificateurs passifs.
    const attackerRef: CardRef =
      attackerUid === "leader"
        ? { kind: "leader", seat: "p2" }
        : { kind: "character", seat: "p2", uid: attackerUid };
    const defenderRef: CardRef =
      targetUid === "leader"
        ? { kind: "leader", seat: "p1" }
        : { kind: "character", seat: "p1", uid: targetUid };
    attackerPower += this.applyPassivesTo(attackerRef, "attack");
    defenderBasePower += this.applyPassivesTo(defenderRef, "defend");

    this.pendingAttack = {
      attackerSeat: "p2",
      attackerUid,
      targetUid,
      attackerPower,
      defenderBasePower,
      defenderBoost: 0,
      doubleAttack: attackerHasDoubleAttack,
    };
    this.pushLog(
      `${seat.username} : ${attackerName} (${attackerPower}) attaque ${defenderName} (${defenderBasePower})${attackerHasDoubleAttack ? " — Double Attaque" : ""}.`,
    );
    this.broadcastState();
  }

  /** Equivalent de handleEndTurn pour le bot. */
  private botEndTurn() {
    const seat = this.seats.p2;
    if (!seat || this.activeSeat !== "p2" || this.phase !== "playing") return;

    this.turnPhase = "end";
    if (seat.leaderId) {
      this.fireEffectFor(seat.leaderId, "on-turn-end", "leader", "p2");
    }
    for (const c of seat.characters) {
      this.fireEffectFor(c.cardId, "on-turn-end", c.uid, "p2");
    }
    seat.donRested += seat.leaderAttachedDon;
    seat.leaderAttachedDon = 0;
    for (const c of seat.characters) {
      seat.donRested += c.attachedDon;
      c.attachedDon = 0;
    }
    seat.tempPowerBuffs.clear();
    seat.usedActivationsThisTurn.clear();
    for (const c of seat.characters) c.costBuff = 0;
    this.seats.p1?.tempPowerBuffs.clear();
    if (this.seats.p1) {
      for (const c of this.seats.p1.characters) c.costBuff = 0;
    }
    this.pushLog(`${seat.username} termine son tour.`);

    if (this.seats.p1) {
      this.activeSeat = "p1";
      this.runTurnStartPhases("p1", false);
    }
    this.broadcastState();
  }

  // ─── Moteur d'effets ─────────────────────────────────────────────────────

  /** Construit l'objet BattleEffectAccess passé aux handlers d'effets pour
   *  qu'ils puissent muter l'état (pioche, défausse, buffs power, etc.). */
  private getBattleAccess(): BattleEffectAccess {
    return {
      drawCards: (seatId, count) => {
        const s = this.seats[seatId];
        if (!s) return;
        const taken = Math.min(count, s.deck.length);
        for (let i = 0; i < taken; i++) {
          s.hand.push(s.deck.shift()!);
        }
      },
      discardRandom: (seatId, count) => {
        const s = this.seats[seatId];
        if (!s) return;
        for (let i = 0; i < count; i++) {
          if (s.hand.length === 0) break;
          const idx = Math.floor(Math.random() * s.hand.length);
          s.discard.push(s.hand.splice(idx, 1)[0]);
        }
      },
      giveDonFromDeck: (seatId, count) => {
        const s = this.seats[seatId];
        if (!s) return;
        const taken = Math.min(count, s.donDeck);
        s.donDeck -= taken;
        s.donActive += taken;
      },
      addPowerBuff: (ref: CardRef, amount: number) => {
        const s = this.seats[ref.seat];
        if (!s) return;
        const key =
          ref.kind === "leader"
            ? "leader"
            : ref.kind === "character"
              ? ref.uid
              : "stage";
        s.tempPowerBuffs.set(
          key,
          (s.tempPowerBuffs.get(key) ?? 0) + amount,
        );
      },
      addCostBuff: (ref: CardRef, amount: number) => {
        // Le cost buff ne s'applique qu'aux Persos (le Leader n'a pas
        // de cost). On le stocke dans `costBuff` du CardInPlay.
        if (ref.kind !== "character") return;
        const s = this.seats[ref.seat];
        if (!s) return;
        const c = s.characters.find((x) => x.uid === ref.uid);
        if (!c) return;
        c.costBuff = (c.costBuff ?? 0) + amount;
      },
      log: (line) => this.pushLog(line),
      requestChoice: (args) => {
        // Crée un PendingChoice — le state est broadcast à la fin du flow
        // courant (handlePlayCharacter, handleAttack…) qui appelle
        // broadcastState ensuite.
        this.pendingChoice = {
          id: crypto.randomUUID(),
          seat: args.seat,
          sourceCardNumber: args.sourceCardNumber,
          sourceUid: args.sourceUid,
          kind: args.kind,
          prompt: args.prompt,
          params: args.params ?? {},
          cancellable: args.cancellable ?? true,
        };
      },
      koCharacter: (seatId, uid) => {
        const s = this.seats[seatId];
        if (!s) return false;
        const idx = s.characters.findIndex((c) => c.uid === uid);
        if (idx < 0) return false;
        const target = s.characters[idx];
        // Vérifie immunité KO par effet.
        const blocked = isKoBlocked(
          { seat: seatId, uid: target.uid, cardId: target.cardId },
          "effect",
          this.getBattleAccess(),
        );
        if (blocked) {
          const meta = ONEPIECE_BASE_SET_BY_ID.get(target.cardId);
          this.pushLog(
            `${meta?.name ?? "?"} résiste au KO (immunité effet).`,
          );
          return false;
        }
        const ko = s.characters.splice(idx, 1)[0];
        s.donRested += ko.attachedDon;
        s.discard.push({ cardId: ko.cardId });
        const meta = ONEPIECE_BASE_SET_BY_ID.get(ko.cardId);
        this.pushLog(`${meta?.name ?? "?"} est mis KO (effet).`);
        this.fireEffectFor(ko.cardId, "on-ko", ko.uid, seatId);
        // Notifie tous les listeners on-leave-field (ex. Thousand Sunny).
        fireOnLeaveField(
          { seat: seatId, uid: ko.uid, cardId: ko.cardId },
          "ko-effect",
          this.getBattleAccess(),
        );
        return true;
      },
      attachDonToTarget: (target, count) => {
        const s = this.seats[target.seat];
        if (!s) return 0;
        // Priorise les DON épuisées (sens littéral de "DON!! épuisée"), sinon
        // bascule sur les actives.
        let taken = 0;
        while (taken < count && s.donRested > 0) {
          s.donRested--;
          taken++;
        }
        while (taken < count && s.donActive > 0) {
          s.donActive--;
          taken++;
        }
        if (target.kind === "leader") s.leaderAttachedDon += taken;
        else if (target.kind === "character") {
          const c = s.characters.find((x) => x.uid === target.uid);
          if (c) c.attachedDon += taken;
        }
        return taken;
      },
      placeCharacterAtDeckBottom: (seatId, uid) => {
        const s = this.seats[seatId];
        if (!s) return false;
        const idx = s.characters.findIndex((c) => c.uid === uid);
        if (idx < 0) return false;
        const removed = s.characters.splice(idx, 1)[0];
        s.donRested += removed.attachedDon;
        s.deck.push({ cardId: removed.cardId });
        fireOnLeaveField(
          { seat: seatId, uid: removed.uid, cardId: removed.cardId },
          "place-bottom",
          this.getBattleAccess(),
        );
        return true;
      },
      restCharacter: (seatId, uid) => {
        const s = this.seats[seatId];
        if (!s) return false;
        const c = s.characters.find((x) => x.uid === uid);
        if (!c) return false;
        c.rested = true;
        return true;
      },
      untapCharacter: (seatId, uid) => {
        const s = this.seats[seatId];
        if (!s) return false;
        const c = s.characters.find((x) => x.uid === uid);
        if (!c) return false;
        c.rested = false;
        return true;
      },
      untapLeader: (seatId) => {
        const s = this.seats[seatId];
        if (s) s.leaderRested = false;
      },
      bounceCharacter: (seatId, uid) => {
        const s = this.seats[seatId];
        if (!s) return false;
        const idx = s.characters.findIndex((c) => c.uid === uid);
        if (idx < 0) return false;
        const removed = s.characters.splice(idx, 1)[0];
        s.donRested += removed.attachedDon;
        s.hand.push({ cardId: removed.cardId });
        fireOnLeaveField(
          { seat: seatId, uid: removed.uid, cardId: removed.cardId },
          "bounce",
          this.getBattleAccess(),
        );
        return true;
      },
      placeHandOnTopOfDeck: (seatId, handIndex) => {
        const s = this.seats[seatId];
        if (!s) return null;
        if (handIndex < 0 || handIndex >= s.hand.length) return null;
        const card = s.hand.splice(handIndex, 1)[0];
        s.deck.unshift(card);
        return card.cardId;
      },
      peekTopOfDeck: (seatId) => {
        const s = this.seats[seatId];
        if (!s || s.deck.length === 0) return null;
        return s.deck[0].cardId;
      },
      placeCardAboveLife: (seatId, source) => {
        const s = this.seats[seatId];
        if (!s) return false;
        let cardId: string | null = null;
        if (source.kind === "hand") {
          if (source.handIndex < 0 || source.handIndex >= s.hand.length)
            return false;
          cardId = s.hand.splice(source.handIndex, 1)[0].cardId;
        } else if (source.kind === "deck-top") {
          if (s.deck.length === 0) return false;
          cardId = s.deck.shift()!.cardId;
        } else if (source.kind === "character") {
          const idx = s.characters.findIndex((c) => c.uid === source.uid);
          if (idx < 0) return false;
          const removed = s.characters.splice(idx, 1)[0];
          s.donRested += removed.attachedDon;
          cardId = removed.cardId;
        }
        if (!cardId) return false;
        // Place au-dessus = position 0 (le dessus de la pile).
        s.life.unshift({ cardId });
        return true;
      },
      discardFromHand: (seatId, handIndices) => {
        const s = this.seats[seatId];
        if (!s) return [];
        // On défausse en partant des indices les plus hauts pour que les
        // splice ne décalent pas les autres.
        const sorted = [...handIndices].sort((a, b) => b - a);
        const discarded: string[] = [];
        for (const i of sorted) {
          if (i < 0 || i >= s.hand.length) continue;
          const card = s.hand.splice(i, 1)[0];
          s.discard.push(card);
          discarded.push(card.cardId);
        }
        return discarded;
      },
      takeLifeToHand: (seatId) => {
        const s = this.seats[seatId];
        if (!s || s.life.length === 0) return null;
        const card = s.life.shift()!;
        s.hand.push(card);
        return card.cardId;
      },
      searchDeckTopForType: (seatId, count, typeFilter, restGoesTo, excludeName) => {
        const s = this.seats[seatId];
        if (!s) return null;
        const top = s.deck.splice(0, Math.min(count, s.deck.length));
        const needle = typeFilter.toLowerCase();
        let foundIdx = -1;
        for (let i = 0; i < top.length; i++) {
          const meta = ONEPIECE_BASE_SET_BY_ID.get(top[i].cardId);
          if (!meta) continue;
          if (excludeName && meta.name === excludeName) continue;
          const matches =
            meta.types.some((t) => t.toLowerCase().includes(needle)) ||
            meta.name.toLowerCase() === needle;
          if (matches) {
            foundIdx = i;
            break;
          }
        }
        let foundId: string | null = null;
        if (foundIdx >= 0) {
          const found = top.splice(foundIdx, 1)[0];
          s.hand.push(found);
          foundId = found.cardId;
        }
        // Place le reste selon le mode demandé.
        if (restGoesTo === "top") s.deck.unshift(...top);
        else if (restGoesTo === "bottom") s.deck.push(...top);
        else if (restGoesTo === "discard") s.discard.push(...top);
        return foundId;
      },
      getSeat: (seatId) => {
        const s = this.seats[seatId];
        if (!s) return null;
        return {
          leaderId: s.leaderId,
          leaderRested: s.leaderRested,
          leaderAttachedDon: s.leaderAttachedDon,
          characters: s.characters,
          stage: s.stage,
          handSize: s.hand.length,
          deckSize: s.deck.length,
          lifeCount: s.life.length,
          discardSize: s.discard.length,
          donActive: s.donActive,
          donRested: s.donRested,
        };
      },
    };
  }

  /** Tente d'exécuter le handler d'effet d'une carte sur un hook donné. */
  private fireEffectFor(
    cardId: string,
    hook: EffectHook,
    sourceUid: string,
    sourceSeat: OnePieceBattleSeatId,
  ) {
    const ctx: EffectContext = {
      hook,
      sourceUid,
      sourceSeat,
      battle: this.getBattleAccess(),
    };
    fireCardEffect(cardId, ctx);
  }

  /** Récupère le buff de puissance temporaire pour une cible. 0 si aucun. */
  private getPowerBuff(
    seatId: OnePieceBattleSeatId,
    targetUid: string,
  ): number {
    const s = this.seats[seatId];
    if (!s) return 0;
    return s.tempPowerBuffs.get(targetUid) ?? 0;
  }

  /** Calcule le delta de puissance dû aux passifs continus de toutes les
   *  cartes en jeu (Leaders + Persos des deux seats). À ajouter au power
   *  de base + DON + temp buffs. */
  private applyPassivesTo(
    target: CardRef,
    situation: "attack" | "defend" | "global",
  ): number {
    return applyAllPowerMods(
      target,
      situation,
      this.getBattleAccess(),
      this.activeSeat,
    );
  }

  /** Vérifie si une carte (Persos en jeu) a un mot-clé donné, en
   *  combinant la prose de la carte (regex via hasKeyword) avec les
   *  grants dynamiques accordés par les passifs (KEYWORD_GRANTS). */
  private cardHasKeyword(
    seatId: OnePieceBattleSeatId,
    uid: string,
    cardId: string,
    keyword: string,
  ): boolean {
    const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
    if (hasKeyword(meta?.effect, keyword)) return true;
    const granted = getGrantedKeywords(
      { seat: seatId, uid, cardId },
      this.getBattleAccess(),
      this.activeSeat,
    );
    return granted.has(keyword);
  }

  /** Helper : valide que c'est mon tour en main phase. */
  private requireMyTurnAndMain(
    conn: Party.Connection,
    seatId: OnePieceBattleSeatId,
  ): boolean {
    if (this.phase !== "playing") {
      this.sendError(conn, "Pas en phase de jeu.");
      return false;
    }
    if (this.activeSeat !== seatId) {
      this.sendError(conn, "Ce n'est pas ton tour.");
      return false;
    }
    if (this.turnPhase !== "main") {
      this.sendError(conn, "Action possible seulement en phase principale.");
      return false;
    }
    if (this.pendingAttack || this.pendingTrigger) {
      this.sendError(conn, "Une autre action est en cours.");
      return false;
    }
    return true;
  }

  // ─── State broadcasting ──────────────────────────────────────────────────

  private broadcastState() {
    for (const [connId, seatId] of this.connToSeat) {
      const seat = this.seats[seatId];
      if (!seat || !seat.conn) continue;
      const opponentSeat: OnePieceBattleSeatId = seatId === "p1" ? "p2" : "p1";
      const opponent = this.seats[opponentSeat];
      const state: OnePieceBattleState = {
        roomId: this.room.id,
        phase: this.phase,
        turnPhase: this.turnPhase,
        self: this.toSelfState(seat),
        opponent: opponent ? this.toPublicState(opponent) : null,
        selfSeat: seatId,
        activeSeat: this.activeSeat,
        turnNumber: this.turnNumber,
        winner: this.winner,
        log: this.log,
        pendingAttack: this.pendingAttack,
        pendingTrigger: this.pendingTrigger,
        pendingChoice: this.pendingChoice,
      };
      this.sendTo(seat.conn, { type: "op-state", state });
      void connId;
    }
    // Bot mode : déclenche éventuellement la prochaine action du bot. Le
    // setTimeout interne empêche la récursion synchrone.
    this.maybeBotAct();
  }

  private toPublicState(seat: SeatState): OnePieceBattlePlayerPublicState {
    return {
      authId: seat.authId,
      username: seat.username,
      deckName: seat.deckName,
      leader: seat.leaderId
        ? {
            cardId: seat.leaderId,
            rested: seat.leaderRested,
            attachedDon: seat.leaderAttachedDon,
          }
        : null,
      characters: seat.characters,
      stage: seat.stage,
      life: seat.life.length,
      donActive: seat.donActive,
      donRested: seat.donRested,
      donDeckSize: seat.donDeck,
      deckSize: seat.deck.length,
      handCount: seat.hand.length,
      discardSize: seat.discard.length,
      mulliganDecided: seat.mulliganDecided,
    };
  }

  private toSelfState(seat: SeatState): OnePieceBattleSelfState {
    return {
      ...this.toPublicState(seat),
      hand: seat.hand.map((c) => c.cardId),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private pushLog(line: string) {
    this.log.push(line);
    if (this.log.length > LOG_KEEP) this.log = this.log.slice(-LOG_KEEP);
  }

  private sendTo(conn: Party.Connection, msg: OnePieceBattleServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: OnePieceBattleServerMessage) {
    for (const [, seat] of Object.entries(this.seats)) {
      if (seat?.conn) this.sendTo(seat.conn, msg);
    }
  }

  private sendError(conn: Party.Connection, message: string) {
    this.sendTo(conn, { type: "op-error", message });
  }
}

/** Détecte un mot-clé entre crochets dans le texte d'effet d'une carte.
 *  Insensible à la casse et aux variantes ([Bloqueur], [bloqueur], etc.).
 *  Le moteur n'exécute pas les effets — il détecte juste leur présence
 *  pour les mots-clés bien définis (Bloqueur, Initiative, Double Attaque). */
function hasKeyword(text: string | null | undefined, keyword: string): boolean {
  if (!text) return false;
  const re = new RegExp(`\\[${keyword}\\]`, "i");
  return re.test(text);
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function seatNameFromSeat(
  seats: { p1: SeatState | null; p2: SeatState | null },
  seatId: OnePieceBattleSeatId,
): string {
  return seats[seatId]?.username ?? seatId;
}

// Garde-fou : tcg-onepiece-base doit exister (référencé partout côté server).
void ONEPIECE_BASE_SET;
