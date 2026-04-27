import type * as Party from "partykit/server";

// Party très simple pour les raids multi : un boss persiste, les joueurs
// envoient leurs attaques via WebSocket, broadcast à tous. Le boss meurt
// quand HP <= 0 → victoire collective + reward.
//
// Room id = `raid-${raidId}-${rand}` (créée par le client après matchmaking).
// État éphémère (la room hiberne quand vide).

type Player = {
  id: string;
  authId: string;
  username: string;
  conn: Party.Connection;
  totalDamage: number;
};

type RaidState = {
  bossName: string;
  bossHpMax: number;
  bossHp: number;
  log: { from: string; msg: string; ts: number }[];
};

type ClientMsg =
  | { type: "raid-attack"; damage: number }
  | { type: "raid-chat"; text: string };

type ServerMsg =
  | {
      type: "raid-state";
      state: { bossName: string; bossHp: number; bossHpMax: number };
      players: { id: string; username: string; totalDamage: number }[];
    }
  | { type: "raid-log"; log: RaidState["log"] }
  | { type: "raid-victory"; topDamager: string }
  | { type: "raid-error"; message: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default class EternumRaidServer implements Party.Server {
  private players = new Map<string, Player>();
  private state: RaidState = {
    bossName: "Boss du Raid",
    bossHpMax: 100_000,
    bossHp: 100_000,
    log: [],
  };
  private victorious = false;

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const authId = url.searchParams.get("authId");
    const username = url.searchParams.get("name") ?? "Aventurier";
    const bossName = url.searchParams.get("boss") ?? this.state.bossName;
    const bossHp = parseInt(url.searchParams.get("hp") ?? "0", 10);
    if (!authId || !UUID_RE.test(authId)) {
      conn.close();
      return;
    }
    // Initialise le boss si premier joueur (et stats fournies).
    if (this.players.size === 0 && bossHp > 0) {
      this.state.bossName = bossName;
      this.state.bossHp = bossHp;
      this.state.bossHpMax = bossHp;
      this.state.log = [];
    }
    this.players.set(conn.id, {
      id: conn.id,
      authId,
      username,
      conn,
      totalDamage: 0,
    });
    this.broadcastState();
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const player = this.players.get(sender.id);
    if (!player) return;
    let data: ClientMsg;
    try {
      data = JSON.parse(raw) as ClientMsg;
    } catch {
      return;
    }
    if (data.type === "raid-attack") {
      if (this.state.bossHp <= 0) return;
      const dmg = Math.max(0, Math.min(50_000, Math.floor(data.damage)));
      this.state.bossHp = Math.max(0, this.state.bossHp - dmg);
      player.totalDamage += dmg;
      this.state.log.push({
        from: player.username,
        msg: `${player.username} inflige ${dmg.toLocaleString("fr-FR")} dmg`,
        ts: Date.now(),
      });
      if (this.state.log.length > 40) this.state.log.shift();
      this.broadcastState();
      this.broadcastLog();
      if (this.state.bossHp === 0 && !this.victorious) {
        this.victorious = true;
        const top = [...this.players.values()].sort(
          (a, b) => b.totalDamage - a.totalDamage,
        )[0];
        this.broadcast({
          type: "raid-victory",
          topDamager: top?.username ?? "?",
        });
      }
    } else if (data.type === "raid-chat") {
      const text = (data.text ?? "").slice(0, 200).trim();
      if (!text) return;
      this.state.log.push({
        from: player.username,
        msg: `💬 ${text}`,
        ts: Date.now(),
      });
      if (this.state.log.length > 40) this.state.log.shift();
      this.broadcastLog();
    }
  }

  onClose(conn: Party.Connection) {
    this.players.delete(conn.id);
    this.broadcastState();
  }

  private broadcastState() {
    this.broadcast({
      type: "raid-state",
      state: {
        bossName: this.state.bossName,
        bossHp: this.state.bossHp,
        bossHpMax: this.state.bossHpMax,
      },
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        username: p.username,
        totalDamage: p.totalDamage,
      })),
    });
  }
  private broadcastLog() {
    this.broadcast({ type: "raid-log", log: [...this.state.log] });
  }
  private broadcast(msg: ServerMsg) {
    const json = JSON.stringify(msg);
    for (const p of this.players.values()) {
      try {
        p.conn.send(json);
      } catch {
        // ignore
      }
    }
  }
}
