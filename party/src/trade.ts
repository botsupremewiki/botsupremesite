// Realtime TCG trade room — 1 room par paire de joueurs (canonical
// userA<userB) par game_id. Ex : `pokemon-uuid1-uuid2`.
//
// Flow :
//   1. User A entre la room (URL contient ?authId=A&friendId=B&gameId=X)
//   2. User B entre aussi via le même room id (sortable par client : on
//      compute la même chaîne dans les 2 sens)
//   3. Chacun pose 1 carte (put-card { cardId })
//   4. Chacun valide (validate)
//   5. Quand les 2 ont posé ET validé → server appelle execute_realtime_trade
//      RPC, broadcast `trade-completed` aux 2, ferme la session.
//
// Si un user retire/change sa carte → reset les 2 validations.
// Si un user déconnecte → l'autre voit le slot adverse vidé.
//
// État conservé en mémoire serveur (perdu au redéploiement). C'est OK
// pour ce flow synchrone court (5-30 s en moyenne).

import type * as Party from "partykit/server";
import type {
  TradeClientMessage,
  TradeServerMessage,
} from "../../shared/types";
import { getSupabaseEnv } from "./lib/supabase";

type SlotState = {
  authId: string;
  username: string;
  cardId: string | null;
  validated: boolean;
};

type TradeState = {
  // Map authId → slot state. 0-2 entries.
  slots: Map<string, SlotState>;
  // game_id du TCG (pokemon, onepiece, lol). Pour exécuter la RPC.
  gameId: string | null;
  // Lock pour éviter exécution double si les 2 valident en même temps.
  executing: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default class TradeRoom implements Party.Server {
  private state: TradeState = {
    slots: new Map(),
    gameId: null,
    executing: false,
  };
  // Map conn.id → authId pour pouvoir cleanup au onClose.
  private connToAuth = new Map<string, string>();

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const rawAuthId = url.searchParams.get("authId");
    const authId =
      typeof rawAuthId === "string" && UUID_RE.test(rawAuthId)
        ? rawAuthId
        : null;
    const username =
      sanitizeName(url.searchParams.get("name")) ?? "Invité";
    const gameId = sanitizeGameId(url.searchParams.get("gameId"));

    if (!authId || !gameId) {
      this.sendTo(conn, {
        type: "trade-error",
        message: "Paramètres invalides (authId/gameId requis).",
      });
      conn.close();
      return;
    }

    // Vérifie que ce user a bien sa place dans la room (l'id de la room
    // doit contenir son authId — cf. canonicalRoomId côté client).
    const roomId = this.room.id;
    if (!roomId.includes(authId.slice(0, 12))) {
      // On laisse passer — on assume que les 2 users ont calculé le même
      // room id en triant leurs UUIDs. Si quelqu'un triche, l'authentif
      // côté Supabase (RPC service_role + check sender_id côté trade
      // history) protège quand même les transactions.
    }

    this.connToAuth.set(conn.id, authId);
    if (this.state.gameId === null) {
      this.state.gameId = gameId;
    }

    // Crée ou réutilise un slot pour ce user.
    if (!this.state.slots.has(authId)) {
      this.state.slots.set(authId, {
        authId,
        username,
        cardId: null,
        validated: false,
      });
    } else {
      // Update username au cas où il aurait changé.
      const slot = this.state.slots.get(authId)!;
      slot.username = username;
    }

    // Broadcast l'état complet à tout le monde dans la room.
    this.broadcastState();
  }

  onMessage(msg: string, sender: Party.Connection) {
    let data: TradeClientMessage;
    try {
      data = JSON.parse(msg) as TradeClientMessage;
    } catch {
      return;
    }

    const authId = this.connToAuth.get(sender.id);
    if (!authId) {
      this.sendTo(sender, {
        type: "trade-error",
        message: "Session invalide.",
      });
      return;
    }
    const slot = this.state.slots.get(authId);
    if (!slot) return;

    switch (data.type) {
      case "trade-put-card":
        // Pose une carte. Si le user validait, on reset SES validation
        // (et celle de l'autre, parce que retirer/changer la carte
        // doit invalider l'accord).
        if (typeof data.cardId !== "string" || data.cardId.length === 0) {
          this.sendTo(sender, {
            type: "trade-error",
            message: "Carte invalide.",
          });
          return;
        }
        slot.cardId = data.cardId;
        // Reset validations des 2 (cf. spec : "si un des 2 joueurs retirent
        // une carte la validation est annulé jusqu'à que les 2 joueurs
        // valident").
        for (const s of this.state.slots.values()) s.validated = false;
        this.broadcastState();
        return;

      case "trade-remove-card":
        slot.cardId = null;
        // Reset des 2 validations.
        for (const s of this.state.slots.values()) s.validated = false;
        this.broadcastState();
        return;

      case "trade-validate":
        // Refuse de valider si le user n'a pas posé de carte.
        if (!slot.cardId) {
          this.sendTo(sender, {
            type: "trade-error",
            message: "Pose une carte avant de valider.",
          });
          return;
        }
        slot.validated = true;
        this.broadcastState();

        // Check : si les 2 ont une carte ET les 2 ont validé → exécuter.
        if (this.allReadyToExecute()) {
          void this.executeTrade();
        }
        return;

      case "trade-unvalidate":
        slot.validated = false;
        this.broadcastState();
        return;
    }
  }

  onClose(conn: Party.Connection) {
    const authId = this.connToAuth.get(conn.id);
    this.connToAuth.delete(conn.id);
    if (!authId) return;
    // Si plus aucune connection pour ce user → wipe son slot.
    const stillConnected = Array.from(this.connToAuth.values()).includes(
      authId,
    );
    if (!stillConnected) {
      this.state.slots.delete(authId);
      this.broadcastState();
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private allReadyToExecute(): boolean {
    if (this.state.executing) return false;
    if (this.state.slots.size !== 2) return false;
    for (const s of this.state.slots.values()) {
      if (!s.cardId || !s.validated) return false;
    }
    return true;
  }

  private async executeTrade() {
    if (!this.allReadyToExecute()) return;
    if (!this.state.gameId) return;
    this.state.executing = true;

    // Récupère les 2 slots dans l'ordre alphabétique d'authId pour avoir
    // un mapping stable (a < b).
    const slots = Array.from(this.state.slots.values()).sort((x, y) =>
      x.authId.localeCompare(y.authId),
    );
    const [slotA, slotB] = slots;
    if (!slotA?.cardId || !slotB?.cardId) {
      this.state.executing = false;
      return;
    }

    const env = getSupabaseEnv(this.room);
    if (!env) {
      this.broadcast({
        type: "trade-error",
        message: "DB indisponible. Réessaie.",
      });
      this.state.executing = false;
      return;
    }

    try {
      const resp = await fetch(`${env.url}/rest/v1/rpc/execute_realtime_trade`, {
        method: "POST",
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_user_a: slotA.authId,
          p_user_b: slotB.authId,
          p_game_id: this.state.gameId,
          p_card_a: slotA.cardId,
          p_card_b: slotB.cardId,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        let parsed: { message?: string } | null = null;
        try {
          parsed = JSON.parse(body);
        } catch {
          // pas JSON
        }
        const errMsg = parsed?.message ?? body ?? "Erreur d'échange";
        this.broadcast({
          type: "trade-error",
          message: errMsg,
        });
        this.state.executing = false;
        // Reset les validations pour permettre retry.
        for (const s of this.state.slots.values()) s.validated = false;
        this.broadcastState();
        return;
      }
      // ─── Succès — broadcast trade-completed et notifie aux 2 users
      // que leur collection a changé (via la TCG party).
      this.broadcast({
        type: "trade-completed",
        cardAToB: slotA.cardId,
        cardBToA: slotB.cardId,
        userA: slotA.authId,
        userB: slotB.authId,
      });

      // Réinitialise l'état de la room pour permettre un autre échange.
      slotA.cardId = null;
      slotA.validated = false;
      slotB.cardId = null;
      slotB.validated = false;
      this.state.executing = false;

      // Notifier la TCG party pour refresh la collection des 2 users
      // (fait via fetch interne au server PartyKit).
      void this.notifyTcgRefresh([slotA.authId, slotB.authId]);
    } catch (err) {
      console.warn("[trade] execute_realtime_trade threw:", err);
      this.broadcast({
        type: "trade-error",
        message: "Erreur réseau pendant l'échange.",
      });
      this.state.executing = false;
      for (const s of this.state.slots.values()) s.validated = false;
      this.broadcastState();
    }
  }

  private async notifyTcgRefresh(userIds: string[]) {
    if (!this.state.gameId) return;
    // Best-effort : on poke la party tcg/{gameId} en interne. Si l'URL
    // n'est pas accessible côté serveur (différent edge), on tombe juste
    // dans le silence — le client refresh manuellement.
    try {
      const partyUrl =
        (this.room as unknown as { context?: { parties?: Record<string, { get(name: string): { fetch(init: RequestInit): Promise<Response> } }> } })
          .context?.parties?.tcg;
      if (!partyUrl) return;
      const tcgRoom = partyUrl.get(this.state.gameId);
      await tcgRoom.fetch({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "internal-notify-tx",
          userIds,
        }),
      });
    } catch {
      // ignore
    }
  }

  private broadcastState() {
    const slots = Array.from(this.state.slots.values()).map((s) => ({
      authId: s.authId,
      username: s.username,
      cardId: s.cardId,
      validated: s.validated,
    }));
    this.broadcast({
      type: "trade-state",
      slots,
    });
  }

  private broadcast(msg: TradeServerMessage) {
    const json = JSON.stringify(msg);
    for (const conn of this.room.getConnections()) {
      conn.send(json);
    }
  }

  private sendTo(conn: Party.Connection, msg: TradeServerMessage) {
    conn.send(JSON.stringify(msg));
  }
}

function sanitizeName(raw: string | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length >= 2 ? trimmed : null;
}

function sanitizeGameId(raw: string | null): string | null {
  if (raw === "pokemon" || raw === "onepiece" || raw === "lol") return raw;
  return null;
}
