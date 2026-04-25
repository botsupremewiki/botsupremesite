import type * as Party from "partykit/server";
import type {
  ChatMessage,
  SlotMachineConfig,
  SlotMachineId,
  SlotsAutospinState,
  SlotsClientMessage,
  SlotsServerMessage,
  SlotsSpin,
  SlotsSymbolKey,
} from "../../shared/types";
import {
  PLAZA_CONFIG,
  SLOTS_CONFIG,
  SLOT_MACHINES,
} from "../../shared/types";
import { fetchProfile, patchProfileGold } from "./lib/supabase";
import { PersistentChatHistory } from "./lib/chat-storage";
import { evaluateSpin, spinReel } from "./lib/slots-math";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GUEST_SANDBOX_GOLD = 1000;
const BIG_WIN_THRESHOLD = 25; // multiplier ≥ 25× bet stops autospin if requested

type ConnInfo = {
  authId: string | null;
  name: string;
  gold: number;
  isAdmin: boolean;
  history: SlotsSpin[];
  spinningUntil: number;
  // Autospin state per connection.
  autospin: SlotsAutospinState | null;
  autospinTimer: ReturnType<typeof setTimeout> | null;
};

export default class SlotsServer implements Party.Server {
  private chat: PersistentChatHistory;
  private connInfo = new Map<string, ConnInfo>();
  private machine: SlotMachineConfig;

  constructor(readonly room: Party.Room) {
    this.chat = new PersistentChatHistory(room, PLAZA_CONFIG.chatHistorySize);
    // Room id encodes the machine id (e.g. "verger-dore"). Fall back to
    // the first machine if an unknown room name is requested.
    const roomId = room.id as SlotMachineId;
    this.machine = SLOT_MACHINES[roomId] ?? SLOT_MACHINES["verger-dore"];
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
      spinningUntil: 0,
      autospin: null,
      autospinTimer: null,
    });

    const chat = await this.chat.list();
    this.sendTo(conn, {
      type: "slots-welcome",
      selfId: conn.id,
      gold,
      history: [],
      chat,
      machine: this.machine,
      autospin: null,
    });
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const info = this.connInfo.get(sender.id);
    if (!info) return;

    let data: SlotsClientMessage | { type: "chat"; text: string };
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
      case "slots-spin":
        this.cancelAutospin(info);
        await this.runSingleSpin(sender, info, data.bet);
        break;
      case "slots-autospin-start":
        await this.startAutospin(sender, info, data);
        break;
      case "slots-autospin-stop":
        this.cancelAutospin(info);
        this.sendTo(sender, {
          type: "slots-autospin-state",
          autospin: null,
        });
        break;
    }
  }

  onClose(conn: Party.Connection) {
    const info = this.connInfo.get(conn.id);
    if (info) this.cancelAutospin(info);
    this.connInfo.delete(conn.id);
  }

  // ──────────────────────────────── spinning ───────────────────────────────────

  private async startAutospin(
    conn: Party.Connection,
    info: ConnInfo,
    msg: { bet: number; count: number; stopOnBigWin: boolean },
  ) {
    if (info.autospin) {
      this.sendTo(conn, {
        type: "slots-error",
        message: "Auto-spin déjà en cours.",
      });
      return;
    }
    const allowedCounts = SLOTS_CONFIG.autoSpinChoices as readonly number[];
    if (!allowedCounts.includes(msg.count)) {
      this.sendTo(conn, {
        type: "slots-error",
        message: "Nombre d'auto-spins invalide.",
      });
      return;
    }
    const bet = Math.floor(Number(msg.bet));
    if (
      !Number.isFinite(bet) ||
      bet < SLOTS_CONFIG.minBet ||
      bet > SLOTS_CONFIG.maxBet
    ) {
      this.sendTo(conn, {
        type: "slots-error",
        message: `Mise entre ${SLOTS_CONFIG.minBet} et ${SLOTS_CONFIG.maxBet} OS.`,
      });
      return;
    }

    info.autospin = {
      remaining: msg.count,
      total: msg.count,
      bet,
      stopOnBigWin: !!msg.stopOnBigWin,
    };
    this.sendTo(conn, {
      type: "slots-autospin-state",
      autospin: info.autospin,
    });

    // Kick off immediately.
    void this.runAutospinTick(conn, info);
  }

  private async runAutospinTick(conn: Party.Connection, info: ConnInfo) {
    const auto = info.autospin;
    if (!auto || auto.remaining <= 0) {
      this.cancelAutospin(info);
      this.sendTo(conn, { type: "slots-autospin-state", autospin: null });
      return;
    }
    if (info.gold < auto.bet) {
      this.cancelAutospin(info);
      this.sendTo(conn, { type: "slots-autospin-state", autospin: null });
      this.sendTo(conn, {
        type: "slots-error",
        message: "Or Suprême insuffisant — auto-spin stoppé.",
      });
      return;
    }

    const spin = this.computeSpin(auto.bet, info);
    info.history = [spin, ...info.history].slice(0, SLOTS_CONFIG.historySize);

    auto.remaining -= 1;
    const stopHere =
      auto.remaining <= 0 ||
      (auto.stopOnBigWin && spin.multiplier >= BIG_WIN_THRESHOLD);
    const next = stopHere ? null : auto;
    info.autospin = next;

    await this.persistGold(info);
    this.sendTo(conn, {
      type: "slots-result",
      spin,
      autospin: next,
    });
    this.sendTo(conn, { type: "gold-update", gold: info.gold });

    if (next) {
      info.autospinTimer = setTimeout(() => {
        info.autospinTimer = null;
        void this.runAutospinTick(conn, info);
      }, SLOTS_CONFIG.autoSpinIntervalMs);
    }
  }

  private async runSingleSpin(
    conn: Party.Connection,
    info: ConnInfo,
    rawBet: number,
  ) {
    const now = Date.now();
    if (info.spinningUntil > now) {
      this.sendTo(conn, {
        type: "slots-error",
        message: "Reels still spinning…",
      });
      return;
    }
    const bet = Math.floor(Number(rawBet));
    if (
      !Number.isFinite(bet) ||
      bet < SLOTS_CONFIG.minBet ||
      bet > SLOTS_CONFIG.maxBet
    ) {
      this.sendTo(conn, {
        type: "slots-error",
        message: `Mise entre ${SLOTS_CONFIG.minBet} et ${SLOTS_CONFIG.maxBet} OS.`,
      });
      return;
    }
    if (info.gold < bet) {
      this.sendTo(conn, {
        type: "slots-error",
        message: "Or Suprême insuffisant.",
      });
      return;
    }

    const spin = this.computeSpin(bet, info);
    info.history = [spin, ...info.history].slice(0, SLOTS_CONFIG.historySize);
    info.spinningUntil = now + SLOTS_CONFIG.spinDurationMs;

    await this.persistGold(info);
    this.sendTo(conn, { type: "slots-result", spin, autospin: null });
    this.sendTo(conn, { type: "gold-update", gold: info.gold });
  }

  private computeSpin(bet: number, info: ConnInfo): SlotsSpin {
    info.gold -= bet;
    const reels: SlotsSymbolKey[] = Array.from(
      { length: SLOTS_CONFIG.reelCount },
      () => spinReel(this.machine),
    );
    const { multiplier, kind } = evaluateSpin(reels, this.machine);
    const win = Math.floor(bet * multiplier);
    if (win > 0) info.gold += win;
    return {
      id: crypto.randomUUID(),
      reels,
      bet,
      win,
      multiplier,
      kind,
      timestamp: Date.now(),
    };
  }

  private cancelAutospin(info: ConnInfo) {
    if (info.autospinTimer) {
      clearTimeout(info.autospinTimer);
      info.autospinTimer = null;
    }
    info.autospin = null;
  }

  private async persistGold(info: ConnInfo) {
    if (!info.authId) return;
    await patchProfileGold(this.room, info.authId, info.gold);
  }

  private sendTo(conn: Party.Connection, msg: SlotsServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: SlotsServerMessage, exclude: string[] = []) {
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
