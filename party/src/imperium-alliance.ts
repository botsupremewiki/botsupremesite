import type * as Party from "partykit/server";
import type { ChatMessage } from "../../shared/types";
import { PersistentChatHistory } from "./lib/chat-storage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConnInfo = { authId: string; username: string };

type ClientMessage =
  | { type: "send"; text: string }
  | { type: "ping" };

type ServerMessage =
  | { type: "welcome"; messages: ChatMessage[]; members: Array<{ authId: string; username: string }> }
  | { type: "message"; message: ChatMessage }
  | { type: "presence"; members: Array<{ authId: string; username: string }> }
  | { type: "error"; message: string };

/**
 * Salon de chat alliance Imperium.
 * Room name = imperium_alliances.id (uuid).
 * À la connexion : valide via Supabase REST que l'authId est bien membre de l'alliance.
 */
export default class ImperiumAllianceRoom implements Party.Server {
  private connIdToInfo = new Map<string, ConnInfo>();
  private history: PersistentChatHistory;

  constructor(readonly room: Party.Room) {
    this.history = new PersistentChatHistory(room, 200, 7 * 24 * 60 * 60 * 1000);
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const authId = sanitizeUuid(url.searchParams.get("authId"));
    const username = (url.searchParams.get("name") ?? "").slice(0, 40) || "?";
    if (!authId) {
      this.sendTo(conn, { type: "error", message: "Authentification requise." });
      conn.close();
      return;
    }
    if (!UUID_RE.test(this.room.id)) {
      this.sendTo(conn, { type: "error", message: "Salon invalide." });
      conn.close();
      return;
    }

    // Vérifie l'appartenance à l'alliance via Supabase REST
    const isMember = await this.checkMembership(authId, this.room.id);
    if (!isMember) {
      this.sendTo(conn, {
        type: "error",
        message: "Tu n'es pas membre de cette alliance.",
      });
      conn.close();
      return;
    }

    this.connIdToInfo.set(conn.id, { authId, username });

    const messages = await this.history.list();
    this.sendTo(conn, {
      type: "welcome",
      messages,
      members: this.currentMembers(),
    });
    this.broadcastPresence();
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const info = this.connIdToInfo.get(sender.id);
    if (!info) return;
    let data: ClientMessage;
    try {
      data = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    if (data.type === "send") {
      const text = sanitizeText(data.text);
      if (!text) return;
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        playerId: info.authId,
        playerName: info.username,
        text,
        timestamp: Date.now(),
      };
      await this.history.add(msg);
      this.broadcast({ type: "message", message: msg });
    }
  }

  onClose(conn: Party.Connection) {
    if (this.connIdToInfo.delete(conn.id)) {
      this.broadcastPresence();
    }
  }

  // ────────────────────────────── helpers ────────────────────────────

  private currentMembers(): Array<{ authId: string; username: string }> {
    const seen = new Set<string>();
    const out: Array<{ authId: string; username: string }> = [];
    for (const info of this.connIdToInfo.values()) {
      if (seen.has(info.authId)) continue;
      seen.add(info.authId);
      out.push({ authId: info.authId, username: info.username });
    }
    return out;
  }

  private broadcastPresence() {
    this.broadcast({ type: "presence", members: this.currentMembers() });
  }

  private sendTo(conn: Party.Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMessage) {
    const payload = JSON.stringify(msg);
    for (const conn of this.room.getConnections()) {
      conn.send(payload);
    }
  }

  // ────────────────────────────── Supabase ───────────────────────────

  private getEnv() {
    const env = (this.room as unknown as { env?: Record<string, string> }).env;
    const url = env?.SUPABASE_URL ?? readProcessEnv("SUPABASE_URL");
    const key =
      env?.SUPABASE_SERVICE_ROLE_KEY ??
      readProcessEnv("SUPABASE_SERVICE_ROLE_KEY");
    return url && key ? { url, key } : null;
  }

  private async checkMembership(
    authId: string,
    allianceId: string,
  ): Promise<boolean> {
    const env = this.getEnv();
    if (!env) {
      console.warn("[imperium-alliance] missing Supabase env, allowing");
      return true;
    }
    const params = new URLSearchParams();
    params.set("user_id", `eq.${authId}`);
    params.set("alliance_id", `eq.${allianceId}`);
    params.set("select", "user_id");
    params.set("limit", "1");
    try {
      const resp = await fetch(
        `${env.url}/rest/v1/imperium_alliance_members?${params.toString()}`,
        {
          headers: {
            apikey: env.key,
            Authorization: `Bearer ${env.key}`,
            Accept: "application/json",
          },
        },
      );
      if (!resp.ok) return false;
      const rows = (await resp.json()) as Array<unknown>;
      return rows.length > 0;
    } catch (e) {
      console.warn("[imperium-alliance] checkMembership failed:", e);
      return false;
    }
  }
}

function sanitizeUuid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return UUID_RE.test(raw) ? raw : null;
}

function sanitizeText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 500);
  return trimmed || null;
}

function readProcessEnv(key: string): string | undefined {
  const globalProc = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return globalProc?.env?.[key];
}
