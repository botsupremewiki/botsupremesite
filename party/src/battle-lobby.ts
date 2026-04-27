import type * as Party from "partykit/server";
import type {
  BattleLobbyClientMessage,
  BattleLobbyServerMessage,
} from "../../shared/types";
import { BATTLE_CONFIG } from "../../shared/types";
import { fetchTcgDeckById } from "./lib/supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Queued = {
  conn: Party.Connection;
  authId: string;
  username: string;
  deckId: string;
};

/**
 * Matchmaking lobby.
 * Routes :
 *   /parties/battlelobby/pokemon         → PvP fun (FIFO)
 *   /parties/battlelobby/ranked-pokemon  → PvP classé (FIFO + roomId "ranked-…")
 * Le préfixe "ranked-" du room.id détermine le mode.
 */
export default class BattleLobbyServer implements Party.Server {
  private queue: Queued[] = [];
  private connInfo = new Map<
    string,
    { authId: string; username: string }
  >();
  private readonly rankedMode: boolean;

  constructor(readonly room: Party.Room) {
    this.rankedMode = room.id.startsWith("ranked-");
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const rawAuthId = url.searchParams.get("authId");
    const authId =
      typeof rawAuthId === "string" && UUID_RE.test(rawAuthId)
        ? rawAuthId
        : null;
    const username = sanitizeName(url.searchParams.get("name")) ?? null;
    if (!authId || !username) {
      this.sendTo(conn, {
        type: "lobby-error",
        message: "Connecte-toi pour entrer en file d'attente.",
      });
      conn.close();
      return;
    }
    this.connInfo.set(conn.id, { authId, username });
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const info = this.connInfo.get(sender.id);
    if (!info) return;
    let data: BattleLobbyClientMessage;
    try {
      data = JSON.parse(raw) as BattleLobbyClientMessage;
    } catch {
      return;
    }
    if (data.type === "queue") {
      await this.handleQueue(sender, info, data.deckId);
    } else if (data.type === "leave-queue") {
      this.removeFromQueue(sender.id);
      this.broadcastPositions();
    }
  }

  onClose(conn: Party.Connection) {
    this.removeFromQueue(conn.id);
    this.connInfo.delete(conn.id);
    this.broadcastPositions();
  }

  private async handleQueue(
    conn: Party.Connection,
    info: { authId: string; username: string },
    deckId: string,
  ) {
    if (typeof deckId !== "string" || deckId.length === 0) {
      this.sendTo(conn, {
        type: "lobby-error",
        message: "Choisis un deck pour entrer en file.",
      });
      return;
    }
    // Validate deck exists and belongs to player.
    const deck = await fetchTcgDeckById(this.room, deckId);
    if (!deck) {
      this.sendTo(conn, {
        type: "lobby-error",
        message: "Deck introuvable.",
      });
      return;
    }
    const total = (deck.cards ?? []).reduce((s, c) => s + c.count, 0);
    if (total !== BATTLE_CONFIG.deckSize) {
      this.sendTo(conn, {
        type: "lobby-error",
        message: `Ce deck est invalide (${total}/${BATTLE_CONFIG.deckSize} cartes).`,
      });
      return;
    }

    // Si déjà en file, on remplace.
    this.removeFromQueue(conn.id);
    this.queue.push({
      conn,
      authId: info.authId,
      username: info.username,
      deckId,
    });
    this.tryPair();
    this.broadcastPositions();
  }

  private tryPair() {
    while (this.queue.length >= 2) {
      const a = this.queue.shift()!;
      const b = this.queue.shift()!;
      if (a.authId === b.authId) {
        // Même utilisateur (deux onglets) — on remet le 2ᵉ en file.
        this.queue.unshift(b);
        // Et on remet a aussi pour pas le pénaliser.
        this.queue.unshift(a);
        return;
      }
      const baseRoomId = crypto.randomUUID();
      const roomId = this.rankedMode ? `ranked-${baseRoomId}` : baseRoomId;
      this.sendTo(a.conn, {
        type: "matched",
        roomId,
        deckId: a.deckId,
      });
      this.sendTo(b.conn, {
        type: "matched",
        roomId,
        deckId: b.deckId,
      });
    }
  }

  private removeFromQueue(connId: string) {
    this.queue = this.queue.filter((q) => q.conn.id !== connId);
  }

  private broadcastPositions() {
    for (let i = 0; i < this.queue.length; i++) {
      this.sendTo(this.queue[i].conn, {
        type: "queued",
        position: i + 1,
      });
    }
  }

  private sendTo(
    conn: Party.Connection,
    msg: BattleLobbyServerMessage,
  ) {
    conn.send(JSON.stringify(msg));
  }
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length >= 2 ? trimmed : null;
}
