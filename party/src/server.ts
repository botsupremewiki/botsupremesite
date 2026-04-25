import type * as Party from "partykit/server";
import type {
  ChatMessage,
  ClientMessage,
  Player,
  ServerMessage,
} from "../../shared/types";
import { PLAZA_CONFIG } from "../../shared/types";
import { fetchProfile } from "./lib/supabase";
import { PersistentChatHistory } from "./lib/chat-storage";

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

export default class PlazaServer implements Party.Server {
  private players = new Map<string, Player>();
  private chat: PersistentChatHistory;
  private colorCursor = 0;
  private connIdToIsAdmin = new Map<string, boolean>();

  constructor(readonly room: Party.Room) {
    this.chat = new PersistentChatHistory(room, PLAZA_CONFIG.chatHistorySize);
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    if (this.players.size >= PLAZA_CONFIG.maxPlayers) {
      this.send(conn, { type: "error", message: "La plaza est pleine." });
      conn.close();
      return;
    }

    const url = new URL(ctx.request.url);
    const authId = sanitizeAuthId(url.searchParams.get("authId"));
    const providedName = sanitizeName(url.searchParams.get("name"));
    const avatarUrl = sanitizeUrl(url.searchParams.get("avatarUrl"));

    let isAdmin = false;
    let gold: number | null = null;
    if (authId) {
      const profile = await fetchProfile(this.room, authId);
      if (profile?.is_admin) isAdmin = true;
      if (profile && Number.isFinite(profile.gold)) gold = profile.gold;
    }
    this.connIdToIsAdmin.set(conn.id, isAdmin);

    // Spawn at the centre of the scene — every plaza/casino layout is
    // built around the centre point (the back portal sits there too).
    // A small jitter avoids stacking sprites when several players land
    // at once.
    const player: Player = {
      id: conn.id,
      authId: authId ?? undefined,
      name: providedName ?? `Invité-${conn.id.slice(0, 4)}`,
      avatarUrl: avatarUrl ?? undefined,
      x: PLAZA_CONFIG.width / 2 + (Math.random() - 0.5) * 24,
      y: PLAZA_CONFIG.height / 2 + (Math.random() - 0.5) * 24,
      direction: "down",
      color: AVATAR_COLORS[this.colorCursor++ % AVATAR_COLORS.length],
    };
    this.players.set(conn.id, player);

    const chat = await this.chat.list();
    this.send(conn, {
      type: "welcome",
      selfId: conn.id,
      players: Array.from(this.players.values()),
      chat,
      ...(gold !== null ? { gold } : {}),
    });

    this.broadcast({ type: "player-joined", player }, [conn.id]);
  }

  async onMessage(raw: string, sender: Party.Connection) {
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
        if (
          typeof data.x !== "number" ||
          typeof data.y !== "number" ||
          !Number.isFinite(data.x) ||
          !Number.isFinite(data.y)
        ) {
          return;
        }
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
        // Authenticated players can't rename — their name comes from Discord.
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
          isAdmin: this.connIdToIsAdmin.get(sender.id) || undefined,
        };
        await this.chat.add(message);
        this.broadcast({ type: "chat", message });
        break;
      }
    }
  }

  onClose(conn: Party.Connection) {
    this.connIdToIsAdmin.delete(conn.id);
    if (!this.players.delete(conn.id)) return;
    this.broadcast({ type: "player-left", playerId: conn.id });
  }

  private send(conn: Party.Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMessage, exclude: string[] = []) {
    this.room.broadcast(JSON.stringify(msg), exclude);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  if (!trimmed) return null;
  return trimmed;
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
