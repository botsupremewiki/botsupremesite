import type * as Party from "partykit/server";
import type {
  BattleCard,
  BattleClientMessage,
  BattlePhase,
  BattlePlayerPublicState,
  BattleSeatId,
  BattleServerMessage,
  BattleSelfState,
  BattleState,
  ChatMessage,
  PokemonEnergyType,
} from "../../shared/types";
import { BATTLE_CONFIG } from "../../shared/types";
import {
  fetchProfile,
  fetchTcgDeckById,
  recordBattleResult,
  recordBotWin,
} from "./lib/supabase";
import {
  type DeckCard,
  dealOpeningHand,
  deriveEnergyTypes,
  expandDeck,
  getCard,
  isBasicPokemon,
  pickRandomEnergy,
  shuffle,
} from "./lib/battle-engine";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KO_WIN_TARGET = BATTLE_CONFIG.koWinTarget;
const MAX_BENCH = BATTLE_CONFIG.maxBench;
const OPENING_HAND_SIZE = BATTLE_CONFIG.openingHandSize;
const LOG_KEEP = 30;

const BOT_AUTH_ID = "bot-supreme";
const BOT_USERNAME = "Bot Suprême";
const BOT_ACTION_DELAY_MS = 900;

type SeatState = {
  authId: string;
  username: string;
  deckName: string | null;
  conn: Party.Connection | null;
  deck: DeckCard[];
  hand: DeckCard[];
  discard: DeckCard[];
  active: BattleCard | null;
  bench: BattleCard[];
  hasSetup: boolean;
  // Pocket : compteur de KO infligés à l'adversaire. Premier à atteindre
  // KO_WIN_TARGET (= 3) gagne la partie. Remplace l'ancien système de prizes.
  koCount: number;
  // Pocket : énergie générée automatiquement au début du tour, prête à être
  // attachée à un Pokémon. Consommée par battle-attach-energy. Reset à null
  // quand le tour se termine sans avoir été attachée (énergie perdue).
  pendingEnergy: PokemonEnergyType | null;
  // Liste des types d'énergies que ce deck peut générer. Calculée au setup
  // depuis les types des Pokémon du deck (Pocket : random parmi ces types).
  energyTypes: PokemonEnergyType[];
  // Limites par tour de jeu (reset à end-turn).
  energyAttachedThisTurn: boolean;
  hasRetreatedThisTurn: boolean;
  evolvedThisTurn: Set<string>; // uids
  // Pocket : 1 carte Supporter max par tour. Reset à end-turn.
  usedSupporterThisTurn: boolean;
  // Réduction du coût de retraite ce tour (Vitesse +). Reset à end-turn.
  retreatDiscount: number;
  // Bonus de dégâts ajouté à toutes les attaques ce tour (Giovanni = +10,
  // Auguste = +30 conditionnel, etc.). Reset à end-turn.
  attackDamageBonus: number;
  mustPromoteActive: boolean;
};

export default class BattleServer implements Party.Server {
  private seats: { p1: SeatState | null; p2: SeatState | null } = {
    p1: null,
    p2: null,
  };
  private connToSeat = new Map<string, BattleSeatId>();
  private phase: BattlePhase = "waiting";
  private activeSeat: BattleSeatId | null = null;
  private turnNumber = 0;
  private winner: BattleSeatId | null = null;
  private log: string[] = [];
  // Compteur d'instances pour générer des uid de cartes posées sur le board.
  private uidCounter = 0;
  // Bot mode (room id starts with "bot-").
  private readonly botMode: boolean;
  // Ranked PvP mode (room id starts with "ranked-").
  private readonly rankedMode: boolean;
  private gameId: string | null = null;
  private botActScheduled = false;
  private questRecorded = false;
  private resultRecorded = false;

  constructor(readonly room: Party.Room) {
    this.botMode = room.id.startsWith("bot-");
    this.rankedMode = room.id.startsWith("ranked-");
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const rawAuthId = url.searchParams.get("authId");
    const authId =
      typeof rawAuthId === "string" && UUID_RE.test(rawAuthId)
        ? rawAuthId
        : null;
    const username = sanitizeName(url.searchParams.get("name"));
    const deckId = url.searchParams.get("deck");
    if (!authId || !username || !deckId) {
      this.sendError(conn, "Connexion invalide (auth/deck manquant).");
      conn.close();
      return;
    }

    // Identifier le siège : si déjà siégé (reconnexion), reprendre. Sinon
    // attribuer p1 ou p2 selon disponibilité.
    let seatId: BattleSeatId | null = null;
    if (this.seats.p1?.authId === authId) seatId = "p1";
    else if (this.seats.p2?.authId === authId) seatId = "p2";
    else if (!this.seats.p1) seatId = "p1";
    else if (!this.seats.p2) seatId = "p2";

    if (!seatId) {
      // Spectateur — pour MVP on close.
      this.sendError(conn, "Cette partie est complète.");
      conn.close();
      return;
    }

    // En mode bot, p2 est réservé au Bot Suprême — un seul joueur humain.
    if (this.botMode && seatId === "p2") {
      this.sendError(conn, "Cette partie bot est déjà occupée.");
      conn.close();
      return;
    }

    if (!this.seats[seatId]) {
      // Première connexion sur ce siège : load deck depuis la DB.
      const deckRow = await fetchTcgDeckById(this.room, deckId);
      if (!deckRow) {
        this.sendError(conn, "Deck introuvable.");
        conn.close();
        return;
      }
      const total = (deckRow.cards ?? []).reduce((s, c) => s + c.count, 0);
      if (total !== BATTLE_CONFIG.deckSize) {
        this.sendError(
          conn,
          `Deck invalide (${total}/${BATTLE_CONFIG.deckSize} cartes).`,
        );
        conn.close();
        return;
      }
      const deckCards = (deckRow.cards ?? []).map((c) => ({
        cardId: c.card_id,
        count: c.count,
      }));
      const deck = expandDeck(deckCards);
      shuffle(deck);
      const { hand, mulligans } = dealOpeningHand(deck, OPENING_HAND_SIZE);
      // Pocket : les types d'énergies générés en combat sont ceux choisis
      // par le joueur à la création du deck. Si le deck a été créé avant
      // la migration energy_types, fallback sur déduction depuis les types
      // des Pokémon présents.
      const deckEnergyTypes =
        deckRow.energy_types && deckRow.energy_types.length > 0
          ? (deckRow.energy_types as PokemonEnergyType[])
          : deriveEnergyTypes(deckCards);
      this.seats[seatId] = {
        authId,
        username,
        deckName: deckRow.name ?? null,
        conn,
        deck,
        hand,
        discard: [],
        active: null,
        bench: [],
        hasSetup: false,
        koCount: 0,
        pendingEnergy: null,
        energyTypes: deckEnergyTypes,
        energyAttachedThisTurn: false,
        hasRetreatedThisTurn: false,
        evolvedThisTurn: new Set(),
        usedSupporterThisTurn: false,
        retreatDiscount: 0,
        attackDamageBonus: 0,
        mustPromoteActive: false,
      };
      this.connToSeat.set(conn.id, seatId);
      // On retient le gameId de la room (depuis le 1er deck reçu — les deux
      // joueurs forcément même jeu via le matchmaking).
      if (!this.gameId) this.gameId = deckRow.game_id;

      // Mulligans : log volontairement omis (le journal de combat reste
      // minimaliste — uniquement les cartes utilisées).
      void mulligans;

      // En mode bot, dès que p1 est seated on remplit p2 avec le Bot Suprême
      // (mirror du même deck pour un match équilibré).
      if (this.botMode && seatId === "p1" && !this.seats.p2) {
        this.fillBotSeat(deckCards, deckEnergyTypes);
      }
    } else {
      // Reconnexion (même authId).
      const existing = this.seats[seatId];
      if (existing) existing.conn = conn;
      this.connToSeat.set(conn.id, seatId);
    }

    this.sendTo(conn, {
      type: "battle-welcome",
      selfId: conn.id,
      selfSeat: seatId,
    });

    // Si les 2 sièges sont remplis et qu'on attendait, on passe en setup.
    if (this.phase === "waiting" && this.seats.p1 && this.seats.p2) {
      this.phase = "setup";
    }
    this.broadcastState();
  }

  // ─────────────── bot ───────────────

  /** Remplit p2 avec le Bot Suprême en utilisant un mirror du deck p1. */
  private fillBotSeat(
    deckCards: { cardId: string; count: number }[],
    energyTypes: PokemonEnergyType[],
  ) {
    const deck = expandDeck(deckCards);
    shuffle(deck);
    const { hand, mulligans } = dealOpeningHand(deck, OPENING_HAND_SIZE);
    this.seats.p2 = {
      authId: BOT_AUTH_ID,
      username: BOT_USERNAME,
      deckName: "Bot Mirror",
      conn: null,
      deck,
      hand,
      discard: [],
      active: null,
      bench: [],
      hasSetup: false,
      koCount: 0,
      pendingEnergy: null,
      energyTypes,
      energyAttachedThisTurn: false,
      hasRetreatedThisTurn: false,
      evolvedThisTurn: new Set(),
      usedSupporterThisTurn: false,
      retreatDiscount: 0,
      attackDamageBonus: 0,
      mustPromoteActive: false,
    };
    // Logs mulligan + setup volontairement omis.
    void mulligans;
  }

  /** Décide si le bot doit agir maintenant et planifie son action avec
   *  un petit délai pour la lisibilité. */
  private maybeBotAct() {
    if (!this.botMode) return;
    if (this.phase === "ended") return;
    const bot = this.seats.p2;
    if (!bot) return;
    if (this.botActScheduled) return;

    let shouldAct = false;
    if (this.phase === "setup" && !bot.hasSetup) {
      shouldAct = true;
    } else if (this.phase === "playing") {
      if (bot.mustPromoteActive && bot.bench.length > 0) shouldAct = true;
      else if (this.activeSeat === "p2") shouldAct = true;
    }
    if (!shouldAct) return;

    this.botActScheduled = true;
    setTimeout(() => {
      this.botActScheduled = false;
      try {
        if (this.phase === "setup") this.botDoSetup();
        else if (this.phase === "playing") {
          const b = this.seats.p2;
          if (b?.mustPromoteActive) this.botPromote();
          else if (this.activeSeat === "p2") this.botPlayTurn();
        }
      } catch (err) {
        console.warn("[bot] action threw:", err);
      }
    }, BOT_ACTION_DELAY_MS);
  }

  /** Setup phase : pose Actif + jusqu'à 3 Basics au Banc + confirme. */
  private botDoSetup() {
    const seat = this.seats.p2;
    if (!seat || seat.hasSetup || this.phase !== "setup") return;
    // Active : premier Basic en main
    const basicIdx = seat.hand.findIndex((c) => isBasicPokemon(c.cardId));
    if (basicIdx < 0) return;
    this.handleSetActive("p2", basicIdx);
    // Banc : jusqu'à 3 autres Basics
    for (let n = 0; n < 3; n++) {
      const idx = seat.hand.findIndex((c) => isBasicPokemon(c.cardId));
      if (idx < 0) break;
      if (seat.bench.length >= MAX_BENCH) break;
      this.handleAddBench("p2", idx);
    }
    this.handleConfirmSetup("p2");
  }

  /** Promotion forcée après KO : promeut le premier Pokémon de Banc. */
  private botPromote() {
    const seat = this.seats.p2;
    if (!seat?.mustPromoteActive || seat.bench.length === 0) return;
    // Préfère un Pokémon avec le plus de PV restants
    let bestIdx = 0;
    let bestRemaining = -Infinity;
    for (let i = 0; i < seat.bench.length; i++) {
      const c = seat.bench[i];
      const data = getCard(c.cardId);
      if (data?.kind !== "pokemon") continue;
      const remaining = data.hp - c.damage;
      if (remaining > bestRemaining) {
        bestRemaining = remaining;
        bestIdx = i;
      }
    }
    this.handlePromoteActive("p2", bestIdx);
  }

  /** Tour de jeu du bot. Stratégie naïve mais correcte :
   *  évolue → pose Basic → attache Énergie → attaque la plus forte → end.
   *  Chaque action déclenche un re-schedule jusqu'à attaque ou end-turn. */
  private botPlayTurn() {
    const seat = this.seats.p2;
    if (!seat || this.activeSeat !== "p2" || this.phase !== "playing") return;
    if (seat.mustPromoteActive) return; // géré par botPromote

    // 1. Évolution si possible (priorité au Pokémon Actif)
    for (let hi = 0; hi < seat.hand.length; hi++) {
      const handCard = seat.hand[hi];
      const evoData = getCard(handCard.cardId);
      if (
        !evoData ||
        evoData.kind !== "pokemon" ||
        evoData.stage === "basic" ||
        !evoData.evolvesFrom
      )
        continue;
      const targets: BattleCard[] = [];
      if (seat.active) targets.push(seat.active);
      targets.push(...seat.bench);
      for (const target of targets) {
        if (target.playedThisTurn) continue;
        if (seat.evolvedThisTurn.has(target.uid)) continue;
        const tData = getCard(target.cardId);
        if (tData?.kind === "pokemon" && tData.name === evoData.evolvesFrom) {
          this.handleEvolve("p2", hi, target.uid);
          this.scheduleNextBotStep();
          return;
        }
      }
    }

    // 2. Pose un Basic au Banc si banc pas plein
    if (seat.bench.length < MAX_BENCH) {
      const basicIdx = seat.hand.findIndex((c) => isBasicPokemon(c.cardId));
      if (basicIdx >= 0) {
        this.handlePlayBasic("p2", basicIdx);
        this.scheduleNextBotStep();
        return;
      }
    }

    // 3. Attache l'énergie pending sur l'Actif (Pocket : 1 énergie auto/tour).
    if (!seat.energyAttachedThisTurn && seat.pendingEnergy && seat.active) {
      this.handleAttachEnergy("p2", seat.active.uid);
      this.scheduleNextBotStep();
      return;
    }

    // 4. Attaque (la plus forte payée)
    const data = seat.active ? getCard(seat.active.cardId) : null;
    if (
      seat.active &&
      data?.kind === "pokemon" &&
      !seat.active.playedThisTurn &&
      !seat.active.statuses.includes("asleep") &&
      !seat.active.statuses.includes("paralyzed")
    ) {
      const ranked = data.attacks
        .map((a, i) => ({ atk: a, idx: i, dmg: a.damage ?? 0 }))
        .sort((a, b) => b.dmg - a.dmg);
      for (const { idx } of ranked) {
        if (
          this.canPayAttackCost(
            seat.active.attachedEnergies,
            data.attacks[idx].cost,
          )
        ) {
          this.handleAttack("p2", idx);
          // handleAttack fait avancer le tour (ou termine si KO)
          return;
        }
      }
    }

    // 5. Rien à faire → end turn
    this.handleEndTurn("p2");
  }

  /** Re-schedule the next bot step (after an action that didn't end the turn). */
  private scheduleNextBotStep() {
    if (this.botActScheduled) return;
    this.botActScheduled = true;
    setTimeout(() => {
      this.botActScheduled = false;
      try {
        this.botPlayTurn();
      } catch (err) {
        console.warn("[bot] step threw:", err);
      }
    }, BOT_ACTION_DELAY_MS);
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const seatId = this.connToSeat.get(sender.id);
    if (!seatId) return;
    let data: BattleClientMessage;
    try {
      data = JSON.parse(raw) as BattleClientMessage;
    } catch {
      return;
    }
    switch (data.type) {
      case "chat": {
        const text = sanitizeChat(data.text);
        if (!text) return;
        const seat = this.seats[seatId];
        if (!seat) return;
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          playerId: sender.id,
          playerName: seat.username,
          text,
          timestamp: Date.now(),
        };
        this.broadcast({ type: "chat", message });
        break;
      }
      case "battle-set-active":
        this.handleSetActive(seatId, data.handIndex);
        break;
      case "battle-add-bench":
        this.handleAddBench(seatId, data.handIndex);
        break;
      case "battle-remove-bench":
        this.handleRemoveBench(seatId, data.benchIndex);
        break;
      case "battle-confirm-setup":
        this.handleConfirmSetup(seatId);
        break;
      case "battle-play-basic":
        this.handlePlayBasic(seatId, data.handIndex);
        break;
      case "battle-attach-energy":
        this.handleAttachEnergy(seatId, data.targetUid);
        break;
      case "battle-evolve":
        this.handleEvolve(seatId, data.handIndex, data.targetUid);
        break;
      case "battle-retreat":
        this.handleRetreat(seatId, data.benchIndex);
        break;
      case "battle-attack":
        this.handleAttack(seatId, data.attackIndex);
        break;
      case "battle-promote-active":
        this.handlePromoteActive(seatId, data.benchIndex);
        break;
      case "battle-play-trainer":
        this.handlePlayTrainer(seatId, data.handIndex, data.targetUid ?? null);
        break;
      case "battle-end-turn":
        this.handleEndTurn(seatId);
        break;
      case "battle-concede":
        this.handleConcede(seatId);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    const seatId = this.connToSeat.get(conn.id);
    this.connToSeat.delete(conn.id);
    if (!seatId) return;
    const seat = this.seats[seatId];
    if (seat) seat.conn = null;
    // Si la partie a démarré, on garde le siège pour permettre la reconnexion.
    // Si on attendait encore (setup pas terminé) et que les 2 sont déco, on reset.
  }

  // ─────────────── handlers ───────────────

  private handleSetActive(seatId: BattleSeatId, handIndex: number) {
    if (this.phase !== "setup") return;
    const seat = this.seats[seatId];
    if (!seat || seat.hasSetup) return;
    if (seat.active) return; // déjà placé
    const card = seat.hand[handIndex];
    if (!card || !isBasicPokemon(card.cardId)) {
      this.sendErrorToSeat(seatId, "Choisis un Pokémon de Base de ta main.");
      return;
    }
    seat.hand.splice(handIndex, 1);
    seat.active = this.makeBattleCard(card.cardId);
    this.broadcastState();
  }

  private handleAddBench(seatId: BattleSeatId, handIndex: number) {
    if (this.phase !== "setup") return;
    const seat = this.seats[seatId];
    if (!seat || seat.hasSetup) return;
    if (seat.bench.length >= MAX_BENCH) {
      this.sendErrorToSeat(seatId, `Banc complet (${MAX_BENCH} max).`);
      return;
    }
    const card = seat.hand[handIndex];
    if (!card || !isBasicPokemon(card.cardId)) {
      this.sendErrorToSeat(seatId, "Seuls des Pokémon de Base au banc.");
      return;
    }
    seat.hand.splice(handIndex, 1);
    seat.bench.push(this.makeBattleCard(card.cardId));
    this.broadcastState();
  }

  private handleRemoveBench(seatId: BattleSeatId, benchIndex: number) {
    if (this.phase !== "setup") return;
    const seat = this.seats[seatId];
    if (!seat || seat.hasSetup) return;
    const card = seat.bench[benchIndex];
    if (!card) return;
    seat.bench.splice(benchIndex, 1);
    seat.hand.push({ uid: card.uid, cardId: card.cardId });
    this.broadcastState();
  }

  private handleConfirmSetup(seatId: BattleSeatId) {
    if (this.phase !== "setup") return;
    const seat = this.seats[seatId];
    if (!seat) return;
    if (!seat.active) {
      this.sendErrorToSeat(
        seatId,
        "Tu dois choisir un Pokémon Actif avant de confirmer.",
      );
      return;
    }
    seat.hasSetup = true;
    this.broadcastState();

    // Si les deux ont confirmé → coin flip et début de la partie.
    if (this.seats.p1?.hasSetup && this.seats.p2?.hasSetup) {
      const heads = Math.random() < 0.5;
      const first: BattleSeatId = heads ? "p1" : "p2";
      this.activeSeat = first;
      this.phase = "playing";
      this.turnNumber = 1;
      const name = this.seats[first]!.username;
      // Animation pile/face → puis "X commence !" affiché en gros sur le client.
      this.emitCoinFlip("Qui commence ?", heads, `${name} commence !`);
      this.broadcastState();
    }
  }

  /** Diffuse un évènement coin-flip (Pile/Face) à tous les joueurs : le
   *  client affiche une animation de pièce qui retombe sur PILE ou FACE,
   *  puis le `followUp` (ex « rimkidinki commence ! »). */
  private emitCoinFlip(
    label: string,
    heads: boolean,
    followUp?: string,
    index?: number,
    total?: number,
  ) {
    this.broadcast({
      type: "battle-coin-flip",
      id: crypto.randomUUID(),
      label,
      result: heads ? "heads" : "tails",
      index,
      total,
      followUp,
    });
  }

  // ─────────────── playing-phase actions ───────────────

  /** Pose un Pokémon de Base de la main au Banc en main phase. */
  private handlePlayBasic(seatId: BattleSeatId, handIndex: number) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    const seat = this.seats[seatId];
    if (!seat || seat.mustPromoteActive) return;
    if (seat.bench.length >= MAX_BENCH) {
      this.sendErrorToSeat(seatId, `Banc complet (${MAX_BENCH} max).`);
      return;
    }
    const card = seat.hand[handIndex];
    if (!card || !isBasicPokemon(card.cardId)) {
      this.sendErrorToSeat(seatId, "Seuls les Pokémon de Base se posent au Banc.");
      return;
    }
    seat.hand.splice(handIndex, 1);
    seat.bench.push(this.makeBattleCard(card.cardId));
    this.broadcastState();
  }

  /** Attache l'énergie pending (générée auto au début du tour) sur un Pokémon
   *  en jeu (Actif ou Banc). Pocket : 1 énergie attachable par tour, max. */
  private handleAttachEnergy(seatId: BattleSeatId, targetUid: string) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    const seat = this.seats[seatId];
    if (!seat || seat.mustPromoteActive) return;
    if (!seat.pendingEnergy) {
      this.sendErrorToSeat(seatId, "Aucune énergie disponible ce tour.");
      return;
    }
    if (seat.energyAttachedThisTurn) {
      this.sendErrorToSeat(seatId, "Une seule Énergie peut être attachée par tour.");
      return;
    }
    const target = this.findOwnPokemon(seat, targetUid);
    if (!target) {
      this.sendErrorToSeat(seatId, "Cible invalide.");
      return;
    }
    const energyType = seat.pendingEnergy;
    target.attachedEnergies.push(energyType);
    seat.pendingEnergy = null;
    seat.energyAttachedThisTurn = true;
    // Pas de log : l'attache est purement visuelle (énergie posée sous le
    // Pokémon).
    this.broadcastState();
  }

  /** Évolue un Pokémon en jeu en posant une carte Stage 1 / Stage 2 sur lui. */
  private handleEvolve(
    seatId: BattleSeatId,
    handIndex: number,
    targetUid: string,
  ) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    const seat = this.seats[seatId];
    if (!seat || seat.mustPromoteActive) return;
    const handCard = seat.hand[handIndex];
    if (!handCard) return;
    const evoData = getCard(handCard.cardId);
    if (!evoData || evoData.kind !== "pokemon") {
      this.sendErrorToSeat(seatId, "Cette carte n'évolue pas.");
      return;
    }
    if (evoData.stage === "basic" || !evoData.evolvesFrom) {
      this.sendErrorToSeat(seatId, "Cette carte n'est pas une évolution.");
      return;
    }
    const target = this.findOwnPokemon(seat, targetUid);
    if (!target) {
      this.sendErrorToSeat(seatId, "Cible invalide.");
      return;
    }
    if (target.playedThisTurn) {
      this.sendErrorToSeat(
        seatId,
        "Un Pokémon posé ce tour ne peut pas évoluer.",
      );
      return;
    }
    if (seat.evolvedThisTurn.has(target.uid)) {
      this.sendErrorToSeat(
        seatId,
        "Ce Pokémon a déjà évolué ce tour.",
      );
      return;
    }
    const targetData = getCard(target.cardId);
    if (
      !targetData ||
      targetData.kind !== "pokemon" ||
      targetData.name !== evoData.evolvesFrom
    ) {
      this.sendErrorToSeat(
        seatId,
        `${evoData.name} n'évolue pas depuis ce Pokémon.`,
      );
      return;
    }
    // Évolution : on remplace le cardId, on conserve dégâts + énergies,
    // on retire les conditions de statut (règle officielle). Pas de log :
    // l'évolution est visible directement sur le terrain (la carte change
    // d'image).
    seat.hand.splice(handIndex, 1);
    target.cardId = handCard.cardId;
    target.statuses = [];
    seat.evolvedThisTurn.add(target.uid);
    void targetData;
    this.broadcastState();
  }

  /** Retraite : discard N énergies (= retreatCost) puis swap Actif/Banc. */
  private handleRetreat(seatId: BattleSeatId, benchIndex: number) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    const seat = this.seats[seatId];
    if (!seat || seat.mustPromoteActive) return;
    if (seat.hasRetreatedThisTurn) {
      this.sendErrorToSeat(seatId, "Tu as déjà battu en retraite ce tour.");
      return;
    }
    if (!seat.active) return;
    if (
      seat.active.statuses.includes("asleep") ||
      seat.active.statuses.includes("paralyzed")
    ) {
      this.sendErrorToSeat(
        seatId,
        "Pokémon Endormi ou Paralysé ne peut pas battre en retraite.",
      );
      return;
    }
    const newActive = seat.bench[benchIndex];
    if (!newActive) {
      this.sendErrorToSeat(seatId, "Pas de Pokémon de Banc à promouvoir.");
      return;
    }
    const data = getCard(seat.active.cardId);
    if (!data || data.kind !== "pokemon") return;
    const cost = Math.max(0, data.retreatCost - seat.retreatDiscount);
    if (seat.active.attachedEnergies.length < cost) {
      this.sendErrorToSeat(
        seatId,
        `Pas assez d'Énergies pour battre en retraite (${cost} requises).`,
      );
      return;
    }
    // Pocket : retire `cost` énergies (les plus anciennes en tête). Pas de
    // discard à matérialiser — les énergies ne sont pas des cartes.
    seat.active.attachedEnergies.splice(0, cost);
    // Swap.
    const old = seat.active;
    seat.active = newActive;
    seat.bench.splice(benchIndex, 1);
    seat.bench.push(old);
    seat.hasRetreatedThisTurn = true;
    // Retraite : visuellement le swap Actif↔Banc est explicite, pas besoin
    // d'un log.
    this.broadcastState();
  }

  /** Exécute une attaque de l'Actif. La 1ère ou 2nde selon attackIndex. */
  private handleAttack(seatId: BattleSeatId, attackIndex: number) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    const seat = this.seats[seatId];
    if (!seat || seat.mustPromoteActive) return;
    if (!seat.active) return;
    if (seat.active.playedThisTurn) {
      this.sendErrorToSeat(
        seatId,
        "Ce Pokémon ne peut pas attaquer le tour où il est posé.",
      );
      return;
    }
    if (seat.active.statuses.includes("asleep")) {
      this.sendErrorToSeat(seatId, "Pokémon Endormi — il ne peut pas attaquer.");
      return;
    }
    if (seat.active.statuses.includes("paralyzed")) {
      this.sendErrorToSeat(
        seatId,
        "Pokémon Paralysé — il ne peut pas attaquer.",
      );
      return;
    }
    const attackerData = getCard(seat.active.cardId);
    if (!attackerData || attackerData.kind !== "pokemon") return;
    const attack = attackerData.attacks[attackIndex];
    if (!attack) return;
    if (!this.canPayAttackCost(seat.active.attachedEnergies, attack.cost)) {
      this.sendErrorToSeat(seatId, "Coût en Énergies non payé.");
      return;
    }

    // Confusion : pile/face avant l'attaque. Face = attaque foire +
    // 30 dégâts à soi (pas de faiblesse/résistance pour ces dégâts).
    if (seat.active.statuses.includes("confused")) {
      const heads = this.coinFlip();
      // Animation pile/face côté client (pas de log texte).
      this.emitCoinFlip(
        `${attackerData.name} est Confus`,
        heads,
        heads ? `${attackerData.name} attaque normalement.` : `${attackerData.name} se rate (30 dégâts) !`,
      );
      if (!heads) {
        seat.active.damage += 30;
        if (seat.active.damage >= attackerData.hp) {
          this.knockOut(seatId === "p1" ? "p2" : "p1", seatId);
        }
        if (this.phase === "playing") this.advanceTurn();
        else this.broadcastState();
        return;
      }
    }

    const oppId: BattleSeatId = seatId === "p1" ? "p2" : "p1";
    const opp = this.seats[oppId];
    if (!opp || !opp.active) {
      this.sendErrorToSeat(seatId, "Pas de cible.");
      return;
    }
    const defenderData = getCard(opp.active.cardId);
    if (!defenderData || defenderData.kind !== "pokemon") return;

    let damage = attack.damage ?? 0;
    // Bonus Giovanni / Auguste / etc. — +N dégâts ce tour si actif.
    if (damage > 0) damage += seat.attackDamageBonus;

    // Pocket : weakness = +20 (pas ×2). Pour MVP on simplifie en +20 fixe
    // si type matche. Pas de système de résistance dans Pocket.
    const isWeakness =
      damage > 0 &&
      !!defenderData.weakness &&
      defenderData.weakness === attackerData.type;
    if (isWeakness) damage += 20;

    opp.active.damage += damage;

    // Format du log style jeu Pokémon : « Pikachu utilise Éclair → 40 dégâts
    // à Electhor (super efficace !) → K.O. ! ». Une seule ligne, sans nom
    // de joueur (le log est commun et le côté est lisible visuellement).
    const willKo = opp.active.damage >= defenderData.hp;
    const parts: string[] = [
      `${attackerData.name} utilise ${attack.name}`,
    ];
    if (damage > 0) parts.push(`→ ${damage} dégâts à ${defenderData.name}`);
    if (isWeakness) parts.push("(super efficace !)");
    if (willKo) parts.push("→ K.O. !");
    this.pushLog(parts.join(" "));

    // Vérif KO sur le défenseur — knockOut ne pousse plus de log à part.
    if (willKo) {
      this.knockOut(seatId, oppId);
    }

    // Une attaque met fin au tour (sauf si KO a déjà déclaré vainqueur).
    if (this.phase === "playing") {
      this.advanceTurn();
    } else {
      this.broadcastState();
    }
  }

  /** Tirage pile/face. true = "Face" (heads en anglais), false = "Pile" (tails). */
  private coinFlip(): boolean {
    return Math.random() < 0.5;
  }

  /** Promotion d'un Pokémon de Banc en Actif après KO. */
  private handlePromoteActive(seatId: BattleSeatId, benchIndex: number) {
    const seat = this.seats[seatId];
    if (!seat || !seat.mustPromoteActive) return;
    const promote = seat.bench[benchIndex];
    if (!promote) {
      this.sendErrorToSeat(seatId, "Pokémon de Banc invalide.");
      return;
    }
    seat.active = promote;
    seat.bench.splice(benchIndex, 1);
    seat.mustPromoteActive = false;
    // Pas de log : la promotion est visible (le banc se vide d'une carte
    // qui apparaît en zone Actif).
    this.broadcastState();
  }

  /** Joue une carte Dresseur. On switch sur le nom français de la carte
   *  plutôt que sur l'id, parce que la même carte apparaît dans plusieurs
   *  sets (P-A vs A1, ou différentes raretés) avec des ids différents.
   *
   *  Cartes Item / Outil :
   *    • Potion          — soigne 20 dmg sur targetUid
   *    • Poké Ball       — pioche un Pokémon de Base au hasard
   *    • Vitesse +       — −1 retreatCost ce tour
   *    • Pokédex         — révèle la 1ère carte du dessus du deck
   *    • Scrute Main     — révèle la main de l'adversaire
   *    • Carton Rouge    — l'adversaire mélange sa main dans son deck et pioche 3
   *
   *  Cartes Supporter (1 par tour) :
   *    • Recherches Professorales — pioche 2 cartes
   *    • Giovanni        — toutes vos attaques font +10 dégâts ce tour
   *    • Erika           — soigne 50 dmg sur un Pokémon Plante (target)
   *    • Pierre          — attache une Énergie Combat à Grolem ou Onix (target)
   *    • Auguste         — vos Feunard / Galopa / Magmar font +30 dégâts ce tour
   *
   *  Cartes non implémentées (mécaniques complexes) : Koga, Major Bob, Morgane,
   *  Ondine, Vieil Ambre / Fossile Dôme / Fossile Nautile. */
  private handlePlayTrainer(
    seatId: BattleSeatId,
    handIndex: number,
    targetUid: string | null,
  ) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    const seat = this.seats[seatId];
    if (!seat || seat.mustPromoteActive) return;
    const handCard = seat.hand[handIndex];
    if (!handCard) return;
    const card = getCard(handCard.cardId);
    if (!card || card.kind !== "trainer") {
      this.sendErrorToSeat(seatId, "Cette carte n'est pas un Dresseur.");
      return;
    }
    // Pocket : 1 Supporter max par tour.
    if (card.trainerType === "supporter" && seat.usedSupporterThisTurn) {
      this.sendErrorToSeat(
        seatId,
        "Tu as déjà joué une carte Supporter ce tour.",
      );
      return;
    }

    const playedName = card.name;
    const oppId: BattleSeatId = seatId === "p1" ? "p2" : "p1";
    let consumed = false;

    switch (playedName) {
      case "Potion": {
        if (!targetUid) {
          this.sendErrorToSeat(seatId, "Choisis un Pokémon à soigner.");
          return;
        }
        const target = this.findOwnPokemon(seat, targetUid);
        if (!target) {
          this.sendErrorToSeat(seatId, "Cible invalide.");
          return;
        }
        if (target.damage === 0) {
          this.sendErrorToSeat(seatId, "Ce Pokémon n'est pas blessé.");
          return;
        }
        target.damage -= Math.min(20, target.damage);
        consumed = true;
        break;
      }
      case "Poké Ball": {
        const basics: number[] = [];
        for (let i = 0; i < seat.deck.length; i++) {
          if (isBasicPokemon(seat.deck[i].cardId)) basics.push(i);
        }
        if (basics.length === 0) {
          this.sendErrorToSeat(
            seatId,
            "Aucun Pokémon de Base restant dans ton deck.",
          );
          return;
        }
        const pickIdx = basics[Math.floor(Math.random() * basics.length)];
        const picked = seat.deck.splice(pickIdx, 1)[0];
        seat.hand.push(picked);
        consumed = true;
        break;
      }
      case "Recherches Professorales": {
        let drew = 0;
        for (let n = 0; n < 2; n++) {
          const top = seat.deck.pop();
          if (!top) break;
          seat.hand.push(top);
          drew++;
        }
        if (drew === 0) {
          this.sendErrorToSeat(seatId, "Plus de cartes à piocher.");
          return;
        }
        consumed = true;
        break;
      }
      case "Vitesse +": {
        seat.retreatDiscount += 1;
        consumed = true;
        break;
      }
      case "Pokédex": {
        // Révèle la 1ère carte du dessus du deck (le joueur peut décider
        // d'enchaîner — Pocket : pas de réordonnancement).
        const top = seat.deck[seat.deck.length - 1];
        if (!top) {
          this.sendErrorToSeat(seatId, "Plus de cartes à regarder.");
          return;
        }
        if (seat.conn) {
          this.sendTo(seat.conn, {
            type: "battle-trainer-reveal",
            trainerName: "Pokédex",
            cardIds: [top.cardId],
          });
        }
        consumed = true;
        break;
      }
      case "Scrute Main": {
        // Révèle la main complète de l'adversaire (privé au joueur qui
        // utilise la carte).
        const opp = this.seats[oppId];
        if (!opp) {
          this.sendErrorToSeat(seatId, "Adversaire absent.");
          return;
        }
        if (seat.conn) {
          this.sendTo(seat.conn, {
            type: "battle-trainer-reveal",
            trainerName: "Scrute Main",
            cardIds: opp.hand.map((c) => c.cardId),
          });
        }
        consumed = true;
        break;
      }
      case "Carton Rouge": {
        // L'adversaire mélange sa main dans son deck et pioche 3.
        const opp = this.seats[oppId];
        if (!opp) {
          this.sendErrorToSeat(seatId, "Adversaire absent.");
          return;
        }
        if (opp.hand.length === 0 && opp.deck.length === 0) {
          this.sendErrorToSeat(seatId, "L'adversaire n'a plus de cartes.");
          return;
        }
        opp.deck.push(...opp.hand);
        opp.hand = [];
        shuffle(opp.deck);
        for (let n = 0; n < 3; n++) {
          const top = opp.deck.pop();
          if (!top) break;
          opp.hand.push(top);
        }
        consumed = true;
        break;
      }
      case "Giovanni": {
        seat.attackDamageBonus += 10;
        consumed = true;
        break;
      }
      case "Erika": {
        // Soigne 50 dmg d'un Pokémon Plante. Target requis.
        if (!targetUid) {
          this.sendErrorToSeat(seatId, "Choisis un Pokémon Plante à soigner.");
          return;
        }
        const target = this.findOwnPokemon(seat, targetUid);
        if (!target) {
          this.sendErrorToSeat(seatId, "Cible invalide.");
          return;
        }
        const tData = getCard(target.cardId);
        if (tData?.kind !== "pokemon" || tData.type !== "grass") {
          this.sendErrorToSeat(seatId, "Erika ne soigne que les Pokémon Plante.");
          return;
        }
        if (target.damage === 0) {
          this.sendErrorToSeat(seatId, "Ce Pokémon n'est pas blessé.");
          return;
        }
        target.damage -= Math.min(50, target.damage);
        consumed = true;
        break;
      }
      case "Pierre": {
        // Attache une Énergie Combat à Grolem (forme d'Alola) ou Onix.
        if (!targetUid) {
          this.sendErrorToSeat(seatId, "Choisis Grolem ou Onix.");
          return;
        }
        const target = this.findOwnPokemon(seat, targetUid);
        if (!target) {
          this.sendErrorToSeat(seatId, "Cible invalide.");
          return;
        }
        const tData = getCard(target.cardId);
        const validNames = new Set(["Grolem", "Onix"]);
        if (tData?.kind !== "pokemon" || !validNames.has(tData.name)) {
          this.sendErrorToSeat(
            seatId,
            "Pierre ne s'utilise que sur Grolem ou Onix.",
          );
          return;
        }
        target.attachedEnergies.push("fighting");
        consumed = true;
        break;
      }
      case "Auguste": {
        // Vos Feunard / Galopa / Magmar font +30 dégâts ce tour. Comme on
        // n'a pas de système de bonus conditionnel par Pokémon attaquant,
        // on utilise le `attackDamageBonus` global mais on documente que
        // c'est imprécis (frappe trop large). MVP acceptable.
        seat.attackDamageBonus += 30;
        consumed = true;
        break;
      }
      default: {
        this.sendErrorToSeat(
          seatId,
          `« ${playedName} » non implémentée — mécanique trop complexe pour le moteur actuel.`,
        );
        return;
      }
    }

    if (!consumed) return;
    // Défausse la carte jouée.
    seat.hand.splice(handIndex, 1);
    seat.discard.push(handCard);
    if (card.trainerType === "supporter") {
      seat.usedSupporterThisTurn = true;
    }
    // Log unique uniforme : « X utilise <CardName> ».
    this.pushLog(`${seat.username} utilise ${playedName}.`);
    this.broadcastState();
  }

  // ─────────────── combat helpers ───────────────

  /** Trouve un BattleCard du joueur (Actif ou Banc) par uid. */
  private findOwnPokemon(seat: SeatState, uid: string): BattleCard | null {
    if (seat.active?.uid === uid) return seat.active;
    return seat.bench.find((c) => c.uid === uid) ?? null;
  }

  /** Vérifie qu'on peut payer le coût d'une attaque avec les énergies
   *  attachées. "colorless" peut être payé par n'importe quelle énergie.
   *  Pocket : attachedEnergies contient directement les types ("fire",
   *  "water"…) au lieu de card_ids — pas de cartes énergie en deck. */
  private canPayAttackCost(
    attached: string[],
    cost: PokemonEnergyType[],
  ): boolean {
    const pool = new Map<string, number>();
    for (const energyType of attached) {
      pool.set(energyType, (pool.get(energyType) ?? 0) + 1);
    }
    let colorlessNeeded = 0;
    for (const c of cost) {
      if (c === "colorless") {
        colorlessNeeded++;
      } else {
        const have = pool.get(c) ?? 0;
        if (have <= 0) return false;
        pool.set(c, have - 1);
      }
    }
    let remaining = 0;
    for (const n of pool.values()) remaining += n;
    return remaining >= colorlessNeeded;
  }

  /** Appliqué quand un Pokémon Actif tombe à 0 PV ou moins. */
  private knockOut(attackerSeatId: BattleSeatId, defenderSeatId: BattleSeatId) {
    const def = this.seats[defenderSeatId];
    const att = this.seats[attackerSeatId];
    if (!def || !att || !def.active) return;
    // Le KO est annoncé inline dans le log d'attaque (« → K.O. ! »), donc
    // pas de pushLog séparé ici.
    void getCard(def.active.cardId);
    // Discard l'Actif (ses énergies attachées partent avec en Pocket — pas
    // remises au deck/main, juste supprimées).
    def.discard.push({
      uid: `disc-${this.uidCounter++}`,
      cardId: def.active.cardId,
    });
    def.active = null;

    // Pocket : l'attaquant gagne 1 KO. Premier à KO_WIN_TARGET gagne.
    att.koCount += 1;

    if (att.koCount >= KO_WIN_TARGET) {
      this.declareWinner(attackerSeatId, `${KO_WIN_TARGET} KO infligés.`);
      return;
    }
    if (def.bench.length === 0) {
      this.declareWinner(
        attackerSeatId,
        `${def.username} n'a plus de Pokémon en jeu.`,
      );
      return;
    }
    // Sinon, le défenseur doit promouvoir un Pokémon de Banc.
    def.mustPromoteActive = true;
  }

  // ─────────────── turn flow ───────────────

  /** Bascule de tour utilisé par les attaques (équivalent end-turn manuel). */
  private advanceTurn() {
    if (!this.activeSeat) return;
    const seatId = this.activeSeat;
    const seat = this.seats[seatId];
    if (!seat) return;

    // ─── Between-turns effects ────────────────────────────────────
    // Poison : 10 dégâts à chaque Actif empoisonné (les deux côtés). Pas
    // de log : le statut empoisonné est visible sur la carte (badge ☠️) et
    // les PV qui descendent.
    for (const sId of ["p1", "p2"] as BattleSeatId[]) {
      const s = this.seats[sId];
      if (!s?.active) continue;
      if (s.active.statuses.includes("poisoned")) {
        s.active.damage += 10;
        const data = getCard(s.active.cardId);
        if (data?.kind === "pokemon" && s.active.damage >= data.hp) {
          // KO inter-tours — l'adversaire incrémente son koCount (Pocket).
          const otherId: BattleSeatId = sId === "p1" ? "p2" : "p1";
          this.knockOut(otherId, sId);
          if (this.phase === "ended") {
            this.broadcastState();
            return;
          }
        }
      }
    }

    // Sleep wake : pile/face en fin du tour du joueur dont c'est le tour.
    // Animation pile/face envoyée au client (au lieu d'un log).
    if (seat.active && seat.active.statuses.includes("asleep")) {
      const heads = this.coinFlip();
      const wakeName = getCardName(seat.active.cardId);
      this.emitCoinFlip(
        `${wakeName} dort`,
        heads,
        heads ? `${wakeName} se réveille !` : `${wakeName} dort encore…`,
      );
      if (heads) {
        seat.active.statuses = seat.active.statuses.filter(
          (s) => s !== "asleep",
        );
      }
    }

    // Paralysie : retirée à la fin du tour du joueur paralysé (i.e. après
    // un tour complet d'inaction). Pas de log — le badge ⚡ disparaît
    // visuellement.
    if (seat.active && seat.active.statuses.includes("paralyzed")) {
      seat.active.statuses = seat.active.statuses.filter(
        (s) => s !== "paralyzed",
      );
    }

    // Reset des flags de tour pour le joueur sortant.
    for (const c of [seat.active, ...seat.bench]) {
      if (c) c.playedThisTurn = false;
    }
    seat.energyAttachedThisTurn = false;
    seat.hasRetreatedThisTurn = false;
    seat.evolvedThisTurn = new Set();
    seat.usedSupporterThisTurn = false;
    seat.retreatDiscount = 0;
    seat.attackDamageBonus = 0;
    // Pocket : énergie pending non attachée est perdue à end-of-turn.
    seat.pendingEnergy = null;

    const next: BattleSeatId = seatId === "p1" ? "p2" : "p1";
    this.activeSeat = next;
    this.turnNumber++;
    const nextSeat = this.seats[next];
    if (nextSeat) {
      const drawn = nextSeat.deck.pop();
      if (drawn) {
        nextSeat.hand.push(drawn);
      } else {
        // Adversaire ne peut plus piocher → il perd (deck-out).
        this.declareWinner(seatId, "Adversaire deck-out.");
        return;
      }
      // Pocket : à chaque début de tour, le joueur reçoit une énergie auto
      // (type aléatoire parmi ceux de son deck). Le first-player n'en a pas
      // au tour 1 absolu — mais comme advanceTurn n'est pas appelé pour ce
      // tour-là, c'est géré naturellement.
      nextSeat.pendingEnergy = pickRandomEnergy(nextSeat.energyTypes);
    }
    // Pas de log « Tour X — Y joue » : le numéro de tour s'affiche déjà
    // dans le bandeau du header.
    this.broadcastState();
  }

  private handleEndTurn(seatId: BattleSeatId) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    const seat = this.seats[seatId];
    if (!seat) return;
    if (seat.mustPromoteActive) {
      this.sendErrorToSeat(seatId, "Promeus d'abord un nouvel Actif.");
      return;
    }
    this.advanceTurn();
  }

  private handleConcede(seatId: BattleSeatId) {
    if (this.phase === "ended") return;
    const winner: BattleSeatId = seatId === "p1" ? "p2" : "p1";
    this.declareWinner(winner, `${this.seats[seatId]?.username} abandonne.`);
  }

  private declareWinner(winner: BattleSeatId, reason: string) {
    this.phase = "ended";
    this.winner = winner;
    this.pushLog(`🏆 ${this.seats[winner]?.username} gagne — ${reason}`);
    this.broadcastState();

    const loser: BattleSeatId = winner === "p1" ? "p2" : "p1";

    // En mode bot, si le joueur humain (p1) a gagné, on enregistre la
    // victoire pour la quête journalière (3 wins → 1 booster gratuit).
    if (
      this.botMode &&
      !this.questRecorded &&
      winner === "p1" &&
      this.seats.p1 &&
      this.gameId
    ) {
      this.questRecorded = true;
      const authId = this.seats.p1.authId;
      const gameId = this.gameId;
      void recordBotWin(this.room, authId, gameId)
        .then((res) => {
          if (!res) return;
          const conn = this.seats.p1?.conn;
          if (conn) {
            this.sendTo(conn, {
              type: "battle-quest-reward",
              botWins: res.bot_wins,
              granted: res.granted,
            });
          }
          if (res.granted) {
            this.pushLog(
              `🎁 Quête remplie ! ${this.seats.p1?.username} reçoit 1 booster gratuit.`,
            );
            this.broadcastState();
          }
        })
        .catch(() => {});
    }

    // En PvP (fun ou ranked), on enregistre l'historique + on met à jour
    // l'ELO si ranked.
    if (
      !this.botMode &&
      !this.resultRecorded &&
      this.seats[winner] &&
      this.seats[loser] &&
      this.gameId
    ) {
      this.resultRecorded = true;
      const w = this.seats[winner]!;
      const l = this.seats[loser]!;
      const gameId = this.gameId;
      const ranked = this.rankedMode;
      void recordBattleResult(this.room, {
        gameId,
        winnerId: w.authId,
        loserId: l.authId,
        winnerUsername: w.username,
        loserUsername: l.username,
        winnerDeckName: w.deckName,
        loserDeckName: l.deckName,
        ranked,
        reason,
      })
        .then((res) => {
          if (!res || !ranked) return;
          this.pushLog(
            `📊 ELO — ${w.username} ${res.winner_elo_before}→${res.winner_elo_after} · ${l.username} ${res.loser_elo_before}→${res.loser_elo_after}.`,
          );
          this.broadcastState();
        })
        .catch(() => {});
    }
  }

  // ─────────────── utils ───────────────

  private makeBattleCard(cardId: string): BattleCard {
    return {
      uid: `b${this.uidCounter++}`,
      cardId,
      attachedEnergies: [],
      damage: 0,
      statuses: [],
      playedThisTurn: true,
    };
  }

  private pushLog(line: string) {
    this.log.push(line);
    if (this.log.length > LOG_KEEP) this.log.shift();
  }

  private snapshotPublic(seat: SeatState | null): BattlePlayerPublicState | null {
    if (!seat) return null;
    return {
      authId: seat.authId,
      username: seat.username,
      deckSize: seat.deck.length,
      handCount: seat.hand.length,
      active: seat.active,
      bench: seat.bench,
      discardCount: seat.discard.length,
      koCount: seat.koCount,
      hasSetup: seat.hasSetup,
      mustPromoteActive: seat.mustPromoteActive,
      energyAttachedThisTurn: seat.energyAttachedThisTurn,
      hasRetreatedThisTurn: seat.hasRetreatedThisTurn,
      usedSupporterThisTurn: seat.usedSupporterThisTurn,
      retreatDiscount: seat.retreatDiscount,
      pendingEnergy: seat.pendingEnergy,
    };
  }

  private snapshotSelf(seat: SeatState | null): BattleSelfState | null {
    const pub = this.snapshotPublic(seat);
    if (!pub || !seat) return null;
    return {
      ...pub,
      hand: seat.hand.map((c) => c.cardId),
    };
  }

  private snapshotForSeat(seatId: BattleSeatId | null): BattleState {
    const selfSeat = seatId ? this.seats[seatId] : null;
    const opponentSeatId: BattleSeatId | null =
      seatId === "p1" ? "p2" : seatId === "p2" ? "p1" : null;
    const opponentSeat = opponentSeatId ? this.seats[opponentSeatId] : null;
    return {
      roomId: this.room.id,
      phase: this.phase,
      self: this.snapshotSelf(selfSeat),
      opponent: this.snapshotPublic(opponentSeat),
      selfSeat: seatId,
      activeSeat: this.activeSeat,
      turnNumber: this.turnNumber,
      winner: this.winner,
      log: [...this.log],
    };
  }

  private broadcastState() {
    for (const conn of this.room.getConnections()) {
      const seatId = this.connToSeat.get(conn.id) ?? null;
      this.sendTo(conn, {
        type: "battle-state",
        state: this.snapshotForSeat(seatId),
      });
    }
    // Si un bot est en jeu et c'est son tour (ou il doit promouvoir / setup),
    // on planifie son action après chaque mise à jour d'état.
    this.maybeBotAct();
  }

  private sendError(conn: Party.Connection, message: string) {
    this.sendTo(conn, { type: "battle-error", message });
  }

  private sendErrorToSeat(seatId: BattleSeatId, message: string) {
    const seat = this.seats[seatId];
    if (seat?.conn) this.sendError(seat.conn, message);
  }

  private sendTo(conn: Party.Connection, msg: BattleServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: BattleServerMessage) {
    this.room.broadcast(JSON.stringify(msg));
  }
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length >= 2 ? trimmed : null;
}

function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 200);
  return trimmed || null;
}

void fetchProfile; // placeholder pour usage futur (ratings, etc.)

function getCardName(cardId: string): string {
  const data = getCard(cardId);
  if (!data) return "?";
  return data.name;
}

function statusLabel(s: import("../../shared/types").BattleStatus): string {
  switch (s) {
    case "asleep":
      return "Endormi";
    case "burned":
      return "Brûlé";
    case "confused":
      return "Confus";
    case "paralyzed":
      return "Paralysé";
    case "poisoned":
      return "Empoisonné";
  }
}
