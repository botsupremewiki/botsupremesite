import type * as Party from "partykit/server";
import type {
  ChatMessage,
  ClientMessage,
  Player,
  RouletteClientMessage,
  RouletteSeat,
  RouletteServerMessage,
  RouletteState,
} from "../../shared/types";
import { PLAZA_CONFIG, ROULETTE_CONFIG } from "../../shared/types";
import { fetchProfile, patchProfileGold } from "./lib/supabase";
import { PersistentChatHistory } from "./lib/chat-storage";
import {
  betMultiplier,
  isValidBetKey,
  pickWinningNumber,
} from "./lib/roulette-math";

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

type ConnInfo = {
  authId: string | null;
  name: string;
  gold: number;
  isAdmin: boolean;
};

type TimerId = ReturnType<typeof setTimeout>;

export default class RouletteServer implements Party.Server {
  private chat: PersistentChatHistory;
  private players = new Map<string, Player>();
  private connInfo = new Map<string, ConnInfo>();
  private authIdToSeatIndex = new Map<string, number>();
  private connIdToSeatIndex = new Map<string, number>();
  private colorCursor = 0;

  private seats: RouletteSeat[] = makeEmptySeats();
  private phase: RouletteState["phase"] = "idle";
  private winningNumber: number | null = null;
  private recentNumbers: number[] = [];
  private phaseEndsAt: number | null = null;
  private phaseTimer: TimerId | null = null;
  private lastOutcome: string | null = null;

  constructor(readonly room: Party.Room) {
    this.chat = new PersistentChatHistory(room, PLAZA_CONFIG.chatHistorySize);
  }

  // ────────────────────────────── connection ──────────────────────────

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    if (this.players.size >= PLAZA_CONFIG.maxPlayers) {
      this.sendTo(conn, {
        type: "roulette-error",
        message: "Salle pleine.",
      });
      conn.close();
      return;
    }

    const url = new URL(ctx.request.url);
    const rawAuthId = url.searchParams.get("authId");
    const authId =
      typeof rawAuthId === "string" && UUID_RE.test(rawAuthId)
        ? rawAuthId
        : null;
    const providedName = sanitizeName(url.searchParams.get("name"));
    const avatarUrl = sanitizeUrl(url.searchParams.get("avatarUrl"));

    let gold = 1000;
    let isAdmin = false;
    if (authId) {
      const profile = await fetchProfile(this.room, authId);
      if (profile) {
        if (Number.isFinite(profile.gold)) gold = profile.gold;
        isAdmin = !!profile.is_admin;
      }
    }
    this.connInfo.set(conn.id, {
      authId,
      name: providedName ?? `Invité-${conn.id.slice(0, 4)}`,
      gold,
      isAdmin,
    });

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

    // Rehydrate seat if the same authId was seated before.
    if (authId && this.authIdToSeatIndex.has(authId)) {
      const seatIndex = this.authIdToSeatIndex.get(authId)!;
      const seat = this.seats[seatIndex];
      if (seat && !seat.playerId) {
        seat.playerId = conn.id;
        seat.playerName = player.name;
        seat.playerColor = player.color;
        seat.gold = gold;
        this.connIdToSeatIndex.set(conn.id, seatIndex);
      }
    }

    const chat = await this.chat.list();
    this.sendTo(conn, {
      type: "roulette-welcome",
      selfId: conn.id,
      players: Array.from(this.players.values()),
      chat,
      state: this.snapshotState(),
      gold,
    });
    this.broadcast({ type: "player-joined", player }, [conn.id]);
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const info = this.connInfo.get(sender.id);
    if (!info) return;

    let data: ClientMessage | RouletteClientMessage;
    try {
      data = JSON.parse(raw);
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
      case "set-name":
        if (player.authId) return;
        {
          const name = sanitizeName(data.name);
          if (!name) return;
          player.name = name;
          info.name = name;
          this.broadcast({
            type: "player-renamed",
            playerId: sender.id,
            name,
          });
        }
        break;
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
      case "take-seat":
        this.handleTakeSeat(sender, info, data.seatIndex);
        break;
      case "leave-seat":
        this.handleLeaveSeat(sender.id);
        break;
      case "ready":
        this.handleReady(sender.id);
        break;
      case "place-bet":
        this.handlePlaceBet(sender, info, data.betKey, data.amount);
        break;
      case "clear-bets":
        await this.handleClearBets(sender, info);
        break;
    }
  }

  async onClose(conn: Party.Connection) {
    const info = this.connInfo.get(conn.id);
    this.connInfo.delete(conn.id);
    if (!this.players.delete(conn.id)) return;

    const seatIndex = this.connIdToSeatIndex.get(conn.id);
    if (seatIndex !== undefined) {
      const seat = this.seats[seatIndex];
      if (this.phase === "idle" || this.phase === "betting") {
        // Refund any bets already placed during betting phase.
        if (this.phase === "betting" && seat.totalBet > 0 && info) {
          info.gold += seat.totalBet;
          await this.persistGold(info);
        }
        this.freeSeat(seatIndex);
      } else {
        // Mid-round (spinning/resolving): leave bets to resolve, clear seat after.
        seat.playerId = null;
        seat.playerName = null;
        seat.playerColor = null;
        seat.ready = false;
      }
      this.connIdToSeatIndex.delete(conn.id);
      if (info?.authId) this.authIdToSeatIndex.delete(info.authId);
      this.broadcastState();
    }

    this.broadcast({ type: "player-left", playerId: conn.id });
  }

  // ────────────────────────────── seating ─────────────────────────────

  private handleTakeSeat(
    conn: Party.Connection,
    info: ConnInfo,
    seatIndex: number,
  ) {
    if (
      !Number.isInteger(seatIndex) ||
      seatIndex < 0 ||
      seatIndex >= ROULETTE_CONFIG.seatCount
    ) {
      this.sendTo(conn, {
        type: "roulette-error",
        message: "Siège invalide.",
      });
      return;
    }
    if (this.connIdToSeatIndex.has(conn.id)) {
      this.sendTo(conn, {
        type: "roulette-error",
        message: "Tu es déjà assis.",
      });
      return;
    }
    const seat = this.seats[seatIndex];
    if (seat.playerId) {
      this.sendTo(conn, {
        type: "roulette-error",
        message: "Place prise.",
      });
      return;
    }
    if (this.phase !== "idle" && this.phase !== "betting") {
      this.sendTo(conn, {
        type: "roulette-error",
        message: "Tu ne peux pas t'asseoir pendant le spin.",
      });
      return;
    }

    seat.playerId = conn.id;
    seat.playerName = info.name;
    seat.playerColor =
      this.players.get(conn.id)?.color ?? AVATAR_COLORS[0];
    seat.gold = info.gold;
    seat.totalBet = 0;
    seat.bets = {};
    seat.lastDelta = 0;
    seat.status = "waiting";
    seat.ready = false;

    this.connIdToSeatIndex.set(conn.id, seatIndex);
    if (info.authId) this.authIdToSeatIndex.set(info.authId, seatIndex);

    this.broadcastState();
  }

  private handleLeaveSeat(connId: string) {
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined) return;
    if (this.phase !== "idle" && this.phase !== "betting") {
      this.sendTo(this.connOf(connId), {
        type: "roulette-error",
        message: "Attends la fin du spin pour quitter.",
      });
      return;
    }
    // If bets are placed, refund them before freeing the seat.
    const seat = this.seats[seatIndex];
    const info = this.connInfo.get(connId);
    if (seat.totalBet > 0 && info) {
      info.gold += seat.totalBet;
      this.sendGoldTo(connId, info.gold);
      void this.persistGold(info);
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

  // ────────────────────────────── betting flow ────────────────────────

  private handleReady(connId: string) {
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined) return;
    const seat = this.seats[seatIndex];
    if (!seat.playerId) return;
    if (this.phase !== "idle") return;
    seat.ready = true;
    this.broadcastState();
    this.maybeStartBetting();
  }

  private maybeStartBetting() {
    const active = this.seats.filter((s) => s.playerId);
    if (active.length === 0) return;
    if (active.every((s) => s.ready)) this.startBetting();
  }

  private startBetting() {
    this.phase = "betting";
    this.lastOutcome = null;
    for (const seat of this.seats) {
      if (seat.playerId) {
        seat.totalBet = 0;
        seat.bets = {};
        seat.lastDelta = 0;
        seat.status = "ready";
      }
    }
    this.setPhaseTimeout(ROULETTE_CONFIG.bettingDurationMs, () =>
      this.startSpinning(),
    );
    this.broadcastState();
  }

  private handlePlaceBet(
    conn: Party.Connection,
    info: ConnInfo,
    betKey: string,
    amountRaw: number,
  ) {
    if (this.phase !== "betting") return;
    const seatIndex = this.connIdToSeatIndex.get(conn.id);
    if (seatIndex === undefined) return;
    if (!isValidBetKey(betKey)) return;
    const amount = Math.floor(amountRaw);
    if (!Number.isFinite(amount) || amount < ROULETTE_CONFIG.minBet) return;
    if (amount > ROULETTE_CONFIG.maxBet) return;
    const seat = this.seats[seatIndex];
    if (!seat.playerId) return;
    if (info.gold < amount) {
      this.sendTo(conn, {
        type: "roulette-error",
        message: "Or Suprême insuffisant.",
      });
      return;
    }

    info.gold -= amount;
    seat.gold = info.gold;
    seat.bets[betKey] = (seat.bets[betKey] ?? 0) + amount;
    seat.totalBet += amount;
    this.sendGoldTo(conn.id, info.gold);
    this.broadcastState();
  }

  private async handleClearBets(conn: Party.Connection, info: ConnInfo) {
    if (this.phase !== "betting") return;
    const seatIndex = this.connIdToSeatIndex.get(conn.id);
    if (seatIndex === undefined) return;
    const seat = this.seats[seatIndex];
    if (seat.totalBet === 0) return;
    info.gold += seat.totalBet;
    seat.bets = {};
    seat.totalBet = 0;
    seat.gold = info.gold;
    this.sendGoldTo(conn.id, info.gold);
    await this.persistGold(info);
    this.broadcastState();
  }

  private startSpinning() {
    this.phase = "spinning";
    this.winningNumber = pickWinningNumber();
    this.setPhaseTimeout(ROULETTE_CONFIG.spinDurationMs, () =>
      this.resolveRound(),
    );
    this.broadcastState();
  }

  private async resolveRound() {
    this.phase = "resolving";
    const winning = this.winningNumber ?? pickWinningNumber();
    this.winningNumber = winning;

    const outcomeParts: string[] = [];
    for (const seat of this.seats) {
      if (!seat.playerId || seat.totalBet === 0) continue;
      let payout = 0;
      for (const [key, amount] of Object.entries(seat.bets)) {
        const mul = betMultiplier(key, winning);
        if (mul > 0) payout += Math.floor(amount * mul);
      }
      const delta = payout - seat.totalBet;
      seat.lastDelta = delta;
      if (payout > 0) {
        const info = this.connInfo.get(seat.playerId);
        if (info) {
          info.gold += payout;
          seat.gold = info.gold;
          this.sendGoldTo(seat.playerId, info.gold);
          await this.persistGold(info);
        }
      }
      if (delta > 0) {
        seat.status = "won";
        outcomeParts.push(`${seat.playerName} +${delta}`);
      } else if (delta < 0) {
        seat.status = "lost";
        outcomeParts.push(`${seat.playerName} ${delta}`);
      } else {
        seat.status = "pushed";
      }
    }

    this.recentNumbers = [
      winning,
      ...this.recentNumbers.slice(0, ROULETTE_CONFIG.recentNumbersKept - 1),
    ];
    this.lastOutcome =
      outcomeParts.length > 0
        ? `N°${winning} · ${outcomeParts.join(" · ")}`
        : `N°${winning} · aucune mise`;
    this.setPhaseTimeout(ROULETTE_CONFIG.resolveDurationMs, () =>
      this.returnToIdle(),
    );
    this.broadcastState();
  }

  private returnToIdle() {
    this.phase = "idle";
    this.winningNumber = null;
    for (const seat of this.seats) {
      if (seat.playerId) {
        seat.bets = {};
        seat.totalBet = 0;
        seat.status = "waiting";
        seat.ready = false;
      }
    }
    this.clearPhaseTimer();
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

  // ────────────────────────────── Supabase ────────────────────────────

  private async persistGold(info: ConnInfo) {
    if (!info.authId) return;
    await patchProfileGold(this.room, info.authId, info.gold);
  }

  // ────────────────────────────── helpers ─────────────────────────────

  private snapshotState(): RouletteState {
    return {
      phase: this.phase,
      seats: this.seats.map((s) => ({ ...s, bets: { ...s.bets } })),
      winningNumber: this.winningNumber,
      recentNumbers: [...this.recentNumbers],
      phaseEndsAt: this.phaseEndsAt,
      lastOutcome: this.lastOutcome,
    };
  }

  private broadcastState() {
    this.broadcast({ type: "roulette-state", state: this.snapshotState() });
  }

  private sendTo(
    conn: Party.Connection | undefined,
    msg: RouletteServerMessage,
  ) {
    if (!conn) return;
    conn.send(JSON.stringify(msg));
  }

  private sendGoldTo(connId: string, gold: number) {
    const conn = this.connOf(connId);
    if (conn) this.sendTo(conn, { type: "gold-update", gold });
  }

  private broadcast(msg: RouletteServerMessage, exclude: string[] = []) {
    this.room.broadcast(JSON.stringify(msg), exclude);
  }

  private connOf(id: string): Party.Connection | undefined {
    for (const conn of this.room.getConnections()) {
      if (conn.id === id) return conn;
    }
    return undefined;
  }
}

function makeEmptySeats(): RouletteSeat[] {
  return Array.from(
    { length: ROULETTE_CONFIG.seatCount },
    (_, i) => emptySeat(i),
  );
}

function emptySeat(seatIndex: number): RouletteSeat {
  return {
    seatIndex,
    playerId: null,
    playerName: null,
    playerColor: null,
    gold: 0,
    bets: {},
    totalBet: 0,
    lastDelta: 0,
    status: "empty",
    ready: false,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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
