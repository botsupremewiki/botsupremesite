import type * as Party from "partykit/server";
import type { ChatMessage, ServerMessage } from "../../shared/types";
import { fetchProfile } from "./lib/supabase";
import { PersistentChatHistory } from "./lib/chat-storage";

type AuxClientMessage = { type: "chat"; text: string };

const MAX_HISTORY = 200;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConnName = { name: string; isAdmin: boolean };

export default class GlobalChatServer implements Party.Server {
  private chat: PersistentChatHistory;
  private connInfo = new Map<string, ConnName>();

  constructor(readonly room: Party.Room) {
    this.chat = new PersistentChatHistory(room, MAX_HISTORY);
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const rawAuthId = url.searchParams.get("authId");
    const authId =
      typeof rawAuthId === "string" && UUID_RE.test(rawAuthId)
        ? rawAuthId
        : null;
    const name =
      sanitizeName(url.searchParams.get("name")) ?? `Invité-${conn.id.slice(0, 4)}`;

    let isAdmin = false;
    if (authId) {
      const profile = await fetchProfile(this.room, authId);
      if (profile?.is_admin) isAdmin = true;
    }
    this.connInfo.set(conn.id, { name, isAdmin });

    const history = await this.chat.list();
    this.sendTo(conn, {
      type: "welcome",
      selfId: conn.id,
      players: [],
      chat: history,
    });
  }

  async onMessage(raw: string, sender: Party.Connection) {
    let data: AuxClientMessage;
    try {
      data = JSON.parse(raw) as AuxClientMessage;
    } catch {
      return;
    }
    if (data.type !== "chat") return;

    const text = sanitizeChat(data.text);
    if (!text) return;

    const who = this.connInfo.get(sender.id);
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      playerId: sender.id,
      playerName: who?.name ?? "Invité",
      text,
      timestamp: Date.now(),
      isAdmin: who?.isAdmin || undefined,
    };
    await this.chat.add(msg);
    this.broadcast({ type: "chat", message: msg });
  }

  onClose(conn: Party.Connection) {
    this.connInfo.delete(conn.id);
  }

  private sendTo(conn: Party.Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMessage, exclude: string[] = []) {
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
