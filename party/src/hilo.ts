import type * as Party from "partykit/server";
import type {
  Card,
  ChatMessage,
  HiLoClientMessage,
  HiLoGuess,
  HiLoRound,
  HiLoServerMessage,
  HiLoState,
} from "../../shared/types";
import { HILO_CONFIG, PLAZA_CONFIG } from "../../shared/types";
import { fetchProfile, patchProfileGold } from "./lib/supabase";
import { PersistentChatHistory } from "./lib/chat-storage";
import {
  drawCard,
  evaluateGuess,
  isGuessAvailable,
  payoutMultiplier,
} from "./lib/hilo-math";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConnInfo = {
  authId: string | null;
  name: string;
  gold: number;
  isAdmin: boolean;
  history: HiLoRound[];
  game: GameState | null;
};

type GameState = {
  bet: number;
  multiplier: number;
  cards: Card[]; // chronological; current = last
  aceValue: 1 | 14 | null;
  // If set, an ace was just drawn as the "next" card and we're waiting
  // for the player to pick the value before resolving the guess.
  pendingGuess: HiLoGuess | null;
  status: "playing" | "awaiting-ace" | "busted" | "cashed";
};

const GUEST_SANDBOX_GOLD = 1000;

export default class HiLoServer implements Party.Server {
  private chat: PersistentChatHistory;
  private connInfo = new Map<string, ConnInfo>();

  constructor(readonly room: Party.Room) {
    this.chat = new PersistentChatHistory(room, PLAZA_CONFIG.chatHistorySize);
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const rawAuthId = url.searchParams.get("authId");
    const authId =
      typeof rawAuthId === "string" && UUID_RE.test(rawAuthId)
        ? rawAuthId
        : null;
    const providedName = sanitizeName(url.searchParams.get("name"));
    const name = providedName ?? `Invité-${conn.id.slice(0, 4)}`;
    const goldParam = url.searchParams.get("gold");
    const parsedGold = goldParam ? parseInt(goldParam, 10) : NaN;
    const queryGold = Number.isFinite(parsedGold)
      ? Math.max(0, Math.min(10_000_000, parsedGold))
      : null;

    let gold: number;
    let isAdmin = false;
    if (authId) {
      const profile = await fetchProfile(this.room, authId);
      if (profile && Number.isFinite(profile.gold)) {
        gold = profile.gold;
        isAdmin = !!profile.is_admin;
      } else if (queryGold !== null) {
        gold = queryGold;
      } else {
        gold = 0;
      }
    } else {
      gold = queryGold ?? GUEST_SANDBOX_GOLD;
    }

    this.connInfo.set(conn.id, {
      authId,
      name,
      gold,
      isAdmin,
      history: [],
      game: null,
    });

    const chat = await this.chat.list();
    this.sendTo(conn, {
      type: "hilo-welcome",
      selfId: conn.id,
      gold,
      history: [],
      chat,
    });
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const info = this.connInfo.get(sender.id);
    if (!info) return;

    let data: HiLoClientMessage | { type: "chat"; text: string };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    switch (data.type) {
      case "chat": {
        const text = sanitizeChat(data.text);
        if (!text) return;
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          playerId: sender.id,
          playerName: info.name,
          text,
          timestamp: Date.now(),
          isAdmin: info.isAdmin || undefined,
        };
        await this.chat.add(message);
        this.broadcast({ type: "chat", message });
        break;
      }
      case "hilo-start":
        await this.handleStart(sender, info, data.bet);
        break;
      case "hilo-guess":
        await this.handleGuess(sender, info, data.guess);
        break;
      case "hilo-set-ace":
        await this.handleSetAce(sender, info, data.value);
        break;
      case "hilo-cash-out":
        await this.handleCashOut(sender, info);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    this.connInfo.delete(conn.id);
  }

  // ──────────────────────────────── handlers ──────────────────────────────────

  private async handleStart(
    conn: Party.Connection,
    info: ConnInfo,
    rawBet: number,
  ) {
    if (info.game && info.game.status !== "busted" && info.game.status !== "cashed") {
      this.sendError(conn, "Une partie est déjà en cours.");
      return;
    }
    const bet = Math.floor(Number(rawBet));
    if (
      !Number.isFinite(bet) ||
      bet < HILO_CONFIG.minBet ||
      bet > HILO_CONFIG.maxBet
    ) {
      this.sendError(
        conn,
        `Mise entre ${HILO_CONFIG.minBet} et ${HILO_CONFIG.maxBet} OS.`,
      );
      return;
    }
    if (info.gold < bet) {
      this.sendError(conn, "Or Suprême insuffisant.");
      return;
    }

    info.gold -= bet;
    await this.persistGold(info);
    this.sendTo(conn, { type: "gold-update", gold: info.gold });

    const first = drawCard();
    const game: GameState = {
      bet,
      multiplier: 1, // base: cashing out now returns the bet (effectively no win)
      cards: [first],
      aceValue: null,
      pendingGuess: null,
      status: first.rank === "A" ? "awaiting-ace" : "playing",
    };
    info.game = game;
    this.sendState(conn, info);
  }

  private async handleGuess(
    conn: Party.Connection,
    info: ConnInfo,
    guess: HiLoGuess,
  ) {
    const game = info.game;
    if (!game || game.status !== "playing") {
      this.sendError(conn, "Aucune partie en cours.");
      return;
    }
    if (guess !== "higher" && guess !== "lower" && guess !== "same") return;

    const current = game.cards[game.cards.length - 1];
    if (!isGuessAvailable(guess, current, game.aceValue)) {
      this.sendError(conn, "Ce choix est impossible sur cette carte.");
      return;
    }

    const stepMultiplier = payoutMultiplier(
      guess,
      current,
      game.aceValue,
      HILO_CONFIG.rtp,
    );

    const next = drawCard();
    game.cards.push(next);

    // If the freshly drawn card is the joker and aceValue isn't set, we
    // pause and wait for the player to lock the value before resolving.
    if (next.rank === "A" && game.aceValue === null) {
      game.pendingGuess = guess;
      game.status = "awaiting-ace";
      this.sendState(conn, info);
      return;
    }

    this.resolveGuess(conn, info, game, guess, stepMultiplier);
  }

  private async handleSetAce(
    conn: Party.Connection,
    info: ConnInfo,
    rawValue: number,
  ) {
    const game = info.game;
    if (!game || game.status !== "awaiting-ace") {
      this.sendError(conn, "Pas d'As à choisir maintenant.");
      return;
    }
    if (game.aceValue !== null) return;
    if (rawValue !== 1 && rawValue !== 14) {
      this.sendError(conn, "Valeur d'As invalide (1 ou 14).");
      return;
    }
    game.aceValue = rawValue;

    const guess = game.pendingGuess;
    game.pendingGuess = null;

    if (guess) {
      // We had a pending guess: the just-drawn card was the ace, evaluate now.
      // The current card for the guess was the previous one (cards[len-2]).
      const previous = game.cards[game.cards.length - 2];
      const stepMultiplier = payoutMultiplier(
        guess,
        previous,
        game.aceValue,
        HILO_CONFIG.rtp,
      );
      this.resolveGuess(conn, info, game, guess, stepMultiplier);
    } else {
      // Ace was the starting card; player can now begin guessing.
      game.status = "playing";
      this.sendState(conn, info);
    }
  }

  private async handleCashOut(conn: Party.Connection, info: ConnInfo) {
    const game = info.game;
    if (!game || game.status !== "playing") {
      this.sendError(conn, "Rien à encaisser.");
      return;
    }
    if (game.multiplier <= 1) {
      this.sendError(
        conn,
        "Joue au moins une carte avant d'encaisser.",
      );
      return;
    }
    await this.endRound(conn, info, game, "cashed");
  }

  private async resolveGuess(
    conn: Party.Connection,
    info: ConnInfo,
    game: GameState,
    guess: HiLoGuess,
    stepMultiplier: number,
  ) {
    const previous = game.cards[game.cards.length - 2];
    const next = game.cards[game.cards.length - 1];
    const won = evaluateGuess(guess, previous, next, game.aceValue);

    if (won) {
      game.multiplier *= stepMultiplier;
      game.status = "playing";
      this.sendState(conn, info);
    } else {
      await this.endRound(conn, info, game, "busted");
    }
  }

  private async endRound(
    conn: Party.Connection,
    info: ConnInfo,
    game: GameState,
    outcome: "cashed" | "busted",
  ) {
    let payout = 0;
    if (outcome === "cashed") {
      payout = Math.floor(game.bet * game.multiplier);
      info.gold += payout;
      await this.persistGold(info);
      this.sendTo(conn, { type: "gold-update", gold: info.gold });
    }

    game.status = outcome;

    const round: HiLoRound = {
      id: crypto.randomUUID(),
      bet: game.bet,
      outcome,
      payout,
      steps: Math.max(0, game.cards.length - 1),
      endingMultiplier: outcome === "cashed" ? game.multiplier : 0,
      aceValue: game.aceValue,
      cards: [...game.cards],
      timestamp: Date.now(),
    };
    info.history = [round, ...info.history].slice(0, HILO_CONFIG.historySize);

    this.sendState(conn, info);
    this.sendTo(conn, { type: "hilo-round-end", round });
  }

  // ──────────────────────────────── helpers ──────────────────────────────────

  private sendState(conn: Party.Connection, info: ConnInfo) {
    const game = info.game;
    if (!game) {
      this.sendTo(conn, { type: "hilo-state", state: null });
      return;
    }
    const current = game.cards[game.cards.length - 1];
    const payouts = {
      higher: payoutMultiplier(
        "higher",
        current,
        game.aceValue,
        HILO_CONFIG.rtp,
      ),
      lower: payoutMultiplier("lower", current, game.aceValue, HILO_CONFIG.rtp),
      same: payoutMultiplier("same", current, game.aceValue, HILO_CONFIG.rtp),
    };
    const state: HiLoState = {
      status: game.status,
      bet: game.bet,
      multiplier: game.multiplier,
      history: [...game.cards],
      aceValue: game.aceValue,
      payouts,
    };
    this.sendTo(conn, { type: "hilo-state", state });
  }

  private async persistGold(info: ConnInfo) {
    if (!info.authId) return;
    await patchProfileGold(this.room, info.authId, info.gold);
  }

  private sendError(conn: Party.Connection, message: string) {
    this.sendTo(conn, { type: "hilo-error", message });
  }

  private sendTo(conn: Party.Connection, msg: HiLoServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: HiLoServerMessage, exclude: string[] = []) {
    this.room.broadcast(JSON.stringify(msg), exclude);
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
