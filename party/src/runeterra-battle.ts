// PartyKit server pour les combats Runeterra (Phase 3.6a — squelette).
//
// Rôle : 1 salle = 1 partie entre 2 joueurs. Chaque joueur se connecte
// via /parties/battlelor/{roomId}?authId=...&deckId=...&name=... ; le
// serveur charge les decks depuis Supabase, crée l'état initial via le
// moteur pure-fonction, et synchronise l'état projeté à chaque message.
//
// Phase 3.6a : skeleton — onConnect, onMessage, onClose, broadcastState.
// Pas de matchmaking (les joueurs doivent partager le roomId — UI+lobby
// arrivent en Phase 3.6c).

import type * as Party from "partykit/server";
import type {
  RuneterraBattleClientMessage,
  RuneterraBattleServerMessage,
} from "../../shared/types";
import {
  applyMulligan,
  assignBlockers,
  createInitialState,
  declareAttack,
  EngineResult,
  InternalState,
  passPriority,
  playSpell,
  playUnit,
  projectStateForSeat,
  seatToId,
} from "./lib/runeterra-engine";
import { fetchTcgDecks } from "./lib/supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConnInfo = {
  authId: string | null;
  deckId: string | null;
  username: string;
  seatIdx: 0 | 1 | null;
};

export default class LorBattleServer implements Party.Server {
  private state: InternalState | null = null;
  private connInfo = new Map<string, ConnInfo>();
  private starting = false; // protège startBattle des appels concurrents

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const rawAuthId = url.searchParams.get("authId");
    const authId =
      typeof rawAuthId === "string" && UUID_RE.test(rawAuthId)
        ? rawAuthId
        : null;
    const deckId = url.searchParams.get("deckId");
    const username = sanitizeName(url.searchParams.get("name")) ?? "Invité";

    if (!authId) {
      this.send(conn, {
        type: "lor-battle-error",
        message: "Auth requise pour rejoindre une partie.",
      });
      conn.close();
      return;
    }
    if (!deckId) {
      this.send(conn, {
        type: "lor-battle-error",
        message: "deckId requis dans l'URL.",
      });
      conn.close();
      return;
    }

    // Détermine le siège libre. Si un siège est déjà occupé par le même
    // authId (reconnexion), on lui rend ce siège.
    const existing = [...this.connInfo.values()].find(
      (i) => i.authId === authId && i.seatIdx !== null,
    );
    let seatIdx: 0 | 1 | null;
    if (existing) {
      seatIdx = existing.seatIdx;
    } else {
      const occupied = new Set<number>();
      for (const info of this.connInfo.values()) {
        if (info.seatIdx !== null) occupied.add(info.seatIdx);
      }
      seatIdx = !occupied.has(0) ? 0 : !occupied.has(1) ? 1 : null;
    }

    this.connInfo.set(conn.id, { authId, deckId, username, seatIdx });

    this.send(conn, {
      type: "lor-battle-welcome",
      selfId: conn.id,
      selfSeat: seatIdx === null ? null : seatToId(seatIdx),
    });

    if (seatIdx === null) {
      // Salle pleine — spectateur. Pour l'instant on close (pas de mode
      // spectateur en Phase 3.6a).
      this.send(conn, {
        type: "lor-battle-error",
        message: "Salle pleine.",
      });
      conn.close();
      return;
    }

    // Si le combat est déjà en cours, envoie l'état actuel à la nouvelle
    // connexion (reconnexion).
    if (this.state !== null) {
      this.sendState(conn, seatIdx);
      return;
    }

    // Sinon, vérifie si les 2 sièges sont occupés pour démarrer.
    await this.maybeStartBattle();
  }

  private async maybeStartBattle() {
    if (this.state !== null || this.starting) return;
    const seatInfos: (ConnInfo | null)[] = [null, null];
    for (const info of this.connInfo.values()) {
      if (info.seatIdx === 0) seatInfos[0] = info;
      else if (info.seatIdx === 1) seatInfos[1] = info;
    }
    if (!seatInfos[0] || !seatInfos[1]) return;
    this.starting = true;
    try {
      await this.startBattle(seatInfos[0], seatInfos[1]);
    } finally {
      this.starting = false;
    }
  }

  private async startBattle(p0: ConnInfo, p1: ConnInfo) {
    if (!p0.authId || !p1.authId || !p0.deckId || !p1.deckId) return;

    const [p0Decks, p1Decks] = await Promise.all([
      fetchTcgDecks(this.room, p0.authId, "lol"),
      fetchTcgDecks(this.room, p1.authId, "lol"),
    ]);
    const p0Deck = p0Decks.find((d) => d.id === p0.deckId);
    const p1Deck = p1Decks.find((d) => d.id === p1.deckId);
    if (!p0Deck || !p1Deck) {
      this.broadcastError(
        `Deck introuvable côté ${!p0Deck ? p0.username : p1.username}.`,
      );
      return;
    }

    this.state = createInitialState(
      this.room.id,
      {
        authId: p0.authId,
        username: p0.username,
        deck: (p0Deck.cards ?? []).map((c) => ({
          cardId: c.card_id,
          count: c.count,
        })),
      },
      {
        authId: p1.authId,
        username: p1.username,
        deck: (p1Deck.cards ?? []).map((c) => ({
          cardId: c.card_id,
          count: c.count,
        })),
      },
    );
    this.broadcastState();
  }

  onMessage(raw: string, sender: Party.Connection) {
    const info = this.connInfo.get(sender.id);
    if (!info || info.seatIdx === null) return;
    if (this.state === null) {
      this.send(sender, {
        type: "lor-battle-error",
        message: "La partie n'a pas encore démarré (en attente de l'adversaire).",
      });
      return;
    }
    const seat = info.seatIdx;
    let data: RuneterraBattleClientMessage;
    try {
      data = JSON.parse(raw) as RuneterraBattleClientMessage;
    } catch {
      return;
    }

    let result: EngineResult | { ok: true; state: InternalState };
    switch (data.type) {
      case "lor-mulligan": {
        // Mulligan n'est pas un EngineResult — on accepte directement.
        const newState = applyMulligan(this.state, seat, data.replaceIndices);
        this.state = newState;
        this.broadcastState();
        return;
      }
      case "lor-play-unit":
        result = playUnit(this.state, seat, data.handIndex);
        break;
      case "lor-play-spell":
        result = playSpell(this.state, seat, data.handIndex, data.targetUid);
        break;
      case "lor-declare-attack":
        result = declareAttack(this.state, seat, data.attackerUids);
        break;
      case "lor-assign-blockers":
        result = assignBlockers(this.state, seat, data.blockerUids);
        break;
      case "lor-pass":
        result = passPriority(this.state, seat);
        break;
      case "lor-concede": {
        // Forfait : adversaire gagne immédiatement.
        const opponent = (1 - seat) as 0 | 1;
        this.state = {
          ...this.state,
          phase: "ended",
          winnerSeatIdx: opponent,
          log: [
            ...this.state.log,
            `${info.username} concède la partie.`,
          ],
        };
        this.broadcastState();
        return;
      }
      default:
        return;
    }

    if (!result.ok) {
      this.send(sender, {
        type: "lor-battle-error",
        message: result.error,
      });
      return;
    }
    this.state = result.state;
    this.broadcastState();
  }

  onClose(conn: Party.Connection) {
    // On garde connInfo pour gérer la reconnexion. PartyKit hibernera la
    // room quand toutes les connexions ferment ; au réveil, le state en
    // mémoire sera perdu (c'est OK pour Phase 3.6a — on persistera plus
    // tard si nécessaire). Cleanup soft :
    this.connInfo.delete(conn.id);
  }

  private broadcastState() {
    if (this.state === null) return;
    for (const [connId, info] of this.connInfo) {
      if (info.seatIdx === null) continue;
      const conn = this.findConn(connId);
      if (!conn) continue;
      this.sendState(conn, info.seatIdx);
    }
  }

  private sendState(conn: Party.Connection, seatIdx: 0 | 1) {
    if (this.state === null) return;
    const projected = projectStateForSeat(this.state, seatIdx);
    this.send(conn, { type: "lor-battle-state", state: projected });
  }

  private broadcastError(message: string) {
    for (const conn of this.room.getConnections()) {
      this.send(conn, { type: "lor-battle-error", message });
    }
  }

  private findConn(connId: string): Party.Connection | undefined {
    for (const conn of this.room.getConnections()) {
      if (conn.id === connId) return conn;
    }
    return undefined;
  }

  private send(conn: Party.Connection, msg: RuneterraBattleServerMessage) {
    conn.send(JSON.stringify(msg));
  }
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length >= 2 ? trimmed : null;
}
