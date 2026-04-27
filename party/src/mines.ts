import type * as Party from "partykit/server";
import type {
  ChatMessage,
  MinesClientMessage,
  MinesGameState,
  MinesServerMessage,
  MinesTile,
} from "../../shared/types";
import { MINES_CONFIG, PLAZA_CONFIG } from "../../shared/types";
import { fetchProfile, patchProfileGold } from "./lib/supabase";
import { PersistentChatHistory } from "./lib/chat-storage";
import {
  minesMultiplier,
  pickMinePositions,
  rtpForMines,
} from "./lib/mines-math";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConnInfo = {
  authId: string | null;
  name: string;
  gold: number;
  isAdmin: boolean;
};

const GUEST_SANDBOX_GOLD = 1000;

type GameState = {
  // Total tiles is always MINES_CONFIG.gridSize². No more rows/cols.
  minesCount: number;
  bet: number;
  mineSet: Set<number>;
  revealed: Set<number>;
  status: "playing" | "busted" | "cashed";
};

export default class MinesServer implements Party.Server {
  private chat: PersistentChatHistory;
  private connInfo = new Map<string, ConnInfo>();
  private games = new Map<string, GameState>(); // keyed by conn.id

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

    this.connInfo.set(conn.id, { authId, name, gold, isAdmin });

    const chat = await this.chat.list();
    this.sendTo(conn, {
      type: "mines-welcome",
      selfId: conn.id,
      gold,
      game: null,
      chat,
    });
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const info = this.connInfo.get(sender.id);
    if (!info) return;

    let data: MinesClientMessage | { type: "chat"; text: string };
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

      case "mines-start":
        await this.handleStart(sender, info, data);
        break;

      case "mines-reveal":
        await this.handleReveal(sender, info, data.index);
        break;

      case "mines-cash-out":
        await this.handleCashOut(sender, info);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    // If a game is in progress, keep it — they forfeit the bet implicitly.
    // The game is removed but gold is already deducted; we don't refund.
    this.games.delete(conn.id);
    this.connInfo.delete(conn.id);
  }

  private async handleStart(
    conn: Party.Connection,
    info: ConnInfo,
    data: { minesCount: number; bet: number },
  ) {
    if (this.games.get(conn.id)?.status === "playing") {
      this.sendTo(conn, {
        type: "mines-error",
        message: "Partie déjà en cours.",
      });
      return;
    }
    const total = MINES_CONFIG.gridSize * MINES_CONFIG.gridSize;
    const bet = Math.floor(data.bet);
    const minesCount = Math.floor(data.minesCount);
    if (
      !Number.isInteger(minesCount) ||
      minesCount < MINES_CONFIG.minMines ||
      minesCount > MINES_CONFIG.maxMines
    ) {
      this.sendTo(conn, {
        type: "mines-error",
        message: `Entre ${MINES_CONFIG.minMines} et ${MINES_CONFIG.maxMines} mines.`,
      });
      return;
    }
    if (
      !Number.isFinite(bet) ||
      bet < MINES_CONFIG.minBet ||
      bet > MINES_CONFIG.maxBet
    ) {
      this.sendTo(conn, {
        type: "mines-error",
        message: `Mise entre ${MINES_CONFIG.minBet} et ${MINES_CONFIG.maxBet} OS.`,
      });
      return;
    }
    if (info.gold < bet) {
      this.sendTo(conn, {
        type: "mines-error",
        message: "Or Suprême insuffisant.",
      });
      return;
    }

    const mineSet = pickMinePositions(total, minesCount);

    // Deduct the bet immediately.
    info.gold -= bet;
    await this.persistGold(info);
    this.sendTo(conn, { type: "gold-update", gold: info.gold });

    const game: GameState = {
      minesCount,
      bet,
      mineSet,
      revealed: new Set(),
      status: "playing",
    };
    this.games.set(conn.id, game);

    this.sendTo(conn, {
      type: "mines-state",
      game: this.snapshotGame(game),
    });
  }

  private async handleReveal(
    conn: Party.Connection,
    info: ConnInfo,
    indexRaw: number,
  ) {
    const game = this.games.get(conn.id);
    if (!game || game.status !== "playing") return;
    const index = Math.floor(indexRaw);
    const total = MINES_CONFIG.gridSize * MINES_CONFIG.gridSize;
    if (!Number.isInteger(index) || index < 0 || index >= total) return;
    if (game.revealed.has(index)) return;

    if (game.mineSet.has(index)) {
      // BUSTED
      game.revealed.add(index);
      game.status = "busted";
      this.sendTo(conn, {
        type: "mines-state",
        game: this.snapshotGame(game),
      });
      return;
    }

    game.revealed.add(index);
    const safeRemaining = total - game.minesCount - game.revealed.size;
    if (safeRemaining === 0) {
      // Cleared the whole board → auto cash out.
      await this.cashOut(conn, info, game);
      return;
    }
    this.sendTo(conn, {
      type: "mines-state",
      game: this.snapshotGame(game),
    });
  }

  private async handleCashOut(conn: Party.Connection, info: ConnInfo) {
    const game = this.games.get(conn.id);
    if (!game || game.status !== "playing") return;
    if (game.revealed.size === 0) {
      this.sendTo(conn, {
        type: "mines-error",
        message: "Révèle au moins une case avant de cash out.",
      });
      return;
    }
    await this.cashOut(conn, info, game);
  }

  private async cashOut(
    conn: Party.Connection,
    info: ConnInfo,
    game: GameState,
  ) {
    const total = MINES_CONFIG.gridSize * MINES_CONFIG.gridSize;
    const rtp = rtpForMines(game.minesCount);
    const mul = minesMultiplier(total, game.minesCount, game.revealed.size, rtp);
    const payout = Math.floor(game.bet * mul);
    game.status = "cashed";
    info.gold += payout;
    await this.persistGold(info);
    this.sendTo(conn, { type: "gold-update", gold: info.gold });
    this.sendTo(conn, {
      type: "mines-state",
      game: this.snapshotGame(game),
    });
  }

  private snapshotGame(game: GameState): MinesGameState {
    const total = MINES_CONFIG.gridSize * MINES_CONFIG.gridSize;
    const tiles: MinesTile[] = new Array(total).fill("hidden");

    for (const idx of game.revealed) {
      tiles[idx] = game.mineSet.has(idx) ? "mine" : "safe";
    }

    const ended = game.status !== "playing";
    let minesMap: number[] | undefined;
    if (ended) {
      minesMap = Array.from(game.mineSet).sort((a, b) => a - b);
      if (game.status === "busted") {
        // Reveal all mines visually.
        for (const idx of game.mineSet) tiles[idx] = "mine";
      }
    }

    const safeRevealed = Array.from(game.revealed).filter(
      (i) => !game.mineSet.has(i),
    ).length;
    const rtp = rtpForMines(game.minesCount);
    const multiplier =
      safeRevealed > 0 && game.status !== "busted"
        ? minesMultiplier(total, game.minesCount, safeRevealed, rtp)
        : 0;
    const nextMultiplier = minesMultiplier(
      total,
      game.minesCount,
      safeRevealed + 1,
      rtp,
    );
    const potentialPayout = Math.floor(game.bet * multiplier);

    return {
      minesCount: game.minesCount,
      bet: game.bet,
      revealedCount: safeRevealed,
      multiplier,
      potentialPayout,
      nextMultiplier,
      status: ended ? game.status : "playing",
      tiles,
      minesMap,
    };
  }

  private async persistGold(info: ConnInfo) {
    if (!info.authId) return;
    await patchProfileGold(this.room, info.authId, info.gold);
  }

  private sendTo(conn: Party.Connection, msg: MinesServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: MinesServerMessage, exclude: string[] = []) {
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
