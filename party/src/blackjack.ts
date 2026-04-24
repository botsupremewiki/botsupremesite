import type * as Party from "partykit/server";
import type {
  BlackjackSeat,
  BlackjackState,
  Card,
  CardRank,
  CardSuit,
  ChatMessage,
  ClientMessage,
  Player,
  ServerMessage,
} from "../../shared/types";
import { BLACKJACK_CONFIG, PLAZA_CONFIG } from "../../shared/types";

const AVATAR_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TimerId = ReturnType<typeof setTimeout>;

export default class BlackjackServer implements Party.Server {
  private players = new Map<string, Player>();
  private chatHistory: ChatMessage[] = [];
  private colorCursor = 0;

  private seats: BlackjackSeat[] = makeEmptySeats();
  private phase: BlackjackState["phase"] = "idle";
  private deck: Card[] = [];
  private dealerHand: Card[] = [];
  private dealerHoleHidden = true;
  private activeSeatIndex: number | null = null;
  private phaseEndsAt: number | null = null;
  private phaseTimer: TimerId | null = null;
  private lastOutcome: string | null = null;

  private authIdToSeatIndex = new Map<string, number>();
  private connIdToSeatIndex = new Map<string, number>();

  constructor(readonly room: Party.Room) {}

  // ──────────────────────────────── connection handling ────────────────────────

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    if (this.players.size >= PLAZA_CONFIG.maxPlayers) {
      this.sendTo(conn, {
        type: "error",
        message: "La table est pleine (spectateurs inclus).",
      });
      conn.close();
      return;
    }

    const url = new URL(ctx.request.url);
    const authId = sanitizeAuthId(url.searchParams.get("authId"));
    const providedName = sanitizeName(url.searchParams.get("name"));
    const avatarUrl = sanitizeUrl(url.searchParams.get("avatarUrl"));
    const goldParam = url.searchParams.get("gold");
    const parsedGold = goldParam ? parseInt(goldParam, 10) : NaN;
    const initialGold = Number.isFinite(parsedGold)
      ? Math.max(0, Math.min(10_000_000, parsedGold))
      : 1000;

    const player: Player = {
      id: conn.id,
      authId: authId ?? undefined,
      name: providedName ?? `Invité-${conn.id.slice(0, 4)}`,
      avatarUrl: avatarUrl ?? undefined,
      x: PLAZA_CONFIG.width / 2 + (Math.random() - 0.5) * 80,
      y: 560,
      direction: "up",
      color: AVATAR_COLORS[this.colorCursor++ % AVATAR_COLORS.length],
    };
    this.players.set(conn.id, player);

    // Try to rehydrate a seat for a returning authenticated user (same authId)
    if (authId && this.authIdToSeatIndex.has(authId)) {
      const seatIndex = this.authIdToSeatIndex.get(authId)!;
      const seat = this.seats[seatIndex];
      if (seat && !seat.playerId) {
        seat.playerId = conn.id;
        seat.playerName = player.name;
        seat.playerColor = player.color;
        seat.gold = initialGold;
        this.connIdToSeatIndex.set(conn.id, seatIndex);
      }
    }

    this.sendTo(conn, {
      type: "welcome",
      selfId: conn.id,
      players: Array.from(this.players.values()),
      chat: this.chatHistory,
      blackjack: this.snapshotState(),
      gold: initialGold,
    });
    this.broadcast({ type: "player-joined", player }, [conn.id]);
  }

  onMessage(raw: string, sender: Party.Connection) {
    let data: ClientMessage;
    try {
      data = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }

    const player = this.players.get(sender.id);
    if (!player) return;

    switch (data.type) {
      case "move": {
        if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
        const x = clamp(data.x, 0, PLAZA_CONFIG.width);
        const y = clamp(data.y, 0, PLAZA_CONFIG.height);
        player.x = x;
        player.y = y;
        player.direction = data.direction;
        this.broadcast(
          {
            type: "player-moved",
            playerId: sender.id,
            x,
            y,
            direction: data.direction,
          },
          [sender.id],
        );
        break;
      }

      case "set-name": {
        if (player.authId) return;
        const name = sanitizeName(data.name);
        if (!name) return;
        player.name = name;
        this.broadcast({
          type: "player-renamed",
          playerId: sender.id,
          name,
        });
        break;
      }

      case "chat": {
        const text = sanitizeChat(data.text);
        if (!text) return;
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          playerId: sender.id,
          playerName: player.name,
          text,
          timestamp: Date.now(),
        };
        this.chatHistory.push(message);
        if (this.chatHistory.length > PLAZA_CONFIG.chatHistorySize)
          this.chatHistory.shift();
        this.broadcast({ type: "chat", message });
        break;
      }

      case "take-seat":
        this.handleTakeSeat(sender, player, data.seatIndex);
        break;

      case "leave-seat":
        this.handleLeaveSeat(sender.id);
        break;

      case "ready":
        this.handleReady(sender.id);
        break;

      case "bet":
        this.handleBet(sender.id, data.amount);
        break;

      case "hit":
        this.handleHit(sender.id);
        break;

      case "stand":
        this.handleStand(sender.id);
        break;

      default:
        break;
    }
  }

  onClose(conn: Party.Connection) {
    if (!this.players.delete(conn.id)) return;

    const seatIndex = this.connIdToSeatIndex.get(conn.id);
    if (seatIndex !== undefined) {
      const seat = this.seats[seatIndex];
      if (this.phase === "idle") {
        this.freeSeat(seatIndex);
      } else {
        // Keep the seat slot marked as inactive for this round; player forfeits.
        seat.playerId = null;
        seat.playerName = null;
        seat.playerColor = null;
        seat.ready = false;
        if (seat.bet > 0) {
          seat.status = "lost"; // forfeits their bet
        } else {
          seat.status = "empty";
        }
        if (this.activeSeatIndex === seatIndex) {
          this.advanceToNextPlayer();
        } else {
          this.broadcastState();
        }
      }
      this.connIdToSeatIndex.delete(conn.id);
    }

    this.broadcast({ type: "player-left", playerId: conn.id });
  }

  // ──────────────────────────────── seating ─────────────────────────────────────

  private handleTakeSeat(
    conn: Party.Connection,
    player: Player,
    seatIndex: number,
  ) {
    if (
      !Number.isInteger(seatIndex) ||
      seatIndex < 0 ||
      seatIndex >= BLACKJACK_CONFIG.seatCount
    ) {
      this.sendTo(conn, { type: "error", message: "Siège invalide." });
      return;
    }
    if (this.connIdToSeatIndex.has(conn.id)) {
      this.sendTo(conn, {
        type: "error",
        message: "Tu es déjà assis à une place.",
      });
      return;
    }
    const seat = this.seats[seatIndex];
    if (seat.playerId) {
      this.sendTo(conn, { type: "error", message: "Place déjà prise." });
      return;
    }
    if (this.phase !== "idle") {
      this.sendTo(conn, {
        type: "error",
        message: "Tu ne peux t'asseoir qu'entre deux manches.",
      });
      return;
    }

    // Fetch the current gold from connection query (kept up to date via gold-update loop-back)
    // For MVP we reuse initialGold from welcome; seat.gold is set here
    const existingGold = seat.gold > 0 ? seat.gold : 1000;

    seat.playerId = conn.id;
    seat.playerName = player.name;
    seat.playerColor = player.color;
    seat.gold = existingGold;
    seat.status = "waiting";
    seat.ready = false;
    seat.bet = 0;
    seat.hand = [];
    seat.score = 0;

    this.connIdToSeatIndex.set(conn.id, seatIndex);
    if (player.authId) this.authIdToSeatIndex.set(player.authId, seatIndex);

    this.broadcastState();
  }

  private handleLeaveSeat(connId: string) {
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined) return;
    if (this.phase !== "idle") {
      this.sendTo(this.connOf(connId), {
        type: "error",
        message: "Attends la fin de la manche pour quitter.",
      });
      return;
    }
    this.freeSeat(seatIndex);
    this.connIdToSeatIndex.delete(connId);
    const player = this.players.get(connId);
    if (player?.authId) this.authIdToSeatIndex.delete(player.authId);
  }

  private freeSeat(seatIndex: number) {
    this.seats[seatIndex] = emptySeat(seatIndex);
    this.broadcastState();
  }

  // ──────────────────────────────── game loop ───────────────────────────────────

  private handleReady(connId: string) {
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined) return;
    if (this.phase !== "idle") return;
    const seat = this.seats[seatIndex];
    if (!seat.playerId) return;
    seat.ready = true;
    this.broadcastState();
    this.maybeStartRound();
  }

  private maybeStartRound() {
    const active = this.seats.filter((s) => s.playerId);
    if (active.length === 0) return;
    const allReady = active.every((s) => s.ready);
    if (allReady) this.startBetting();
  }

  private startBetting() {
    this.phase = "betting";
    this.deck = makeShuffledDeck(6);
    this.dealerHand = [];
    this.dealerHoleHidden = true;
    this.lastOutcome = null;
    for (const seat of this.seats) {
      if (seat.playerId) {
        seat.bet = 0;
        seat.hand = [];
        seat.score = 0;
        seat.status = "betting";
      }
    }
    this.setPhaseTimeout(BLACKJACK_CONFIG.bettingDurationMs, () =>
      this.endBetting(),
    );
    this.broadcastState();
  }

  private handleBet(connId: string, amount: number) {
    if (this.phase !== "betting") return;
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined) return;
    const seat = this.seats[seatIndex];
    if (!seat.playerId) return;
    if (!Number.isFinite(amount)) return;
    const bet = Math.floor(amount);
    if (bet < BLACKJACK_CONFIG.minBet || bet > BLACKJACK_CONFIG.maxBet) return;
    if (bet > seat.gold) {
      this.sendTo(this.connOf(connId), {
        type: "error",
        message: "Or Suprême insuffisant.",
      });
      return;
    }
    seat.bet = bet;
    seat.gold -= bet; // reserve the bet
    seat.status = "ready";
    this.sendGoldTo(connId, seat.gold);
    this.broadcastState();
  }

  private endBetting() {
    const bettors = this.seats.filter((s) => s.playerId && s.bet > 0);
    if (bettors.length === 0) {
      this.returnToIdle();
      return;
    }
    this.dealInitial();
    this.startPlaying();
  }

  private dealInitial() {
    for (const seat of this.seats) {
      if (seat.playerId && seat.bet > 0) {
        seat.hand = [this.draw(), this.draw()];
        seat.score = scoreHand(seat.hand);
        if (seat.score === 21) {
          seat.status = "blackjack";
        } else {
          seat.status = "playing";
        }
      }
    }
    this.dealerHand = [this.draw(), this.draw()];
    this.dealerHoleHidden = true;
  }

  private startPlaying() {
    this.phase = "playing";
    this.activeSeatIndex = this.findNextActiveSeat(-1);
    if (this.activeSeatIndex === null) {
      this.beginDealerPhase();
      return;
    }
    this.setPhaseTimeout(BLACKJACK_CONFIG.turnDurationMs, () =>
      this.autoStand(),
    );
    this.broadcastState();
  }

  private handleHit(connId: string) {
    if (this.phase !== "playing") return;
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined) return;
    if (seatIndex !== this.activeSeatIndex) return;
    const seat = this.seats[seatIndex];
    if (seat.status !== "playing") return;

    seat.hand.push(this.draw());
    seat.score = scoreHand(seat.hand);
    if (seat.score > 21) {
      seat.status = "busted";
      this.advanceToNextPlayer();
      return;
    }
    if (seat.score === 21) {
      seat.status = "stood";
      this.advanceToNextPlayer();
      return;
    }
    this.setPhaseTimeout(BLACKJACK_CONFIG.turnDurationMs, () =>
      this.autoStand(),
    );
    this.broadcastState();
  }

  private handleStand(connId: string) {
    if (this.phase !== "playing") return;
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined) return;
    if (seatIndex !== this.activeSeatIndex) return;
    const seat = this.seats[seatIndex];
    if (seat.status !== "playing") return;
    seat.status = "stood";
    this.advanceToNextPlayer();
  }

  private autoStand() {
    if (this.phase !== "playing" || this.activeSeatIndex === null) return;
    const seat = this.seats[this.activeSeatIndex];
    if (seat.status === "playing") {
      seat.status = "stood";
    }
    this.advanceToNextPlayer();
  }

  private advanceToNextPlayer() {
    const from = this.activeSeatIndex ?? -1;
    const next = this.findNextActiveSeat(from);
    this.activeSeatIndex = next;
    if (next === null) {
      this.beginDealerPhase();
      return;
    }
    this.setPhaseTimeout(BLACKJACK_CONFIG.turnDurationMs, () =>
      this.autoStand(),
    );
    this.broadcastState();
  }

  private findNextActiveSeat(fromIndex: number): number | null {
    for (let i = fromIndex + 1; i < this.seats.length; i++) {
      const seat = this.seats[i];
      if (seat.playerId && seat.bet > 0 && seat.status === "playing") {
        return i;
      }
    }
    return null;
  }

  private beginDealerPhase() {
    this.phase = "dealer";
    this.activeSeatIndex = null;
    this.dealerHoleHidden = false;
    this.clearPhaseTimer();

    // Draw until score >= 17 (soft 17 stand by default per config note).
    // We step with small delays so clients can animate reveals.
    this.broadcastState();
    this.stepDealer();
  }

  private stepDealer() {
    const score = scoreHand(this.dealerHand);
    if (score < 17) {
      this.phaseTimer = setTimeout(() => {
        this.dealerHand.push(this.draw());
        this.broadcastState();
        this.stepDealer();
      }, 700);
    } else {
      this.phaseTimer = setTimeout(() => this.resolveRound(), 700);
    }
  }

  private resolveRound() {
    this.phase = "resolving";
    this.clearPhaseTimer();
    const dealerScore = scoreHand(this.dealerHand);
    const dealerBusted = dealerScore > 21;

    let outcomeParts: string[] = [];

    const supabaseWrites: Promise<void>[] = [];

    for (const seat of this.seats) {
      if (!seat.playerId || seat.bet === 0) continue;
      const seatScore = seat.score;
      let payoutMultiplier = 0; // how much of bet we pay back (including the bet itself)

      if (seat.status === "blackjack") {
        if (dealerScore === 21 && this.dealerHand.length === 2) {
          seat.status = "pushed";
          payoutMultiplier = 1; // return bet
        } else {
          seat.status = "won";
          payoutMultiplier = 2.5; // 3:2 blackjack payout
        }
      } else if (seat.status === "busted") {
        payoutMultiplier = 0;
        seat.status = "lost";
      } else if (dealerBusted) {
        seat.status = "won";
        payoutMultiplier = 2;
      } else if (seatScore > dealerScore) {
        seat.status = "won";
        payoutMultiplier = 2;
      } else if (seatScore < dealerScore) {
        seat.status = "lost";
        payoutMultiplier = 0;
      } else {
        seat.status = "pushed";
        payoutMultiplier = 1;
      }

      const credit = Math.floor(seat.bet * payoutMultiplier);
      seat.gold += credit;

      const player = seat.playerId ? this.players.get(seat.playerId) : null;
      const label =
        seat.status === "won"
          ? `${seat.playerName} gagne ${credit - seat.bet}`
          : seat.status === "lost"
            ? `${seat.playerName} perd ${seat.bet}`
            : seat.status === "pushed"
              ? `${seat.playerName} égalité`
              : "";
      if (label) outcomeParts.push(label);

      this.sendGoldTo(seat.playerId!, seat.gold);

      if (player?.authId) {
        supabaseWrites.push(
          this.persistGoldToSupabase(player.authId, seat.gold),
        );
      }
    }

    this.lastOutcome =
      outcomeParts.length > 0 ? outcomeParts.join(" · ") : "Manche terminée";

    // Kick off Supabase writes but don't block the game
    void Promise.allSettled(supabaseWrites);

    this.broadcastState();

    this.phaseTimer = setTimeout(
      () => this.returnToIdle(),
      BLACKJACK_CONFIG.roundIntervalMs,
    );
  }

  private returnToIdle() {
    this.phase = "idle";
    this.activeSeatIndex = null;
    this.dealerHand = [];
    this.dealerHoleHidden = true;
    this.clearPhaseTimer();
    for (const seat of this.seats) {
      if (seat.playerId) {
        seat.bet = 0;
        seat.hand = [];
        seat.score = 0;
        seat.status = "waiting";
        seat.ready = false;
      }
    }
    this.broadcastState();
  }

  private setPhaseTimeout(ms: number, cb: () => void) {
    this.clearPhaseTimer();
    this.phaseEndsAt = Date.now() + ms;
    this.phaseTimer = setTimeout(() => {
      this.phaseEndsAt = null;
      cb();
    }, ms);
  }

  private clearPhaseTimer() {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
    this.phaseEndsAt = null;
  }

  private draw(): Card {
    if (this.deck.length === 0) this.deck = makeShuffledDeck(6);
    return this.deck.pop()!;
  }

  // ──────────────────────────────── Supabase write ─────────────────────────────

  private async persistGoldToSupabase(authId: string, gold: number) {
    const env = (this.room as unknown as { env?: Record<string, string> })
      .env;
    const url = env?.SUPABASE_URL ?? readProcessEnv("SUPABASE_URL");
    const key =
      env?.SUPABASE_SERVICE_ROLE_KEY ??
      readProcessEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    try {
      const resp = await fetch(`${url}/rest/v1/profiles?id=eq.${authId}`, {
        method: "PATCH",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          gold,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!resp.ok) {
        console.warn(
          "[blackjack] Supabase gold update failed:",
          resp.status,
          await resp.text(),
        );
      }
    } catch (e) {
      console.warn("[blackjack] Supabase fetch threw:", e);
    }
  }

  // ──────────────────────────────── helpers ─────────────────────────────────────

  private snapshotState(): BlackjackState {
    return {
      phase: this.phase,
      seats: this.seats.map((s) => ({ ...s, hand: [...s.hand] })),
      activeSeatIndex: this.activeSeatIndex,
      dealerHand: this.dealerHoleHidden
        ? this.dealerHand.slice(0, 1)
        : [...this.dealerHand],
      dealerScore: this.dealerHoleHidden
        ? scoreHand(this.dealerHand.slice(0, 1))
        : scoreHand(this.dealerHand),
      dealerHoleHidden: this.dealerHoleHidden,
      phaseEndsAt: this.phaseEndsAt,
      lastOutcome: this.lastOutcome,
    };
  }

  private broadcastState() {
    this.broadcast({ type: "blackjack-state", state: this.snapshotState() });
  }

  private sendTo(conn: Party.Connection | undefined, msg: ServerMessage) {
    if (!conn) return;
    conn.send(JSON.stringify(msg));
  }

  private sendGoldTo(connId: string, gold: number) {
    const conn = this.connOf(connId);
    if (conn) this.sendTo(conn, { type: "gold-update", gold });
  }

  private broadcast(msg: ServerMessage, exclude: string[] = []) {
    this.room.broadcast(JSON.stringify(msg), exclude);
  }

  private connOf(id: string): Party.Connection | undefined {
    for (const conn of this.room.getConnections()) {
      if (conn.id === id) return conn;
    }
    return undefined;
  }
}

function makeEmptySeats(): BlackjackSeat[] {
  return Array.from({ length: BLACKJACK_CONFIG.seatCount }, (_, i) =>
    emptySeat(i),
  );
}

function emptySeat(seatIndex: number): BlackjackSeat {
  return {
    seatIndex,
    playerId: null,
    playerName: null,
    playerColor: null,
    gold: 0,
    bet: 0,
    hand: [],
    score: 0,
    status: "empty",
    ready: false,
  };
}

const SUITS: CardSuit[] = ["S", "H", "D", "C"];
const RANKS: CardRank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

export function makeShuffledDeck(decks = 6): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ suit, rank });
    }
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function scoreHand(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      aces++;
      total += 11;
    } else if (c.rank === "J" || c.rank === "Q" || c.rank === "K") {
      total += 10;
    } else {
      total += parseInt(c.rank, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 20);
  if (trimmed.length < 2) return null;
  return trimmed;
}

function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 200);
  return trimmed || null;
}

function sanitizeAuthId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return UUID_RE.test(raw) ? raw : null;
}

function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function readProcessEnv(key: string): string | undefined {
  const globalProc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  return globalProc?.env?.[key];
}
