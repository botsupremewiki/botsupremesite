import type * as Party from "partykit/server";
import type {
  BlackjackSeat,
  BlackjackState,
  Card,
  CardRank,
  CardSuit,
  ChatMessage,
  ClientMessage,
  Direction,
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
      ? Math.max(0, Math.min(1_000_000, parsedGold))
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

    // If authenticated and they had a seat from a previous connection, try to rehydrate (same authId)
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

      case "take-seat": {
        this.handleTakeSeat(sender, player, data.seatIndex);
        break;
      }

      case "leave-seat": {
        this.handleLeaveSeat(sender.id);
        break;
      }

      default:
        // Other client messages (bet/hit/stand/ready) will be wired in later phases.
        break;
    }
  }

  onClose(conn: Party.Connection) {
    if (!this.players.delete(conn.id)) return;

    // If the player was seated, free the seat (only in idle phase, else they forfeit but seat remains locked for round).
    const seatIndex = this.connIdToSeatIndex.get(conn.id);
    if (seatIndex !== undefined) {
      const seat = this.seats[seatIndex];
      if (this.phase === "idle") {
        this.freeSeat(seatIndex);
      } else {
        seat.playerId = null;
        seat.playerName = null;
        seat.playerColor = null;
        seat.ready = false;
        seat.status = "lost";
        this.broadcastState();
      }
      this.connIdToSeatIndex.delete(conn.id);
    }

    this.broadcast({ type: "player-left", playerId: conn.id });
  }

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

    seat.playerId = conn.id;
    seat.playerName = player.name;
    seat.playerColor = player.color;
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

  private sendTo(
    conn: Party.Connection | undefined,
    msg: ServerMessage,
  ) {
    if (!conn) return;
    conn.send(JSON.stringify(msg));
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
