// PartyKit lobby de matchmaking LoR (Phase 3.6d).
//
// FIFO simple : 2 joueurs en file → match → roomId généré → les 2 reçoivent
// un message `lor-matched` avec le roomId pour rejoindre `battlelor/{roomId}`.
//
// Routes :
//   /parties/lorlobby/main  → file PvP fun unique (pas de ranked pour l'instant)

import type * as Party from "partykit/server";
import type {
  LorLobbyClientMessage,
  LorLobbyServerMessage,
} from "../../shared/types";
import { RUNETERRA_BATTLE_CONFIG } from "../../shared/types";
import { fetchTcgDeckById } from "./lib/supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Queued = {
  conn: Party.Connection;
  authId: string;
  username: string;
  deckId: string;
};

export default class LorLobbyServer implements Party.Server {
  private queue: Queued[] = [];
  private connInfo = new Map<
    string,
    { authId: string; username: string }
  >();

  constructor(readonly room: Party.Room) {}

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
        type: "lor-lobby-error",
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
    let data: LorLobbyClientMessage;
    try {
      data = JSON.parse(raw) as LorLobbyClientMessage;
    } catch {
      return;
    }
    if (data.type === "lor-queue") {
      await this.handleQueue(sender, info, data.deckId);
    } else if (data.type === "lor-leave-queue") {
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
        type: "lor-lobby-error",
        message: "Choisis un deck pour entrer en file.",
      });
      return;
    }
    const deck = await fetchTcgDeckById(this.room, deckId);
    if (!deck) {
      this.sendTo(conn, {
        type: "lor-lobby-error",
        message: "Deck introuvable.",
      });
      return;
    }
    const total = (deck.cards ?? []).reduce((s, c) => s + c.count, 0);
    if (total !== RUNETERRA_BATTLE_CONFIG.deckSize) {
      this.sendTo(conn, {
        type: "lor-lobby-error",
        message: `Ce deck est invalide (${total}/${RUNETERRA_BATTLE_CONFIG.deckSize} cartes).`,
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
        // Même utilisateur (deux onglets) — on les remet en file dans l'ordre.
        this.queue.unshift(b);
        this.queue.unshift(a);
        return;
      }
      const roomId = crypto.randomUUID();
      this.sendTo(a.conn, {
        type: "lor-matched",
        roomId,
        deckId: a.deckId,
      });
      this.sendTo(b.conn, {
        type: "lor-matched",
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
        type: "lor-queued",
        position: i + 1,
      });
    }
  }

  private sendTo(conn: Party.Connection, msg: LorLobbyServerMessage) {
    conn.send(JSON.stringify(msg));
  }
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length >= 2 ? trimmed : null;
}
