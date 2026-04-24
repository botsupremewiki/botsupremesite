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
import { minesMultiplier, pickMinePositions } from "./lib/mines-math";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConnInfo = {
  authId: string | null;
  name: string;
  gold: number;
  isAdmin: boolean;
};

type GameState = {
  rows: number;
  cols: number;
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
      : 1000;

    let gold = queryGold;
    let isAdmin = false;
    if (authId) {
      const profile = await fetchProfile(this.room, authId);
      if (profile) {
        if (Number.isFinite(profile.gold)) gold = profile.gold;
        isAdmin = !!profile.is_admin;
      }
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
    data: { rows: number; cols: number; minesCount: number; bet: number },
  ) {
    if (this.games.get(conn.id)?.status === "playing") {
      this.sendTo(conn, {
        type: "mines-error",
        message: "Partie déjà en cours.",
      });
      return;
    }
    const rows = Math.floor(data.rows);
    const cols = Math.floor(data.cols);
    const bet = Math.floor(data.bet);
    const minesCount = Math.floor(data.minesCount);
    if (
      !Number.isInteger(rows) ||
      !Number.isInteger(cols) ||
      rows < MINES_CONFIG.minSize ||
      rows > MINES_CONFIG.maxSize ||
      cols < MINES_CONFIG.minSize ||
      cols > MINES_CONFIG.maxSize
    ) {
      this.sendTo(conn, {
        type: "mines-error",
        message: `Grille entre ${MINES_CONFIG.minSize}×${MINES_CONFIG.minSize} et ${MINES_CONFIG.maxSize}×${MINES_CONFIG.maxSize}.`,
      });
      return;
    }
    const total = rows * cols;
    if (
      !Number.isInteger(minesCount) ||
      minesCount < 1 ||
      minesCount > total - 1
    ) {
      this.sendTo(conn, {
        type: "mines-error",
        message: `Entre 1 et ${total - 1} mines.`,
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
      rows,
      cols,
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
    const total = game.rows * game.cols;
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
    const safeRemaining =
      game.rows * game.cols - game.minesCount - game.revealed.size;
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
    const total = game.rows * game.cols;
    const mul = minesMultiplier(
      total,
      game.minesCount,
      game.revealed.size,
      MINES_CONFIG.rtp,
    );
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
    const total = game.rows * game.cols;
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
    const multiplier =
      safeRevealed > 0 && game.status !== "busted"
        ? minesMultiplier(total, game.minesCount, safeRevealed, MINES_CONFIG.rtp)
        : game.status === "busted"
          ? 0
          : 0;
    const nextMultiplier = minesMultiplier(
      total,
      game.minesCount,
      safeRevealed + 1,
      MINES_CONFIG.rtp,
    );
    const potentialPayout = Math.floor(game.bet * multiplier);

    return {
      gridRows: game.rows,
      gridCols: game.cols,
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
