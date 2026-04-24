import type * as Party from "partykit/server";
import type { ChatMessage, ServerMessage } from "../../shared/types";

type AuxClientMessage = { type: "chat"; text: string };

const MAX_HISTORY = 60;

type ConnName = { name: string; color: string };

export default class GlobalChatServer implements Party.Server {
  private chatHistory: ChatMessage[] = [];
  private names = new Map<string, ConnName>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const rawName = url.searchParams.get("name");
    const rawColor = url.searchParams.get("color");
    const name = sanitizeName(rawName) ?? `Invité-${conn.id.slice(0, 4)}`;
    const color = sanitizeColor(rawColor) ?? "#6366f1";
    this.names.set(conn.id, { name, color });

    this.sendTo(conn, {
      type: "welcome",
      selfId: conn.id,
      players: [],
      chat: this.chatHistory,
    });
  }

  onMessage(raw: string, sender: Party.Connection) {
    let data: AuxClientMessage;
    try {
      data = JSON.parse(raw) as AuxClientMessage;
    } catch {
      return;
    }
    if (data.type !== "chat") return;

    const text = sanitizeChat(data.text);
    if (!text) return;

    const who = this.names.get(sender.id);
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      playerId: sender.id,
      playerName: who?.name ?? "Invité",
      text,
      timestamp: Date.now(),
    };
    this.chatHistory.push(msg);
    if (this.chatHistory.length > MAX_HISTORY) this.chatHistory.shift();

    this.broadcast({ type: "chat", message: msg });
  }

  onClose(conn: Party.Connection) {
    this.names.delete(conn.id);
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

function sanitizeColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : null;
}

function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 200);
  return trimmed || null;
}
