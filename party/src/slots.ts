import type * as Party from "partykit/server";
import type {
  ChatMessage,
  SlotsClientMessage,
  SlotsServerMessage,
  SlotsSpin,
  SlotsSymbol,
} from "../../shared/types";
import { PLAZA_CONFIG, SLOTS_CONFIG } from "../../shared/types";
import { fetchProfile, patchProfileGold } from "./lib/supabase";
import { PersistentChatHistory } from "./lib/chat-storage";
import { evaluateSpin, spinReel } from "./lib/slots-math";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConnInfo = {
  authId: string | null;
  name: string;
  gold: number;
  isAdmin: boolean;
  history: SlotsSpin[];
  spinningUntil: number; // ms epoch — 0 if idle
};

const GUEST_SANDBOX_GOLD = 1000;

export default class SlotsServer implements Party.Server {
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
        // DB read failed — trust the page's SSR-loaded gold so the player
        // can keep playing. patchProfileGold below still writes back, so
        // the DB row stays in sync.
        gold = queryGold;
      } else {
        gold = 0;
      }
    } else {
      // Guest: sandbox value, never persisted (no authId).
      gold = queryGold ?? GUEST_SANDBOX_GOLD;
    }

    this.connInfo.set(conn.id, {
      authId,
      name,
      gold,
      isAdmin,
      history: [],
      spinningUntil: 0,
    });

    const chat = await this.chat.list();
    this.sendTo(conn, {
      type: "slots-welcome",
      selfId: conn.id,
      gold,
      history: [],
      chat,
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
        await this.handleSpin(sender, info, data.bet);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    this.connInfo.delete(conn.id);
  }

  private async handleSpin(
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

    // Deduct bet up front
    info.gold -= bet;

    const reels: SlotsSymbol[] = Array.from(
      { length: SLOTS_CONFIG.reelCount },
      () => spinReel(),
    );
    const { multiplier, kind } = evaluateSpin(reels);
    const win = Math.floor(bet * multiplier);
    if (win > 0) info.gold += win;

    info.spinningUntil = now + SLOTS_CONFIG.spinDurationMs;

    const spin: SlotsSpin = {
      id: crypto.randomUUID(),
      reels,
      bet,
      win,
      multiplier,
      kind,
      timestamp: now,
    };
    info.history = [spin, ...info.history].slice(0, SLOTS_CONFIG.historySize);

    await this.persistGold(info);
    this.sendTo(conn, { type: "slots-result", spin });
    this.sendTo(conn, { type: "gold-update", gold: info.gold });
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
