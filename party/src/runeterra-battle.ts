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
import { botAct } from "./lib/runeterra-bot";
import {
  fetchTcgDeckById,
  fetchTcgDecks,
  recordBattleResult,
  recordBotWin,
} from "./lib/supabase";

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
  // Phase 3.8a : si défini, ce siège est joué par l'IA bot (pas de WebSocket).
  // Activé via ?bot=1 dans l'URL de connexion humaine.
  private botSeatIdx: 0 | 1 | null = null;
  // Anti-réentrée pour scheduleBotAct (setTimeout récursif).
  private botRunning = false;
  // Phase 3.8f : mode ranked détecté via préfixe room.id "ranked-".
  // Au endgame, l'ELO est mis à jour via recordBattleResult.
  private readonly rankedMode: boolean;
  // Noms de decks par siège (cache pour recordBattleResult).
  private deckNames: [string | null, string | null] = [null, null];
  // Authentique authId par siège (pour recordBattleResult — connInfo
  // peut être nettoyé sur disconnect avant la fin du match).
  private seatAuthIds: [string | null, string | null] = [null, null];
  private seatUsernames: [string, string] = ["?", "?"];
  // Anti-double recordBattleResult.
  private resultRecorded = false;
  // Phase 3.85 : anti-double recordBotWin (mode bot uniquement).
  private questRecorded = false;

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

    // Phase 3.8a : mode bot solo. Le 1er humain à se connecter avec ?bot=1
    // déclenche un combat contre l'IA (le bot mirror son deck).
    const botParam = url.searchParams.get("bot");
    const requestBot = botParam === "1";
    if (requestBot && this.botSeatIdx === null && this.state === null) {
      this.botSeatIdx = 1;
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

    // Mode bot : seul le siège 0 est nécessaire ; on synthétise le siège 1.
    if (this.botSeatIdx === 1 && seatInfos[0] && !seatInfos[1]) {
      const botInfo: ConnInfo = {
        authId: seatInfos[0].authId,
        deckId: seatInfos[0].deckId, // mirror : bot utilise le même deck
        username: "Bot Suprême",
        seatIdx: 1,
      };
      this.starting = true;
      try {
        await this.startBattle(seatInfos[0], botInfo);
        this.scheduleBotAct();
      } finally {
        this.starting = false;
      }
      return;
    }

    if (!seatInfos[0] || !seatInfos[1]) return;
    this.starting = true;
    try {
      await this.startBattle(seatInfos[0], seatInfos[1]);
    } finally {
      this.starting = false;
    }
  }

  /** Phase 3.8a : si le bot est en mode et qu'il a une action à faire,
   *  la planifie via setTimeout pour donner un peu de temps de
   *  visualisation côté client. Récursif (le bot peut enchaîner plusieurs
   *  actions consécutives — par exemple jouer une unité, puis attaquer). */
  private scheduleBotAct() {
    if (this.botSeatIdx === null || this.state === null) return;
    if (this.botRunning) return;
    if (this.state.phase === "ended") return;
    this.botRunning = true;
    setTimeout(() => {
      this.botRunning = false;
      if (this.state === null || this.botSeatIdx === null) return;
      const result = botAct(this.state, this.botSeatIdx);
      if (result && result.ok) {
        this.state = result.state;
        this.broadcastState();
        // Récursif : le bot peut avoir encore une action à faire.
        this.scheduleBotAct();
      }
    }, 500);
  }

  private async startBattle(p0: ConnInfo, p1: ConnInfo) {
    if (!p0.authId || !p1.authId || !p0.deckId || !p1.deckId) return;

    // Phase 3.8a : si bot, on charge le deck via fetchTcgDeckById (qui ne
    // dépend pas de l'authId — le bot mirror le deck humain).
    const isBot = this.botSeatIdx === 1;
    const [p0Deck, p1Deck] = await Promise.all([
      fetchTcgDecks(this.room, p0.authId, "lol").then((decks) =>
        decks.find((d) => d.id === p0.deckId),
      ),
      isBot
        ? fetchTcgDeckById(this.room, p1.deckId)
        : fetchTcgDecks(this.room, p1.authId, "lol").then((decks) =>
            decks.find((d) => d.id === p1.deckId),
          ),
    ]);
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
    // Phase 3.8f : cache les infos pour recordBattleResult au endGame.
    this.deckNames = [p0Deck.name ?? null, p1Deck.name ?? null];
    this.seatAuthIds = [p0.authId, p1.authId];
    this.seatUsernames = [p0.username, p1.username];
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
        result = playSpell(
          this.state,
          seat,
          data.handIndex,
          data.targetUid,
          data.targetUid2,
          data.targetUid3,
          data.spellChoice,
        );
        break;
      case "lor-declare-attack":
        result = declareAttack(
          this.state,
          seat,
          data.attackerUids,
          data.forcedBlockerUids,
        );
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
    this.scheduleBotAct();
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
    // Phase 3.8f : enregistre le résultat de partie quand state.phase
    // devient "ended". Skip en mode bot (pas de joueur réel à classer).
    this.maybeRecordResult();
  }

  private maybeRecordResult() {
    if (this.state === null) return;
    if (this.state.phase !== "ended") return;
    // Mode bot : on enregistre la victoire pour la quête journalière (3 wins
    // → 1 booster gratuit). Le bot occupe toujours le siège 1, le joueur
    // humain le siège 0 — donc seule une victoire de p1 compte.
    if (this.botSeatIdx !== null) {
      this.maybeRecordBotWin();
      return;
    }
    if (this.resultRecorded) return;
    const winnerIdx = this.state.winnerSeatIdx;
    if (winnerIdx === null) return; // égalité
    const loserIdx = (1 - winnerIdx) as 0 | 1;
    const winnerAuth = this.seatAuthIds[winnerIdx];
    const loserAuth = this.seatAuthIds[loserIdx];
    if (!winnerAuth || !loserAuth) return;
    this.resultRecorded = true;
    void recordBattleResult(this.room, {
      gameId: "lol",
      winnerId: winnerAuth,
      loserId: loserAuth,
      winnerUsername: this.seatUsernames[winnerIdx],
      loserUsername: this.seatUsernames[loserIdx],
      winnerDeckName: this.deckNames[winnerIdx],
      loserDeckName: this.deckNames[loserIdx],
      ranked: this.rankedMode,
      reason:
        this.state.players[loserIdx].nexusHealth <= 0 ? "nexus-dead" : "concede",
    })
      .then((res) => {
        if (!res || !this.rankedMode || !this.state) return;
        this.state = {
          ...this.state,
          log: [
            ...this.state.log,
            `📊 ELO — ${this.seatUsernames[winnerIdx]} ${res.winner_elo_before}→${res.winner_elo_after} · ${this.seatUsernames[loserIdx]} ${res.loser_elo_before}→${res.loser_elo_after}.`,
          ],
        };
        // Re-broadcast pour afficher l'ELO update aux joueurs.
        for (const [connId, info] of this.connInfo) {
          if (info.seatIdx === null) continue;
          const conn = this.findConn(connId);
          if (!conn) continue;
          this.sendState(conn, info.seatIdx);
        }
      })
      .catch(() => {});
  }

  // Phase 3.85 : enregistre une victoire vs bot pour la quête journalière.
  // Crédite 1 booster gratuit dès la 3ème victoire (toutes 24h) et reset le
  // compteur. Le client reçoit `lor-battle-quest-reward` pour afficher le
  // toast et incrémenter son compteur visuel.
  private maybeRecordBotWin() {
    if (this.questRecorded) return;
    if (this.state === null) return;
    if (this.state.winnerSeatIdx !== 0) return; // seul p1 humain compte
    const humanAuth = this.seatAuthIds[0];
    if (!humanAuth) return;
    this.questRecorded = true;
    void recordBotWin(this.room, humanAuth, "lol")
      .then((res) => {
        if (!res) return;
        // Notifier le client humain.
        for (const [connId, info] of this.connInfo) {
          if (info.seatIdx !== 0) continue;
          const conn = this.findConn(connId);
          if (!conn) continue;
          this.send(conn, {
            type: "lor-battle-quest-reward",
            botWins: res.bot_wins,
            granted: res.granted,
            goldReward: res.gold_reward,
          });
        }
        // Log textuel quand la quête est validée.
        if (res.granted && this.state) {
          this.state = {
            ...this.state,
            log: [
              ...this.state.log,
              `🎁 Quête remplie ! ${this.seatUsernames[0]} reçoit 1 booster gratuit + ${res.gold_reward} OS.`,
            ],
          };
          for (const [connId, info] of this.connInfo) {
            if (info.seatIdx === null) continue;
            const conn = this.findConn(connId);
            if (!conn) continue;
            this.sendState(conn, info.seatIdx);
          }
        }
      })
      .catch(() => {});
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
