import type * as Party from "partykit/server";
import type {
  DmClientMessage,
  DmConversation,
  DmMessage,
  DmServerMessage,
} from "../../shared/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConnInfo = { authId: string; username: string };

export default class DmHub implements Party.Server {
  private connIdToInfo = new Map<string, ConnInfo>();
  private authIdToConnIds = new Map<string, Set<string>>();

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const authId = sanitizeUuid(url.searchParams.get("authId"));
    const username = (url.searchParams.get("name") ?? "").slice(0, 40) || "?";
    if (!authId) {
      this.sendTo(conn, {
        type: "dm-error",
        message: "Authentification requise pour les DMs.",
      });
      conn.close();
      return;
    }

    this.connIdToInfo.set(conn.id, { authId, username });
    const bucket = this.authIdToConnIds.get(authId) ?? new Set<string>();
    bucket.add(conn.id);
    this.authIdToConnIds.set(authId, bucket);

    try {
      const conversations = await this.loadConversations(authId);
      this.sendTo(conn, {
        type: "dm-welcome",
        conversations,
      });
    } catch (e) {
      console.warn("[dm] failed to load conversations:", e);
      this.sendTo(conn, { type: "dm-welcome", conversations: [] });
    }
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const info = this.connIdToInfo.get(sender.id);
    if (!info) return;

    let data: DmClientMessage;
    try {
      data = JSON.parse(raw) as DmClientMessage;
    } catch {
      return;
    }

    switch (data.type) {
      case "send":
        await this.handleSend(sender, info, data);
        break;
      case "load-thread":
        await this.handleLoadThread(sender, info, data.partnerId);
        break;
      case "mark-read":
        await this.handleMarkRead(info, data.partnerId);
        break;
      case "lookup-user":
        await this.handleLookupUser(sender, info, data.query);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    const info = this.connIdToInfo.get(conn.id);
    if (!info) return;
    this.connIdToInfo.delete(conn.id);
    const bucket = this.authIdToConnIds.get(info.authId);
    if (bucket) {
      bucket.delete(conn.id);
      if (bucket.size === 0) this.authIdToConnIds.delete(info.authId);
    }
  }

  // ────────────────────────────── handlers ──────────────────────────────

  private async handleSend(
    sender: Party.Connection,
    info: ConnInfo,
    data: { recipientId: string; text: string },
  ) {
    const recipientId = sanitizeUuid(data.recipientId);
    const text = sanitizeDmText(data.text);
    if (!recipientId || !text) return;
    if (recipientId === info.authId) {
      this.sendTo(sender, {
        type: "dm-error",
        message: "Tu ne peux pas t'envoyer un DM à toi-même.",
      });
      return;
    }

    const inserted = await this.insertDm(info.authId, recipientId, text);
    if (!inserted) {
      this.sendTo(sender, {
        type: "dm-error",
        message: "Impossible d'envoyer le message.",
      });
      return;
    }

    // Echo to all sender connections (other tabs etc.)
    this.broadcastToUser(info.authId, {
      type: "dm-sent",
      message: inserted,
    });

    // Deliver to recipient if online.
    this.broadcastToUser(recipientId, {
      type: "dm-incoming",
      message: inserted,
    });
  }

  private async handleLoadThread(
    sender: Party.Connection,
    info: ConnInfo,
    partnerIdRaw: string,
  ) {
    const partnerId = sanitizeUuid(partnerIdRaw);
    if (!partnerId) return;
    try {
      const messages = await this.loadThread(info.authId, partnerId);
      this.sendTo(sender, {
        type: "dm-thread",
        partnerId,
        messages,
      });
    } catch (e) {
      console.warn("[dm] load thread failed:", e);
      this.sendTo(sender, {
        type: "dm-error",
        message: "Impossible de charger la conversation.",
      });
    }
  }

  private async handleMarkRead(info: ConnInfo, partnerIdRaw: string) {
    const partnerId = sanitizeUuid(partnerIdRaw);
    if (!partnerId) return;
    await this.markRead(info.authId, partnerId);
  }

  private async handleLookupUser(
    sender: Party.Connection,
    _info: ConnInfo,
    query: string,
  ) {
    const q = (query ?? "").trim().slice(0, 30);
    if (!q) {
      this.sendTo(sender, {
        type: "dm-user-lookup",
        query,
        results: [],
      });
      return;
    }
    try {
      const results = await this.lookupUser(q);
      this.sendTo(sender, {
        type: "dm-user-lookup",
        query,
        results,
      });
    } catch (e) {
      console.warn("[dm] lookup failed:", e);
      this.sendTo(sender, {
        type: "dm-user-lookup",
        query,
        results: [],
      });
    }
  }

  // ────────────────────────────── Supabase I/O ──────────────────────────

  private getEnv() {
    const env = (this.room as unknown as { env?: Record<string, string> })
      .env;
    const url = env?.SUPABASE_URL ?? readProcessEnv("SUPABASE_URL");
    const key =
      env?.SUPABASE_SERVICE_ROLE_KEY ??
      readProcessEnv("SUPABASE_SERVICE_ROLE_KEY");
    return url && key ? { url, key } : null;
  }

  private async sb<T>(
    path: string,
    init: RequestInit & { body?: string } = {},
  ): Promise<T | null> {
    const env = this.getEnv();
    if (!env) return null;
    const resp = await fetch(`${env.url}${path}`, {
      ...init,
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...((init.headers as Record<string, string>) ?? {}),
      },
    });
    if (!resp.ok) {
      console.warn("[dm] supabase", resp.status, await resp.text());
      return null;
    }
    if (resp.status === 204) return null;
    return (await resp.json()) as T;
  }

  private async insertDm(
    senderId: string,
    recipientId: string,
    content: string,
  ): Promise<DmMessage | null> {
    const rows = await this.sb<
      Array<{
        id: string;
        sender_id: string;
        recipient_id: string;
        content: string;
        created_at: string;
      }>
    >(`/rest/v1/dm_messages`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        sender_id: senderId,
        recipient_id: recipientId,
        content,
      }),
    });
    const row = rows?.[0];
    if (!row) return null;
    return {
      id: row.id,
      senderId: row.sender_id,
      recipientId: row.recipient_id,
      content: row.content,
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  private async loadThread(
    userA: string,
    userB: string,
  ): Promise<DmMessage[]> {
    const params = new URLSearchParams();
    params.set(
      "or",
      `(and(sender_id.eq.${userA},recipient_id.eq.${userB}),and(sender_id.eq.${userB},recipient_id.eq.${userA}))`,
    );
    params.set("order", "created_at.asc");
    params.set("limit", "100");

    const rows = await this.sb<
      Array<{
        id: string;
        sender_id: string;
        recipient_id: string;
        content: string;
        created_at: string;
      }>
    >(`/rest/v1/dm_messages?${params.toString()}`);
    return (rows ?? []).map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      recipientId: row.recipient_id,
      content: row.content,
      createdAt: new Date(row.created_at).getTime(),
    }));
  }

  private async loadConversations(
    authId: string,
  ): Promise<DmConversation[]> {
    // Pull the most recent 200 messages involving this user, then collapse per partner.
    const params = new URLSearchParams();
    params.set("or", `(sender_id.eq.${authId},recipient_id.eq.${authId})`);
    params.set("order", "created_at.desc");
    params.set("limit", "200");

    const rows = await this.sb<
      Array<{
        id: string;
        sender_id: string;
        recipient_id: string;
        content: string;
        created_at: string;
        read_at: string | null;
      }>
    >(`/rest/v1/dm_messages?${params.toString()}`);
    if (!rows) return [];

    const byPartner = new Map<
      string,
      {
        last: {
          id: string;
          sender_id: string;
          recipient_id: string;
          content: string;
          created_at: string;
        };
        unread: number;
      }
    >();
    for (const row of rows) {
      const partnerId =
        row.sender_id === authId ? row.recipient_id : row.sender_id;
      const existing = byPartner.get(partnerId);
      if (!existing) {
        byPartner.set(partnerId, { last: row, unread: 0 });
      }
      const bucket = byPartner.get(partnerId)!;
      if (row.recipient_id === authId && row.read_at == null) {
        bucket.unread++;
      }
    }

    const partnerIds = Array.from(byPartner.keys());
    if (partnerIds.length === 0) return [];

    // Fetch their profiles in one roundtrip.
    const profParams = new URLSearchParams();
    profParams.set("id", `in.(${partnerIds.join(",")})`);
    profParams.set("select", "id,username,avatar_url");
    const profRows = await this.sb<
      Array<{ id: string; username: string; avatar_url: string | null }>
    >(`/rest/v1/profiles?${profParams.toString()}`);
    const profileById = new Map<
      string,
      { username: string; avatarUrl?: string }
    >();
    for (const p of profRows ?? []) {
      profileById.set(p.id, {
        username: p.username,
        avatarUrl: p.avatar_url ?? undefined,
      });
    }

    const convos: DmConversation[] = [];
    for (const [partnerId, bucket] of byPartner) {
      const profile = profileById.get(partnerId);
      const row = bucket.last;
      convos.push({
        partnerId,
        partnerName: profile?.username ?? "Joueur inconnu",
        partnerAvatarUrl: profile?.avatarUrl,
        lastMessage: {
          id: row.id,
          senderId: row.sender_id,
          recipientId: row.recipient_id,
          content: row.content,
          createdAt: new Date(row.created_at).getTime(),
        },
        unreadCount: bucket.unread,
      });
    }

    convos.sort(
      (a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt,
    );
    return convos;
  }

  private async markRead(authId: string, partnerId: string) {
    const params = new URLSearchParams();
    params.set("sender_id", `eq.${partnerId}`);
    params.set("recipient_id", `eq.${authId}`);
    params.set("read_at", "is.null");
    await this.sb(`/rest/v1/dm_messages?${params.toString()}`, {
      method: "PATCH",
      body: JSON.stringify({ read_at: new Date().toISOString() }),
    });
  }

  private async lookupUser(query: string) {
    const q = query.replace(/[%,]/g, "");
    const params = new URLSearchParams();
    params.set("username", `ilike.%${q}%`);
    params.set("select", "id,username,avatar_url");
    params.set("limit", "8");
    const rows = await this.sb<
      Array<{ id: string; username: string; avatar_url: string | null }>
    >(`/rest/v1/profiles?${params.toString()}`);
    return (rows ?? []).map((r) => ({
      id: r.id,
      username: r.username,
      avatarUrl: r.avatar_url ?? undefined,
    }));
  }

  // ────────────────────────────── helpers ───────────────────────────────

  private sendTo(conn: Party.Connection, msg: DmServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcastToUser(authId: string, msg: DmServerMessage) {
    const bucket = this.authIdToConnIds.get(authId);
    if (!bucket || bucket.size === 0) return;
    const payload = JSON.stringify(msg);
    for (const connId of bucket) {
      const conn = this.connOf(connId);
      if (conn) conn.send(payload);
    }
  }

  private connOf(id: string): Party.Connection | undefined {
    for (const conn of this.room.getConnections()) {
      if (conn.id === id) return conn;
    }
    return undefined;
  }
}

function sanitizeUuid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return UUID_RE.test(raw) ? raw : null;
}

function sanitizeDmText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 500);
  return trimmed || null;
}

function readProcessEnv(key: string): string | undefined {
  const globalProc = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  return globalProc?.env?.[key];
}
