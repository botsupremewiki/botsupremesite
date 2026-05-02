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
  fetchBattleAggregates,
  fetchProfile,
  fetchTcgDeckById,
  recordBattleResult,
  recordBotWin,
  savePokemonReplay,
  tryUnlockAchievement,
} from "./lib/supabase";
import { TCG_ACHIEVEMENTS } from "../../shared/tcg-achievements";
import {
  type DeckCard,
  FOSSIL_NAMES,
  dealOpeningHand,
  deriveEnergyTypes,
  expandDeck,
  getCard,
  getCardForBattle,
  isBasicPokemon,
  isPlayableAsBasic,
  pickRandomEnergy,
  shuffle,
} from "./lib/battle-engine";
import { parseAttackEffects, type AttackEffect } from "./lib/attack-effects";
import { pickRandomBotDeck } from "./lib/bot-decks";

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
  /** UIDs des Pokémon ayant déjà utilisé leur talent activable ce tour. */
  abilitiesUsedThisTurn: Set<string>;
  /** Posé par effet adverse (Mr. Brillos / Hypnomade Cri Strident, …) :
   *  ce joueur ne peut pas jouer de Supporter à son prochain tour. Lu et
   *  consommé à end-turn. */
  noSupporterThisTurn: boolean;
  /** Tampon pour le flag ci-dessus : pendant que je pose le flag sur
   *  l'adversaire, il ne doit pas s'appliquer à MON tour courant. On
   *  copie `nextTurnNoSupporter` → `noSupporterThisTurn` à advanceTurn
   *  quand l'adversaire entame son tour. */
  nextTurnNoSupporter: boolean;
  mustPromoteActive: boolean;
};

export default class BattleServer implements Party.Server {
  private seats: { p1: SeatState | null; p2: SeatState | null } = {
    p1: null,
    p2: null,
  };
  private connToSeat = new Map<string, BattleSeatId>();
  private spectatorIds = new Set<string>();
  // Anti-AFK : timeout déclenché si le joueur dont c'est le tour ne fait
  // rien pendant 3 minutes. Auto-concede.
  private idleTimerHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly idleTimeoutMs = 3 * 60 * 1000;
  private phase: BattlePhase = "waiting";
  private activeSeat: BattleSeatId | null = null;
  private turnNumber = 0;
  private winner: BattleSeatId | null = null;
  private log: string[] = [];
  // Log complet (non capé) pour la sauvegarde en replay à la fin du match.
  private replayLog: string[] = [];
  private startedAt: number = Date.now();
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
    const isSpectator = url.searchParams.get("spectate") === "1";

    if (!authId || !username) {
      this.sendError(conn, "Connexion invalide (auth manquant).");
      conn.close();
      return;
    }

    // Mode spectateur : pas besoin de deck. On reçoit les broadcasts
    // mais on ne peut envoyer aucune action (filtré dans onMessage).
    if (isSpectator) {
      // Pas de bot mode pour spectator (les bots sont privés).
      if (this.botMode) {
        this.sendError(conn, "Spectateur impossible sur les matchs Bot.");
        conn.close();
        return;
      }
      this.spectatorIds.add(conn.id);
      // Envoie l'état actuel.
      this.sendTo(conn, { type: "battle-welcome", selfId: authId, selfSeat: null });
      this.broadcastState();
      return;
    }

    if (!deckId) {
      this.sendError(conn, "Connexion invalide (deck manquant).");
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
      // Plus de sièges libres → on accepte en tant que spectateur.
      this.spectatorIds.add(conn.id);
      this.sendTo(conn, { type: "battle-welcome", selfId: authId, selfSeat: null });
      this.broadcastState();
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
        abilitiesUsedThisTurn: new Set(),
        noSupporterThisTurn: false,
        nextTurnNoSupporter: false,
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
      // équipé d'un deck aléatoire pioché parmi BOT_DECKS (variété des
      // matchups). On ne mirror plus le deck du joueur.
      if (this.botMode && seatId === "p1" && !this.seats.p2) {
        this.fillBotSeat();
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

  /** Remplit p2 avec le Bot Suprême équipé d'un deck choisi au hasard
   *  parmi `BOT_DECKS` (5 archétypes différents : Feu, Eau, Élec, Plante,
   *  Combat). Permet des matchups variés au lieu d'un mirror du deck
   *  joueur. */
  private fillBotSeat() {
    const botDeck = pickRandomBotDeck();
    const deck = expandDeck(botDeck.cards);
    shuffle(deck);
    const { hand, mulligans } = dealOpeningHand(deck, OPENING_HAND_SIZE);
    this.seats.p2 = {
      authId: BOT_AUTH_ID,
      username: BOT_USERNAME,
      deckName: botDeck.name,
      conn: null,
      deck,
      hand,
      discard: [],
      active: null,
      bench: [],
      hasSetup: false,
      koCount: 0,
      pendingEnergy: null,
      energyTypes: botDeck.energyTypes,
      energyAttachedThisTurn: false,
      hasRetreatedThisTurn: false,
      evolvedThisTurn: new Set(),
      usedSupporterThisTurn: false,
      retreatDiscount: 0,
      attackDamageBonus: 0,
      abilitiesUsedThisTurn: new Set(),
      noSupporterThisTurn: false,
      nextTurnNoSupporter: false,
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
    // Active : préfère un VRAI Pokémon de Base (pas un Fossile) — un Fossile
    // ne peut pas attaquer, donc l'utiliser comme Actif est suicidaire.
    let basicIdx = seat.hand.findIndex((c) => isBasicPokemon(c.cardId));
    if (basicIdx < 0) {
      basicIdx = seat.hand.findIndex((c) => isPlayableAsBasic(c.cardId));
    }
    if (basicIdx < 0) return;
    this.handleSetActive("p2", basicIdx);
    // Banc : jusqu'à 3 autres Basics (les Fossiles peuvent y aller — ils
    // servent de tank).
    for (let n = 0; n < 3; n++) {
      const idx = seat.hand.findIndex((c) => isPlayableAsBasic(c.cardId));
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
    // Préfère un Pokémon avec le plus de PV restants — et déprio les Fossiles
    // (incapables d'attaquer) en cas d'égalité.
    let bestIdx = 0;
    let bestRemaining = -Infinity;
    for (let i = 0; i < seat.bench.length; i++) {
      const c = seat.bench[i];
      const data = getCardForBattle(c.cardId);
      if (!data) continue;
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

    // 2. Pose un Basic au Banc si banc pas plein (Fossiles inclus = tank)
    if (seat.bench.length < MAX_BENCH) {
      const basicIdx = seat.hand.findIndex((c) => isPlayableAsBasic(c.cardId));
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

    // 4. Joue une carte Dresseur si pertinent.
    if (this.botMaybePlayTrainer(seat)) return;

    // 5. Active un talent si dispo (1×/tour, par carte).
    if (this.botMaybeUseAbility(seat)) return;

    // 6. Attaque (la plus forte payée). Les Fossiles n'ayant pas d'attaque,
    // `data.attacks` sera vide et la boucle sautera ce step.
    const data = seat.active ? getCardForBattle(seat.active.cardId) : null;
    if (
      seat.active &&
      data &&
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
          this.handleAttack("p2", idx, null, null);
          // handleAttack fait avancer le tour (ou termine si KO)
          return;
        }
      }
    }

    // 7. Rien à faire → end turn
    this.handleEndTurn("p2");
  }

  /** Tente de jouer une carte Dresseur pertinente depuis la main du bot.
   *  Retourne true si une carte a été jouée (le tour continue via
   *  scheduleNextBotStep), false sinon. Stratégie naïve mais utile :
   *  Potion si Actif blessé, Recherches Pro si main vide, Poké Ball si
   *  pas de basic en main, Giovanni avant attaque KO, Ondine sur Pokémon
   *  Eau, etc. */
  private botMaybePlayTrainer(seat: SeatState): boolean {
    for (let hi = 0; hi < seat.hand.length; hi++) {
      const handCard = seat.hand[hi];
      const card = getCard(handCard.cardId);
      if (!card || card.kind !== "trainer") continue;
      if (FOSSIL_NAMES.has(card.name)) continue; // joué via play-basic

      // Pocket : 1 Supporter max par tour, et flag noSupporter possible.
      if (card.trainerType === "supporter") {
        if (seat.usedSupporterThisTurn) continue;
        if (seat.noSupporterThisTurn) continue;
      }

      // Décide si la carte est pertinente MAINTENANT.
      const oppId: BattleSeatId = "p1";
      const opp = this.seats[oppId];
      switch (card.name) {
        case "Potion": {
          // Joue si l'Actif est blessé d'au moins 20.
          if (seat.active && seat.active.damage >= 20) {
            this.handlePlayTrainer("p2", hi, seat.active.uid);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Poké Ball": {
          // Joue si peu de basics en main / banc pas plein.
          if (seat.bench.length < MAX_BENCH) {
            this.handlePlayTrainer("p2", hi, null);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Recherches Professorales": {
          // Joue si main contient ≤ 4 cartes (sinon gaspille).
          if (seat.hand.length <= 4) {
            this.handlePlayTrainer("p2", hi, null);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Vitesse +": {
          // Joue avant retraite si l'Actif est en mauvaise posture.
          if (seat.active && seat.bench.length > 0) {
            const d = getCardForBattle(seat.active.cardId);
            if (d && seat.active.damage > d.hp / 2) {
              this.handlePlayTrainer("p2", hi, null);
              this.scheduleNextBotStep();
              return true;
            }
          }
          break;
        }
        case "Giovanni": {
          // Joue si l'Actif peut KO l'opp avec +10 dégâts (= Giovanni
          // débloque un KO qui aurait raté de 10 dmg).
          if (seat.active && opp?.active) {
            const aData = getCardForBattle(seat.active.cardId);
            const dData = getCardForBattle(opp.active.cardId);
            if (aData && dData) {
              const hpLeft = dData.hp - opp.active.damage;
              const bestAttack = aData.attacks
                .filter((a) =>
                  this.canPayAttackCost(seat.active!.attachedEnergies, a.cost),
                )
                .reduce<number>(
                  (acc, a) => Math.max(acc, a.damage ?? 0),
                  0,
                );
              if (bestAttack > 0 && bestAttack < hpLeft && bestAttack + 10 >= hpLeft) {
                this.handlePlayTrainer("p2", hi, null);
                this.scheduleNextBotStep();
                return true;
              }
            }
          }
          break;
        }
        case "Erika": {
          // Joue si on a un Pokémon Plante blessé d'au moins 30.
          const targets = [
            ...(seat.active ? [seat.active] : []),
            ...seat.bench,
          ];
          for (const c of targets) {
            const d = getCardForBattle(c.cardId);
            if (d?.type === "grass" && c.damage >= 30) {
              this.handlePlayTrainer("p2", hi, c.uid);
              this.scheduleNextBotStep();
              return true;
            }
          }
          break;
        }
        case "Pierre": {
          // Joue si on a Grolem ou Onix en jeu sans énergies max.
          const targets = [
            ...(seat.active ? [seat.active] : []),
            ...seat.bench,
          ];
          for (const c of targets) {
            const d = getCardForBattle(c.cardId);
            if (d && (d.name === "Grolem" || d.name === "Onix")) {
              this.handlePlayTrainer("p2", hi, c.uid);
              this.scheduleNextBotStep();
              return true;
            }
          }
          break;
        }
        case "Ondine": {
          // Joue sur le Pokémon Eau le plus chargé en énergies (= déjà
          // investi, on continue à le booster).
          const targets = [
            ...(seat.active ? [seat.active] : []),
            ...seat.bench,
          ].filter((c) => getCardForBattle(c.cardId)?.type === "water");
          if (targets.length > 0) {
            const best = targets.reduce((acc, c) =>
              c.attachedEnergies.length > acc.attachedEnergies.length
                ? c
                : acc,
            );
            this.handlePlayTrainer("p2", hi, best.uid);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Major Bob": {
          // Joue si l'Actif est Raichu/Électrode/Élektek + ⚡ sur le Banc.
          if (seat.active) {
            const d = getCardForBattle(seat.active.cardId);
            const valid = new Set(["Raichu", "Électrode", "Élektek"]);
            if (d && valid.has(d.name)) {
              const hasLightningBench = seat.bench.some((c) =>
                c.attachedEnergies.includes("lightning"),
              );
              if (hasLightningBench) {
                this.handlePlayTrainer("p2", hi, null);
                this.scheduleNextBotStep();
                return true;
              }
            }
          }
          break;
        }
        case "Auguste": {
          // Joue avant attaque pour booster (le bonus est globalisé en MVP).
          if (seat.active) {
            this.handlePlayTrainer("p2", hi, null);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Morgane": {
          // Joue si le Banc adverse contient un Pokémon plus faible que
          // son Actif (= force un swap défavorable).
          if (opp?.active && opp.bench.length > 0) {
            this.handlePlayTrainer("p2", hi, null);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Carton Rouge": {
          // Joue si l'adversaire a 5+ cartes en main (= on lui réinitialise
          // une grosse main contre 3 cartes random).
          if (opp && opp.hand.length >= 5) {
            this.handlePlayTrainer("p2", hi, null);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Pokédex":
        case "Scrute Main":
          // Effets d'information — peu utiles pour le bot. Skip.
          break;
        case "Koga": {
          // Joue si Grotadmorv ou Smogogo Actif blessé.
          if (seat.active) {
            const d = getCardForBattle(seat.active.cardId);
            const valid = new Set(["Grotadmorv", "Smogogo"]);
            if (d && valid.has(d.name) && seat.active.damage >= 50 && seat.bench.length > 0) {
              this.handlePlayTrainer("p2", hi, null);
              this.scheduleNextBotStep();
              return true;
            }
          }
          break;
        }
      }
    }
    return false;
  }

  /** Tente d'activer un talent activable d'un Pokémon allié si pertinent.
   *  Retourne true si un talent a été activé. */
  private botMaybeUseAbility(seat: SeatState): boolean {
    const candidates: BattleCard[] = [];
    if (seat.active) candidates.push(seat.active);
    candidates.push(...seat.bench);

    for (const c of candidates) {
      if (seat.abilitiesUsedThisTurn.has(c.uid)) continue;
      const data = getCardForBattle(c.cardId);
      if (data?.ability?.kind !== "activated") continue;

      const oppId: BattleSeatId = "p1";
      const opp = this.seats[oppId];
      const isActive = seat.active?.uid === c.uid;

      switch (data.ability.name) {
        case "Soin Poudre": {
          // Papilusion : utile si au moins 1 Pokémon allié blessé.
          const all = [...(seat.active ? [seat.active] : []), ...seat.bench];
          if (all.some((p) => p.damage > 0)) {
            this.handleUseAbility("p2", c.uid, null);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Charge Volt": {
          // Magnéton : toujours utile (énergie gratuite).
          this.handleUseAbility("p2", c.uid, null);
          this.scheduleNextBotStep();
          return true;
        }
        case "Pendulo Dodo": {
          // Hypnomade : pile/face Endormi adverse, toujours essayer.
          if (opp?.active) {
            this.handleUseAbility("p2", c.uid, null);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Ombre Psy": {
          // Gardevoir : attache 🌀 sur Actif Psy. Vérifie que l'Actif est Psy.
          const aData = seat.active ? getCardForBattle(seat.active.cardId) : null;
          if (aData?.type === "psychic") {
            this.handleUseAbility("p2", c.uid, null);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Fuite de Gaz": {
          // Smogogo (Actif requis) : empoisonne, toujours utile.
          if (isActive && opp?.active) {
            this.handleUseAbility("p2", c.uid, null);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Sheauriken": {
          // Amphinobi : 20 dmg sur le Pokémon adverse le plus faible (KO si possible).
          if (opp?.active) {
            const targets = [
              ...(opp.active ? [opp.active] : []),
              ...opp.bench,
            ];
            // Préfère un Pokémon qui sera KO par 20 dégâts.
            const ko = targets.find((t) => {
              const td = getCardForBattle(t.cardId);
              return td && td.hp - t.damage <= 20;
            });
            const target = ko ?? targets[0];
            if (target) {
              this.handleUseAbility("p2", c.uid, target.uid);
              this.scheduleNextBotStep();
              return true;
            }
          }
          break;
        }
        case "Numérisation": {
          // Porygon : peek deck. Pas utile pour le bot, skip.
          break;
        }
        case "Déroute": {
          // Roucarnage : force switch adverse, joue si l'Actif adverse est
          // chargé en énergies (= on neutralise une menace).
          if (
            opp?.active &&
            opp.active.attachedEnergies.length >= 2 &&
            opp.bench.length > 0
          ) {
            this.handleUseAbility("p2", c.uid, null);
            this.scheduleNextBotStep();
            return true;
          }
          break;
        }
        case "Piège Parfumé": {
          // Empiflor (Actif requis) : promeut un Banc adverse de Base au
          // hasard. Joue si l'Actif adverse est dangereux ET banc adverse
          // contient un Basic.
          if (isActive && opp?.active && opp.bench.length > 0) {
            const candidate = opp.bench.find((b) => {
              const bd = getCardForBattle(b.cardId);
              return bd?.stage === "basic";
            });
            if (candidate) {
              this.handleUseAbility("p2", c.uid, candidate.uid);
              this.scheduleNextBotStep();
              return true;
            }
          }
          break;
        }
      }
    }
    return false;
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
    // Anti-AFK : tout message du joueur actif réarme le timer.
    if (this.activeSeat === seatId && this.phase === "playing") {
      this.armIdleTimer(seatId);
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
        this.handleAttack(
          seatId,
          data.attackIndex,
          data.copyFromUid ?? null,
          data.copyAttackIndex ?? null,
        );
        break;
      case "battle-promote-active":
        this.handlePromoteActive(seatId, data.benchIndex);
        break;
      case "battle-play-trainer":
        this.handlePlayTrainer(seatId, data.handIndex, data.targetUid ?? null);
        break;
      case "battle-use-ability":
        this.handleUseAbility(seatId, data.cardUid, data.targetUid ?? null);
        break;
      case "battle-end-turn":
        this.handleEndTurn(seatId);
        break;
      case "battle-concede":
        this.handleConcede(seatId);
        break;
      case "battle-emote":
        this.handleEmote(seatId, data.emoteId);
        break;
    }
  }

  // Cooldown anti-spam : 1 emote / 3s par siège.
  private lastEmoteAt: Map<BattleSeatId, number> = new Map();
  private handleEmote(seatId: BattleSeatId, emoteId: string): void {
    const now = Date.now();
    const last = this.lastEmoteAt.get(seatId) ?? 0;
    if (now - last < 3000) return;
    // Validation : doit être un id connu du catalogue (8 emotes).
    const valid = new Set([
      "salut",
      "gg",
      "beaujeu",
      "argh",
      "hate",
      "desole",
      "penser",
      "haha",
    ]);
    if (!valid.has(emoteId)) return;
    this.lastEmoteAt.set(seatId, now);
    this.broadcast({
      type: "battle-emote",
      seat: seatId,
      emoteId: emoteId as never,
    });
  }

  onClose(conn: Party.Connection) {
    this.spectatorIds.delete(conn.id);
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
    if (!card || !isPlayableAsBasic(card.cardId)) {
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
    if (!card || !isPlayableAsBasic(card.cardId)) {
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

  /** Vérifie qu'on peut continuer à jouer ce tour : si l'adversaire est en
   *  `mustPromoteActive` (typiquement parce qu'on a joué Morgane), il faut
   *  attendre qu'il choisisse son nouveau Actif avant de continuer. Renvoie
   *  `true` si l'action peut procéder, `false` sinon (avec erreur envoyée). */
  private requireOpponentReady(seatId: BattleSeatId): boolean {
    const oppId: BattleSeatId = seatId === "p1" ? "p2" : "p1";
    const opp = this.seats[oppId];
    if (opp?.mustPromoteActive) {
      this.sendErrorToSeat(
        seatId,
        "Attends que l'adversaire choisisse son nouveau Pokémon Actif.",
      );
      return false;
    }
    return true;
  }

  // ─────────────── playing-phase actions ───────────────

  /** Pose un Pokémon de Base de la main au Banc en main phase. */
  private handlePlayBasic(seatId: BattleSeatId, handIndex: number) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    if (!this.requireOpponentReady(seatId)) return;
    const seat = this.seats[seatId];
    if (!seat || seat.mustPromoteActive) return;
    if (seat.bench.length >= MAX_BENCH) {
      this.sendErrorToSeat(seatId, `Banc complet (${MAX_BENCH} max).`);
      return;
    }
    const card = seat.hand[handIndex];
    if (!card || !isPlayableAsBasic(card.cardId)) {
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
    if (!this.requireOpponentReady(seatId)) return;
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
    if (!this.requireOpponentReady(seatId)) return;
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
    if (!this.requireOpponentReady(seatId)) return;
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
    if (seat.active.noRetreatNextTurn) {
      this.sendErrorToSeat(
        seatId,
        "Ce Pokémon ne peut pas battre en retraite ce tour (effet du tour précédent).",
      );
      return;
    }
    const newActive = seat.bench[benchIndex];
    if (!newActive) {
      this.sendErrorToSeat(seatId, "Pas de Pokémon de Banc à promouvoir.");
      return;
    }
    const data = getCardForBattle(seat.active.cardId);
    if (!data) return;
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

  /** Exécute une attaque de l'Actif. La 1ère ou 2nde selon attackIndex.
   *  Si `copyFromUid` + `copyAttackIndex` sont fournis ET que l'attaque
   *  d'origine contient l'effet `copy-opp-attack` (Mew « Mémoire Ancestrale »),
   *  on exécute l'attaque copiée à la place. L'attaquant doit toujours
   *  payer le coût (avec ses propres énergies) — sinon l'attaque foire. */
  private handleAttack(
    seatId: BattleSeatId,
    attackIndex: number,
    copyFromUid: string | null,
    copyAttackIndex: number | null,
  ) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    if (!this.requireOpponentReady(seatId)) return;
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
    // Flag « ne peut pas attaquer ce tour » posé par une attaque adverse au
    // tour précédent (ex « Le Défenseur ne peut pas attaquer pendant le
    // prochain tour »).
    if (seat.active.noAttackNextTurn) {
      this.sendErrorToSeat(
        seatId,
        "Ce Pokémon ne peut pas attaquer ce tour (effet du tour précédent).",
      );
      return;
    }
    const attackerData = getCardForBattle(seat.active.cardId);
    if (!attackerData) return;
    const originalAttack = attackerData.attacks[attackIndex];
    if (!originalAttack) {
      this.sendErrorToSeat(seatId, "Ce Pokémon n'a pas d'attaque.");
      return;
    }

    // ── Copy attack (Mew « Mémoire Ancestrale ») ──
    // Si l'attaque d'origine contient l'effet `copy-opp-attack`, on
    // remplace `attack` par l'attaque copiée. Sinon, attaque normale.
    let attack = originalAttack;
    let copiedFromName: string | null = null;
    const originalEffects = parseAttackEffects(originalAttack.text ?? null);
    const isCopyAttack = originalEffects.some(
      (e) => e.kind === "copy-opp-attack",
    );
    if (isCopyAttack) {
      if (copyFromUid == null || copyAttackIndex == null) {
        this.sendErrorToSeat(
          seatId,
          "Choisis une attaque adverse à copier.",
        );
        return;
      }
      const oppId: BattleSeatId = seatId === "p1" ? "p2" : "p1";
      const opp = this.seats[oppId];
      if (!opp) return;
      const sourceCard = this.findOwnPokemon(opp, copyFromUid);
      if (!sourceCard) {
        this.sendErrorToSeat(seatId, "Cible de copie introuvable.");
        return;
      }
      const sourceData = getCardForBattle(sourceCard.cardId);
      const copied = sourceData?.attacks[copyAttackIndex];
      if (!sourceData || !copied) {
        this.sendErrorToSeat(seatId, "Attaque à copier introuvable.");
        return;
      }
      attack = copied;
      copiedFromName = sourceData.name;
      // Pocket : « Si ce Pokémon n'a pas l'Énergie nécessaire pour utiliser
      // cette attaque, cette attaque ne fait rien. » → si on n'a pas le coût,
      // on log l'échec et on avance le tour SANS appliquer d'effets.
      if (!this.canPayAttackCost(seat.active.attachedEnergies, copied.cost)) {
        this.pushLog(
          `${attackerData.name} utilise ${originalAttack.name} (copie ${copied.name} de ${sourceData.name}) → coût en Énergies non payé, ratée !`,
        );
        if (this.phase === "playing") this.advanceTurn();
        else this.broadcastState();
        return;
      }
    }

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
    const defenderData = getCardForBattle(opp.active.cardId);
    if (!defenderData) return;

    // ═══ Phase 1 : parse les effets + calcule le damage final ═══════
    const effects = parseAttackEffects(attack.text ?? null);
    const baseDamage = attack.damage ?? 0;
    const dmgResult = this.resolveAttackDamage({
      seatId,
      seat,
      opp,
      effects,
      attackerName: attackerData.name,
      attackerType: attackerData.type,
      attackName: attack.name,
      attackCost: attack.cost,
      baseDamage,
      defenderWeakness: defenderData.weakness ?? null,
    });

    // Si l'attaque a foiré (pile sur "Si pile, l'attaque ne fait rien"),
    // on log et on avance — pas d'effets secondaires.
    if (dmgResult.cancelled) {
      this.pushLog(
        `${attackerData.name} utilise ${attack.name} → ratée !`,
      );
      if (this.phase === "playing") this.advanceTurn();
      else this.broadcastState();
      return;
    }

    const damage = dmgResult.finalDamage;
    const isWeakness = dmgResult.weaknessApplied;

    // ═══ Phase 2 : applique le damage principal ═════════════════════
    opp.active.damage += damage;

    // Log unique style jeu Pokémon : « Pikachu utilise Éclair → 40 dégâts
    // à Electhor (super efficace !) → K.O. ! ». Pour Mew « Mémoire
    // Ancestrale » : « Mew utilise Mémoire Ancestrale (copie Lance-Flammes
    // de Goupix) → 30 dégâts à Electhor ».
    const willKo = opp.active.damage >= defenderData.hp;
    const headParts =
      copiedFromName !== null
        ? `${attackerData.name} utilise ${originalAttack.name} (copie ${attack.name} de ${copiedFromName})`
        : `${attackerData.name} utilise ${attack.name}`;
    const parts: string[] = [headParts];
    if (damage > 0) parts.push(`→ ${damage} dégâts à ${defenderData.name}`);
    if (isWeakness) parts.push("(super efficace !)");
    if (willKo) parts.push("→ K.O. !");
    this.pushLog(parts.join(" "));

    // ── Recoil de la branche pile (Élektek Poing Éclair) ──
    if (dmgResult.recoilSelf && dmgResult.recoilSelf > 0 && seat.active) {
      seat.active.damage += dmgResult.recoilSelf;
      const sd = getCardForBattle(seat.active.cardId);
      if (sd && seat.active.damage >= sd.hp) {
        // Self-KO sur le recul → l'adversaire marque 1 KO.
        this.knockOut(oppId, seatId);
      }
    }

    // ── Talent passif Tartard « Contre-Attaque » ──
    // Si le défenseur est Tartard Actif, l'attaquant subit 20 dégâts.
    if (
      damage > 0 &&
      defenderData.ability?.kind === "passive" &&
      defenderData.ability.name === "Contre-Attaque" &&
      seat.active
    ) {
      seat.active.damage += 20;
      this.pushLog(`${defenderData.name} contre-attaque → 20 dégâts à ${attackerData.name} !`);
      const sd = getCardForBattle(seat.active.cardId);
      if (sd && seat.active.damage >= sd.hp) {
        // Self-KO sur la riposte → l'adversaire marque 1 KO.
        this.knockOut(oppId, seatId);
      }
    }

    // ═══ Phase 3 : effets secondaires (status, heal, bench damage…) ══
    // Appliqués QUE si l'attaque a touché (Pocket : si l'attaque foire,
    // aucun effet ne déclenche).
    this.applyAttackSideEffects({
      seatId,
      effects,
      damageDealt: damage,
      attackerName: attackerData.name,
    });

    // Vérif KO sur le défenseur (au cas où les effets l'ont KO via status…
    // après les dégâts principaux). knockOut ne pousse plus de log à part.
    if (opp.active && opp.active.damage >= defenderData.hp) {
      this.knockOut(seatId, oppId);
    }

    // Une attaque met fin au tour (sauf si KO a déjà déclaré vainqueur,
    // ou si "self-swap" a été déclenché et change l'Actif).
    if (this.phase === "playing") {
      this.advanceTurn();
    } else {
      this.broadcastState();
    }
  }

  /** Calcule le damage final d'une attaque en appliquant les modificateurs
   *  parsés (multi-coin, conditional bonus, scaling, weakness). Émet les
   *  coin-flips au passage. */
  private resolveAttackDamage(input: {
    seatId: BattleSeatId;
    seat: SeatState;
    opp: SeatState;
    effects: AttackEffect[];
    attackerName: string;
    attackerType: PokemonEnergyType;
    attackName: string;
    /** Coût de l'attaque utilisée — nécessaire pour `bonus-by-extra-energies`
     *  qui soustrait le coût strict en énergies du type donné aux énergies
     *  attachées pour calculer le « surplus ». */
    attackCost: PokemonEnergyType[];
    baseDamage: number;
    defenderWeakness: PokemonEnergyType | null;
  }): {
    finalDamage: number;
    weaknessApplied: boolean;
    cancelled: boolean;
    /** Self-damage à appliquer après les dégâts principaux (Élektek Poing
     *  Éclair sur pile). 0 par défaut. */
    recoilSelf?: number;
  } {
    const { seat, opp, effects, attackerName, attackerType, baseDamage } = input;
    let damage = baseDamage;
    let cancelled = false;
    if (!opp.active) {
      return { finalDamage: 0, weaknessApplied: false, cancelled: true };
    }

    // ── Multi-coin per face (suffix=x) : damage = baseDamage × heads ──
    const multiCoin = effects.find((e) => e.kind === "multi-coin-per-face");
    if (multiCoin && multiCoin.kind === "multi-coin-per-face") {
      let heads = 0;
      for (let i = 0; i < multiCoin.coins; i++) {
        const isHead = this.coinFlip();
        if (isHead) heads++;
        this.emitCoinFlip(
          `${attackerName} — lancer`,
          isHead,
          undefined,
          i + 1,
          multiCoin.coins,
        );
      }
      damage = baseDamage * heads;
    }

    // ── Flip until tails for damage (Léviator « Langue Sans Fin ») ──
    const flipUntil = effects.find(
      (e) => e.kind === "flip-until-tails-damage",
    );
    if (flipUntil && flipUntil.kind === "flip-until-tails-damage") {
      let heads = 0;
      let flips = 0;
      while (flips < 20) {
        flips++;
        const isHead = this.coinFlip();
        if (isHead) heads++;
        this.emitCoinFlip(
          `${attackerName} — lancer`,
          isHead,
          isHead ? `+${flipUntil.perFace}` : `Total : ${heads * flipUntil.perFace} dégâts.`,
          flips,
        );
        if (!isHead) break;
      }
      damage = flipUntil.perFace * heads;
    }

    // ── All-coins bonus (suffix=+, "Si toutes face, +N") ──
    const allCoins = effects.find((e) => e.kind === "all-coins-bonus");
    if (allCoins && allCoins.kind === "all-coins-bonus") {
      let allHeads = true;
      for (let i = 0; i < allCoins.coins; i++) {
        const isHead = this.coinFlip();
        if (!isHead) allHeads = false;
        this.emitCoinFlip(
          `${attackerName} — lancer`,
          isHead,
          undefined,
          i + 1,
          allCoins.coins,
        );
      }
      if (allHeads) damage += allCoins.bonus;
    }

    // ── Single-coin bonus (suffix=+, "Si face, +N") ──
    const singleBonus = effects.find((e) => e.kind === "single-coin-bonus");
    if (singleBonus && singleBonus.kind === "single-coin-bonus") {
      const heads = this.coinFlip();
      this.emitCoinFlip(
        `${attackerName} — bonus`,
        heads,
        heads ? `+${singleBonus.bonus} dégâts !` : "Pas de bonus.",
      );
      if (heads) damage += singleBonus.bonus;
    }

    // ── Tails-fail (suffix=, "Si pile, ne fait rien") ──
    const tailsFail = effects.find((e) => e.kind === "tails-fail");
    if (tailsFail) {
      const heads = this.coinFlip();
      this.emitCoinFlip(
        `${attackerName}`,
        heads,
        heads ? "Attaque réussie !" : "L'attaque foire !",
      );
      if (!heads) {
        cancelled = true;
        damage = 0;
      }
    }

    // ── Single-coin avec branches symétriques (Élektek Poing Éclair) ──
    // UN seul flip : face → +bonus dégâts, pile → +recoil self-damage.
    // Le recoil est appliqué en dehors (champ recoilSelf retourné).
    let recoilSelf = 0;
    const branched = effects.find(
      (e) => e.kind === "single-coin-bonus-or-recoil",
    );
    if (branched && branched.kind === "single-coin-bonus-or-recoil") {
      const heads = this.coinFlip();
      this.emitCoinFlip(
        `${attackerName}`,
        heads,
        heads
          ? `Face : +${branched.bonus} dégâts !`
          : `Pile : recul ${branched.recoil} dégâts.`,
      );
      if (heads) {
        damage += branched.bonus;
      } else {
        recoilSelf = branched.recoil;
      }
    }

    if (cancelled) {
      return { finalDamage: 0, weaknessApplied: false, cancelled: true };
    }

    // ── Phase A : scaling MULTIPLICATEUR (suffix "x") ───────────────
    //  REMPLACE le damage. Doit être AVANT les bonus additifs pour ne
    //  pas les écraser. Un seul scaling multiplicateur peut être actif
    //  par attaque (vérifié sur le set A1+P-A).
    //
    //  Convention parser :
    //   - scaling-by-typed-bench   → multiplicateur (« 30 par Pokémon {L} »)
    //   - scaling-by-bench-count   → multiplicateur (« 30 par Pokémon »)
    //   - scaling-by-opp-energies  → additif (« +20 par Énergie attachée »)
    //   - scaling-by-named-bench   → additif (« +50 par Nidoking »)
    for (const e of effects) {
      if (e.kind === "scaling-by-bench-count") {
        damage = e.per * seat.bench.length;
      }
      if (e.kind === "scaling-by-typed-bench") {
        const count = seat.bench.filter((c) => {
          const d = getCardForBattle(c.cardId);
          return d?.type === e.type;
        }).length;
        damage = e.per * count;
      }
    }

    // ── Phase B : bonus ADDITIFS (sans coin flip) ────────────────────
    for (const e of effects) {
      if (e.kind === "bonus-if-opp-hurt" && opp.active.damage > 0) {
        damage += e.bonus;
      }
      if (
        e.kind === "bonus-if-opp-status" &&
        opp.active.statuses.includes(e.status)
      ) {
        damage += e.bonus;
      }
      if (
        e.kind === "bonus-if-self-hurt" &&
        seat.active &&
        seat.active.damage > 0
      ) {
        damage += e.bonus;
      }
      // Bonus si N énergies du type donné en plus du coût de l'attaque.
      // Ex Tortank Hydrocanon (coût W+C) « Si ce Pokémon a au moins 2
      // Énergies {W} de plus, +60 dmg » : il faut 2 W ATTACHÉES en plus
      // du coût strict en W (le coût strict en W est 1, donc il faut
      // 1+2 = 3 W attachées au total pour déclencher le bonus).
      if (e.kind === "bonus-by-extra-energies" && seat.active) {
        const attached = seat.active.attachedEnergies.filter(
          (en) => en === e.energyType,
        ).length;
        const requiredOfType = input.attackCost.filter(
          (c) => c === e.energyType,
        ).length;
        const extra = attached - requiredOfType;
        if (extra >= e.minExtra) {
          damage += e.bonus;
        }
      }
      // Scaling additifs (suffix "+").
      if (e.kind === "scaling-by-opp-energies") {
        damage += e.per * opp.active.attachedEnergies.length;
      }
      if (e.kind === "scaling-by-named-bench") {
        const count = seat.bench.filter((c) => {
          const d = getCardForBattle(c.cardId);
          return d?.name === e.name;
        }).length;
        damage += e.per * count;
      }
    }

    // ── Bonus global (Giovanni / Auguste) ──
    if (damage > 0) damage += seat.attackDamageBonus;

    // ── Pénalité « attaque du Défenseur infligent -N » posée au tour
    //    précédent (sur l'attaquant, qui était défenseur quand le flag a
    //    été posé). ──
    if (damage > 0 && seat.active?.attackDamagePenaltyNextTurn) {
      damage = Math.max(
        0,
        damage - seat.active.attackDamagePenaltyNextTurn,
      );
    }

    // ── Faiblesse (+20) ──
    let weaknessApplied = false;
    if (
      damage > 0 &&
      input.defenderWeakness &&
      input.defenderWeakness === attackerType
    ) {
      damage += 20;
      weaknessApplied = true;
    }

    // ── Talents passifs de réduction sur le DÉFENSEUR ──
    // Crustabri Coque Armure (−10), Melmetal Strate Dure (−20).
    if (damage > 0 && opp.active) {
      const defAbility = getCardForBattle(opp.active.cardId)?.ability;
      if (defAbility?.kind === "passive") {
        if (defAbility.name === "Coque Armure") damage = Math.max(0, damage - 10);
        else if (defAbility.name === "Strate Dure") damage = Math.max(0, damage - 20);
      }
    }

    // ── Flag « damageReductionNextTurn » sur le défenseur (M. Mime,
    //    Attaque d'Obstacle au tour précédent) ──
    if (damage > 0 && opp.active?.damageReductionNextTurn) {
      damage = Math.max(0, damage - opp.active.damageReductionNextTurn);
    }

    // ── Flag « invulnerableNextTurn » sur le défenseur ──
    // Si actif, l'attaque inflige 0 dégât et tous les effets secondaires
    // sont annulés (signalé via `cancelled: true` qui short-circuite le
    // reste de handleAttack).
    if (opp.active?.invulnerableNextTurn) {
      return { finalDamage: 0, weaknessApplied: false, cancelled: true };
    }

    return { finalDamage: damage, weaknessApplied, cancelled: false, recoilSelf };
  }

  /** Applique les effets secondaires d'une attaque APRÈS le damage principal :
   *  status sur l'adversaire, heal/recoil sur l'attaquant, bench damage,
   *  défausses d'énergies, attaches, draw, search, swap. */
  private applyAttackSideEffects(input: {
    seatId: BattleSeatId;
    effects: AttackEffect[];
    damageDealt: number;
    attackerName: string;
  }) {
    const { seatId, effects, damageDealt, attackerName } = input;
    const oppId: BattleSeatId = seatId === "p1" ? "p2" : "p1";
    const seat = this.seats[seatId];
    const opp = this.seats[oppId];
    if (!seat || !opp) return;

    for (const e of effects) {
      // ── Statuts ──
      if (e.kind === "inflict-status") {
        if (!opp.active) continue;
        if (e.conditional === "coin-flip") {
          const heads = this.coinFlip();
          this.emitCoinFlip(
            `${attackerName} — statut`,
            heads,
            heads ? `Adversaire ${e.status} !` : "Pas de statut.",
          );
          if (!heads) continue;
        }
        if (!opp.active.statuses.includes(e.status)) {
          opp.active.statuses.push(e.status);
        }
      }
      // ── Heal self ──
      else if (e.kind === "self-heal" && seat.active) {
        seat.active.damage = Math.max(0, seat.active.damage - e.amount);
      }
      // ── Drain heal (Vampi-Pokémon) ──
      else if (e.kind === "drain-heal" && seat.active) {
        seat.active.damage = Math.max(0, seat.active.damage - damageDealt);
      }
      // ── Self damage / recoil ──
      else if (e.kind === "self-damage" && seat.active) {
        seat.active.damage += e.amount;
        // Vérifie si on s'est KO soi-même.
        const sd = getCardForBattle(seat.active.cardId);
        if (sd && seat.active.damage >= sd.hp) {
          this.knockOut(oppId, seatId);
        }
      }
      // ── Self bench damage (1 random) ──
      else if (e.kind === "self-bench-damage" && seat.bench.length > 0) {
        const idx = Math.floor(Math.random() * seat.bench.length);
        seat.bench[idx].damage += e.amount;
      }
      // ── Bench damage all opp ──
      else if (e.kind === "bench-damage-all-opp") {
        for (const c of opp.bench) c.damage += e.amount;
      }
      // ── Random hit opp (any pokemon, active + bench) ──
      else if (e.kind === "random-hit-opp") {
        const targets = [
          ...(opp.active ? [opp.active] : []),
          ...opp.bench,
        ];
        if (targets.length > 0) {
          const t = targets[Math.floor(Math.random() * targets.length)];
          t.damage += e.amount;
        }
      }
      // ── Random hit opp bench only ──
      else if (e.kind === "random-hit-opp-bench" && opp.bench.length > 0) {
        const t = opp.bench[Math.floor(Math.random() * opp.bench.length)];
        t.damage += e.amount;
      }
      // ── Multi random hit (Mewtwo Pulvérize Psy) ──
      else if (e.kind === "multi-random-hit-opp") {
        const targets = [
          ...(opp.active ? [opp.active] : []),
          ...opp.bench,
        ];
        if (targets.length === 0) continue;
        for (let i = 0; i < e.times; i++) {
          const t = targets[Math.floor(Math.random() * targets.length)];
          t.damage += e.amount;
        }
      }
      // ── Discard self energy (typed) ──
      else if (e.kind === "discard-self-energy" && seat.active) {
        let removed = 0;
        seat.active.attachedEnergies = seat.active.attachedEnergies.filter(
          (en) => {
            if (en === e.energyType && removed < e.count) {
              removed++;
              return false;
            }
            return true;
          },
        );
      }
      // ── Discard self all energies ──
      else if (e.kind === "discard-self-all-energies" && seat.active) {
        seat.active.attachedEnergies = [];
      }
      // ── Discard opp energy random (avec ou sans coin flip) ──
      else if (e.kind === "discard-opp-energy-random") {
        if (e.conditional === "coin-flip") {
          const heads = this.coinFlip();
          this.emitCoinFlip(
            `${attackerName} — défausse`,
            heads,
            heads ? "1 énergie défaussée !" : "Pas de défausse.",
          );
          if (!heads) continue;
        }
        if (opp.active && opp.active.attachedEnergies.length > 0) {
          const i = Math.floor(
            Math.random() * opp.active.attachedEnergies.length,
          );
          opp.active.attachedEnergies.splice(i, 1);
        }
      }
      // ── Self attach energy ──
      else if (e.kind === "self-attach-energy" && seat.active) {
        seat.active.attachedEnergies.push(e.energyType);
      }
      // ── Bench attach energy ──
      else if (e.kind === "bench-attach-energy") {
        const candidates = seat.bench.filter((c) => {
          const d = getCardForBattle(c.cardId);
          return d?.type === e.benchType;
        });
        if (candidates.length > 0) {
          const t = candidates[Math.floor(Math.random() * candidates.length)];
          t.attachedEnergies.push(e.energyType);
        }
      }
      // ── Draw ──
      else if (e.kind === "draw") {
        for (let n = 0; n < e.count; n++) {
          const top = seat.deck.pop();
          if (!top) break;
          seat.hand.push(top);
        }
      }
      // ── Search typed pokemon to hand ──
      else if (e.kind === "search-typed-to-hand") {
        const candidates: number[] = [];
        for (let i = 0; i < seat.deck.length; i++) {
          const d = getCardForBattle(seat.deck[i].cardId);
          if (d?.type === e.type && d.stage === "basic") candidates.push(i);
        }
        if (candidates.length > 0) {
          const pick =
            candidates[Math.floor(Math.random() * candidates.length)];
          seat.hand.push(seat.deck.splice(pick, 1)[0]);
        }
      }
      // ── Search named pokemon to bench ──
      else if (e.kind === "search-named-to-bench") {
        if (seat.bench.length >= MAX_BENCH) continue;
        const candidates: number[] = [];
        for (let i = 0; i < seat.deck.length; i++) {
          const d = getCardForBattle(seat.deck[i].cardId);
          if (d?.name === e.name && d.stage === "basic") candidates.push(i);
        }
        if (candidates.length > 0) {
          const pick =
            candidates[Math.floor(Math.random() * candidates.length)];
          const card = seat.deck.splice(pick, 1)[0];
          seat.bench.push(this.makeBattleCard(card.cardId));
        }
      }
      // ── Force opp switch (Krakos Dégagement) ──
      // Identique à Morgane : on déplace l'Actif adverse dans son Banc et
      // on flag mustPromoteActive → l'adversaire doit choisir un nouveau
      // Actif. Le tour de l'attaquant est suspendu via requireOpponentReady
      // jusqu'à ce que l'adversaire ait choisi.
      else if (e.kind === "force-opp-switch") {
        if (opp.active && opp.bench.length > 0) {
          opp.bench.push(opp.active);
          opp.active = null;
          opp.mustPromoteActive = true;
        }
      }
      // ── Self swap (Abra Téléport : « Échangez ce Pokémon contre l'un
      //   de vos Pokémon de Banc. ») ──
      // Le texte officiel laisse le choix à l'attaquant. MVP : on
      // sélectionne le Banc avec le PLUS de PV restants (= meilleur
      // tank pour devenir Actif). Mieux qu'un random/index-0 et utile
      // dans le sens de l'attaque (téléporter l'Actif en danger).
      else if (e.kind === "self-swap") {
        if (seat.active && seat.bench.length > 0) {
          let bestIdx = 0;
          let bestRemaining = -Infinity;
          for (let i = 0; i < seat.bench.length; i++) {
            const c = seat.bench[i];
            const d = getCardForBattle(c.cardId);
            if (!d) continue;
            const remaining = d.hp - c.damage;
            if (remaining > bestRemaining) {
              bestRemaining = remaining;
              bestIdx = i;
            }
          }
          const newActive = seat.bench[bestIdx];
          seat.bench[bestIdx] = seat.active;
          seat.active = newActive;
        }
      }
      // ── Hand discard random (avec ou sans coin flip) ──
      else if (e.kind === "discard-opp-hand-random") {
        if (e.conditional === "coin-flip") {
          const heads = this.coinFlip();
          this.emitCoinFlip(
            `${attackerName} — défausse main`,
            heads,
            heads
              ? "1 carte défaussée de la main adverse !"
              : "Pas de défausse.",
          );
          if (!heads) continue;
        }
        if (opp.hand.length > 0) {
          const i = Math.floor(Math.random() * opp.hand.length);
          const removed = opp.hand.splice(i, 1)[0];
          opp.discard.push(removed);
        }
      }
      // ── No-supporter pour l'adversaire au prochain tour ──
      else if (e.kind === "no-supporter-opp-next-turn") {
        opp.nextTurnNoSupporter = true;
      }
      // ── Multi-coin attach to bench ──
      // Lance N pièces, attache 1 énergie par face aux Pokémon du Banc
      // d'un type donné. MVP : attache au hasard parmi les Banc qui
      // matchent (Pocket : « comme il vous plaît »).
      else if (e.kind === "multi-coin-attach-bench") {
        const candidates = seat.bench.filter((c) => {
          const d = getCardForBattle(c.cardId);
          return d?.type === e.benchType;
        });
        let heads = 0;
        for (let i = 0; i < e.coins; i++) {
          const isHead = this.coinFlip();
          this.emitCoinFlip(
            `${attackerName} — lancer`,
            isHead,
            undefined,
            i + 1,
            e.coins,
          );
          if (isHead) heads++;
        }
        for (let i = 0; i < heads && candidates.length > 0; i++) {
          const t =
            candidates[Math.floor(Math.random() * candidates.length)];
          t.attachedEnergies.push(e.energyType);
        }
      }
      // ── Flags "next turn" sur le DÉFENSEUR (l'Actif adverse) ─────────
      // On les pose avec un nextTurnFlagsTurn = ce tour + 1 (= le
      // prochain tour adverse). Les flags s'expirent à advanceTurn une
      // fois ce tour terminé (cf. clearExpiredNextTurnFlags).
      else if (e.kind === "defender-no-retreat-next-turn") {
        if (opp.active) {
          opp.active.noRetreatNextTurn = true;
          opp.active.nextTurnFlagsTurn = this.turnNumber + 1;
        }
      } else if (e.kind === "defender-no-attack-next-turn") {
        if (opp.active) {
          if (e.conditional === "coin-flip") {
            const heads = this.coinFlip();
            this.emitCoinFlip(
              `${attackerName} — paralyse`,
              heads,
              heads
                ? "Le Défenseur ne peut pas attaquer au prochain tour !"
                : "Pas d'effet.",
            );
            if (!heads) continue;
          }
          opp.active.noAttackNextTurn = true;
          opp.active.nextTurnFlagsTurn = this.turnNumber + 1;
        }
      } else if (e.kind === "defender-attack-penalty-next-turn") {
        if (opp.active) {
          opp.active.attackDamagePenaltyNextTurn = e.amount;
          opp.active.nextTurnFlagsTurn = this.turnNumber + 1;
        }
      }
      // ── Flags "next turn" sur SOI-MÊME (l'attaquant) ──
      else if (e.kind === "self-damage-reduction-next-turn") {
        if (seat.active) {
          seat.active.damageReductionNextTurn = e.amount;
          seat.active.nextTurnFlagsTurn = this.turnNumber + 1;
        }
      } else if (e.kind === "self-invulnerable-next-turn") {
        if (seat.active) {
          if (e.conditional === "coin-flip") {
            const heads = this.coinFlip();
            this.emitCoinFlip(
              `${attackerName} — invincibilité`,
              heads,
              heads
                ? `${attackerName} évite tous les dégâts au prochain tour !`
                : "Pas d'effet.",
            );
            if (!heads) continue;
          }
          seat.active.invulnerableNextTurn = true;
          seat.active.nextTurnFlagsTurn = this.turnNumber + 1;
        }
      }
      // ── Mélange Actif adverse au deck (avec coin flip) ─────────────
      else if (e.kind === "shuffle-opp-active-to-deck") {
        if (e.conditional === "coin-flip") {
          const heads = this.coinFlip();
          this.emitCoinFlip(
            `${attackerName}`,
            heads,
            heads
              ? "L'Actif adverse retourne dans son deck !"
              : "Pas d'effet.",
          );
          if (!heads) continue;
        }
        if (opp.active && opp.bench.length > 0) {
          // L'Actif (et toutes ses énergies) retourne dans le deck shuffled.
          // L'adversaire doit promouvoir un Banc → mustPromoteActive.
          opp.deck.push({ uid: opp.active.uid, cardId: opp.active.cardId });
          shuffle(opp.deck);
          opp.active = null;
          opp.mustPromoteActive = true;
        } else if (opp.active && opp.bench.length === 0) {
          // Pas de Banc → l'adversaire perd (plus de Pokémon en jeu).
          opp.deck.push({ uid: opp.active.uid, cardId: opp.active.cardId });
          shuffle(opp.deck);
          opp.active = null;
          this.declareWinner(seatId, "Adversaire n'a plus de Pokémon en jeu.");
        }
      }
    }
  }

  /** Clear les flags "prochain tour" qui ont expiré. Appelé à advanceTurn
   *  APRÈS l'incrément de turnNumber : un flag avec nextTurnFlagsTurn=T est
   *  actif pendant T, expiré à T+1. */
  private clearExpiredNextTurnFlags() {
    for (const sId of ["p1", "p2"] as BattleSeatId[]) {
      const s = this.seats[sId];
      if (!s) continue;
      const cards: BattleCard[] = [];
      if (s.active) cards.push(s.active);
      cards.push(...s.bench);
      for (const c of cards) {
        if (
          c.nextTurnFlagsTurn != null &&
          this.turnNumber > c.nextTurnFlagsTurn
        ) {
          delete c.noRetreatNextTurn;
          delete c.noAttackNextTurn;
          delete c.damageReductionNextTurn;
          delete c.attackDamagePenaltyNextTurn;
          delete c.invulnerableNextTurn;
          c.nextTurnFlagsTurn = null;
        }
      }
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
    if (!this.requireOpponentReady(seatId)) return;
    const seat = this.seats[seatId];
    if (!seat || seat.mustPromoteActive) return;
    const handCard = seat.hand[handIndex];
    if (!handCard) return;
    const card = getCard(handCard.cardId);
    if (!card || card.kind !== "trainer") {
      this.sendErrorToSeat(seatId, "Cette carte n'est pas un Dresseur.");
      return;
    }
    // Les Fossiles sont des cartes Dresseur de type Item, mais elles se
    // POSENT au Banc comme un Pokémon de Base (battle-play-basic), pas via
    // ce flow.
    if (FOSSIL_NAMES.has(card.name)) {
      this.sendErrorToSeat(
        seatId,
        "Pose ce Fossile au Banc — il joue comme un Pokémon de Base.",
      );
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
    // Flag « no-supporter ce tour » posé au tour précédent par une attaque
    // adverse.
    if (card.trainerType === "supporter" && seat.noSupporterThisTurn) {
      this.sendErrorToSeat(
        seatId,
        "Tu ne peux pas jouer de Supporter ce tour (effet du tour précédent).",
      );
      return;
    }
    // ── Talent passif Ectoplasma-ex « Maléfice des Ombres » ──
    // Tant qu'Ectoplasma-ex est Actif chez l'adversaire, on ne peut pas
    // jouer de carte Supporter.
    if (card.trainerType === "supporter") {
      const oppId: BattleSeatId = seatId === "p1" ? "p2" : "p1";
      const opp = this.seats[oppId];
      const oppActiveAbility = opp?.active
        ? getCardForBattle(opp.active.cardId)?.ability
        : null;
      if (
        oppActiveAbility?.kind === "passive" &&
        oppActiveAbility.name === "Maléfice des Ombres"
      ) {
        this.sendErrorToSeat(
          seatId,
          "Maléfice des Ombres : impossible de jouer un Supporter pendant qu'Ectoplasma-ex est Actif.",
        );
        return;
      }
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
        const tData = getCardForBattle(target.cardId);
        if (!tData || tData.type !== "grass") {
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
        const tData = getCardForBattle(target.cardId);
        const validNames = new Set(["Grolem", "Onix"]);
        if (!tData || !validNames.has(tData.name)) {
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
      case "Koga": {
        // Renvoie l'Actif (Grotadmorv ou Smogogo) en main et force la
        // promotion d'un Pokémon de Banc.
        if (!seat.active) {
          this.sendErrorToSeat(seatId, "Pas de Pokémon Actif.");
          return;
        }
        const activeData = getCardForBattle(seat.active.cardId);
        const validNames = new Set(["Grotadmorv", "Smogogo"]);
        if (!activeData || !validNames.has(activeData.name)) {
          this.sendErrorToSeat(
            seatId,
            "Koga ne ramène que Grotadmorv ou Smogogo.",
          );
          return;
        }
        if (seat.bench.length === 0) {
          this.sendErrorToSeat(
            seatId,
            "Tu n'as pas de Pokémon de Banc pour remplacer.",
          );
          return;
        }
        // Renvoie l'Actif (et ses dégâts/énergies/statuts disparaissent — Pocket).
        seat.hand.push({ uid: seat.active.uid, cardId: seat.active.cardId });
        seat.active = null;
        seat.mustPromoteActive = true;
        consumed = true;
        break;
      }
      case "Major Bob": {
        // Déplace TOUTES les Énergies {L} (lightning) du Banc vers Raichu /
        // Électrode / Élektek qui doit être Actif.
        if (!seat.active) {
          this.sendErrorToSeat(seatId, "Pas de Pokémon Actif.");
          return;
        }
        const activeData = getCardForBattle(seat.active.cardId);
        const validNames = new Set(["Raichu", "Électrode", "Élektek"]);
        if (!activeData || !validNames.has(activeData.name)) {
          this.sendErrorToSeat(
            seatId,
            "Major Bob ne s'utilise qu'avec Raichu, Électrode ou Élektek Actif.",
          );
          return;
        }
        let moved = 0;
        for (const benchCard of seat.bench) {
          const before = benchCard.attachedEnergies.length;
          benchCard.attachedEnergies = benchCard.attachedEnergies.filter(
            (e) => {
              if (e === "lightning") {
                seat.active!.attachedEnergies.push("lightning");
                return false;
              }
              return true;
            },
          );
          moved += before - benchCard.attachedEnergies.length;
        }
        if (moved === 0) {
          this.sendErrorToSeat(
            seatId,
            "Aucune Énergie ⚡ sur tes Pokémon de Banc.",
          );
          return;
        }
        consumed = true;
        break;
      }
      case "Morgane": {
        // « Échangez le Pokémon Actif de votre adversaire avec l'un de ses
        // Pokémon de Banc. (Votre adversaire choisit le nouveau Pokémon
        // Actif.) »
        // → On déplace l'Actif de l'adversaire dans son Banc et on flag
        //   `mustPromoteActive`. L'adversaire doit cliquer sur un Banc
        //   pour finaliser le swap. Pendant ce temps, le tour de l'attaquant
        //   est bloqué (vérifié dans tous les handlers d'action — voir
        //   `requireOpponentNotPromoting`).
        const opp = this.seats[oppId];
        if (!opp || !opp.active) {
          this.sendErrorToSeat(seatId, "Pas de cible.");
          return;
        }
        if (opp.bench.length === 0) {
          this.sendErrorToSeat(
            seatId,
            "L'adversaire n'a pas de Banc à promouvoir.",
          );
          return;
        }
        // L'Actif rejoint le Banc (avec ses dégâts/énergies/statuts), puis
        // l'adversaire doit choisir un nouveau Actif via handlePromoteActive.
        opp.bench.push(opp.active);
        opp.active = null;
        opp.mustPromoteActive = true;
        consumed = true;
        break;
      }
      case "Ondine": {
        // Choisis un Pokémon Eau, lance pile/face jusqu'à pile, attache 1
        // Énergie Eau par face. Animation : on émet 1 coin-flip par lancer
        // dans la queue côté client.
        if (!targetUid) {
          this.sendErrorToSeat(seatId, "Choisis un Pokémon Eau.");
          return;
        }
        const target = this.findOwnPokemon(seat, targetUid);
        if (!target) {
          this.sendErrorToSeat(seatId, "Cible invalide.");
          return;
        }
        const tData = getCardForBattle(target.cardId);
        if (!tData || tData.type !== "water") {
          this.sendErrorToSeat(
            seatId,
            "Ondine ne fonctionne qu'avec un Pokémon Eau.",
          );
          return;
        }
        let heads = 0;
        let flips = 0;
        // Cap raisonnable pour éviter une boucle pathologique (1/2 de pile à
        // chaque lancer, donc 20 = ~1 chance sur 1M).
        // Note : on garde un label STABLE (« Ondine ») pour que le récap
        // côté client groupe tous les flips ensemble. `total` reste undef
        // (flip-until-tails = nombre de flips inconnu d'avance).
        while (flips < 20) {
          flips++;
          const isHeads = this.coinFlip();
          if (isHeads) {
            heads++;
            target.attachedEnergies.push("water");
            this.emitCoinFlip(
              "Ondine",
              true,
              `+1 Énergie 💧 (total ${heads})`,
              flips,
            );
          } else {
            this.emitCoinFlip(
              "Ondine",
              false,
              heads === 0
                ? "Aucune Énergie attachée."
                : `Fin : ${heads} Énergie${heads > 1 ? "s" : ""} 💧 attachée${heads > 1 ? "s" : ""}.`,
              flips,
            );
            break;
          }
        }
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

  /** Active le talent (ability) d'un Pokémon en jeu. Switch sur le NOM du
   *  talent pour l'effet — propre car les talents apparaissent rarement en
   *  doublon entre cartes différentes. Validations communes : tour en cours,
   *  carte sur le board, talent activable, talent pas déjà utilisé ce tour
   *  par CETTE carte (uid). */
  private handleUseAbility(
    seatId: BattleSeatId,
    cardUid: string,
    targetUid: string | null,
  ) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    if (!this.requireOpponentReady(seatId)) return;
    const seat = this.seats[seatId];
    if (!seat || seat.mustPromoteActive) return;
    const card = this.findOwnPokemon(seat, cardUid);
    if (!card) {
      this.sendErrorToSeat(seatId, "Pokémon introuvable sur le board.");
      return;
    }
    const data = getCardForBattle(card.cardId);
    if (!data || !data.ability || data.ability.kind !== "activated") {
      this.sendErrorToSeat(seatId, "Ce Pokémon n'a pas de talent activable.");
      return;
    }
    if (seat.abilitiesUsedThisTurn.has(cardUid)) {
      this.sendErrorToSeat(
        seatId,
        "Le talent de ce Pokémon a déjà été utilisé ce tour.",
      );
      return;
    }

    const isActive = seat.active?.uid === cardUid;
    const oppId: BattleSeatId = seatId === "p1" ? "p2" : "p1";
    const opp = this.seats[oppId];
    if (!opp) return;
    const abilityName = data.ability.name;

    switch (abilityName) {
      case "Soin Poudre": {
        // Papilusion : soigne 20 dégâts de CHACUN de vos Pokémon.
        const all = [...(seat.active ? [seat.active] : []), ...seat.bench];
        let healed = 0;
        for (const p of all) {
          if (p.damage > 0) {
            p.damage = Math.max(0, p.damage - 20);
            healed++;
          }
        }
        if (healed === 0) {
          this.sendErrorToSeat(seatId, "Aucun Pokémon n'est blessé.");
          return;
        }
        break;
      }
      case "Piège Parfumé": {
        // Empiflor (Actif requis) : échange un Pokémon de Base du Banc adverse
        // contre son Actif. Cible = le bench Pokemon que l'adversaire VEUT
        // promouvoir → mais ici l'attaquant choisit. targetUid = le banc adverse
        // qui devient Actif.
        if (!isActive) {
          this.sendErrorToSeat(seatId, "Empiflor doit être Actif.");
          return;
        }
        if (!opp.active) {
          this.sendErrorToSeat(seatId, "L'adversaire n'a pas de Pokémon Actif.");
          return;
        }
        if (!targetUid) {
          this.sendErrorToSeat(
            seatId,
            "Choisis le Pokémon de Base du Banc adverse à promouvoir.",
          );
          return;
        }
        const idx = opp.bench.findIndex((c) => c.uid === targetUid);
        if (idx < 0) {
          this.sendErrorToSeat(seatId, "Cible invalide (doit être un Banc adverse).");
          return;
        }
        const tData = getCardForBattle(opp.bench[idx].cardId);
        if (!tData || tData.stage !== "basic") {
          this.sendErrorToSeat(
            seatId,
            "Piège Parfumé ne fonctionne que sur un Pokémon de Base.",
          );
          return;
        }
        // Swap.
        const newActive = opp.bench[idx];
        opp.bench[idx] = opp.active;
        opp.active = newActive;
        break;
      }
      case "Sheauriken": {
        // Amphinobi : inflige 20 dégâts à un Pokémon adverse au choix.
        if (!targetUid) {
          this.sendErrorToSeat(seatId, "Choisis un Pokémon adverse.");
          return;
        }
        const target =
          opp.active?.uid === targetUid
            ? opp.active
            : opp.bench.find((c) => c.uid === targetUid);
        if (!target) {
          this.sendErrorToSeat(seatId, "Cible invalide.");
          return;
        }
        target.damage += 20;
        // Vérifie KO.
        const tData = getCardForBattle(target.cardId);
        if (tData && target.damage >= tData.hp) {
          if (opp.active?.uid === target.uid) {
            this.knockOut(seatId, oppId);
          } else {
            // KO sur le Banc adverse — incrémente koCount sans déclencher promote.
            seat.koCount += 1;
            opp.bench = opp.bench.filter((c) => c.uid !== target.uid);
            opp.discard.push({
              uid: `disc-${this.uidCounter++}`,
              cardId: target.cardId,
            });
            if (seat.koCount >= KO_WIN_TARGET) {
              this.declareWinner(seatId, `${KO_WIN_TARGET} KO infligés.`);
              return;
            }
          }
        }
        break;
      }
      case "Charge Volt": {
        // Magnéton : attache une Énergie ⚡ à CE Pokémon.
        card.attachedEnergies.push("lightning");
        break;
      }
      case "Pendulo Dodo": {
        // Hypnomade : pile/face. Si face, Actif adverse Endormi.
        if (!opp.active) {
          this.sendErrorToSeat(seatId, "Pas de cible.");
          return;
        }
        const heads = this.coinFlip();
        this.emitCoinFlip(
          `${data.name} — Pendulo Dodo`,
          heads,
          heads ? "Adversaire Endormi !" : "Pas d'effet.",
        );
        if (heads && !opp.active.statuses.includes("asleep")) {
          opp.active.statuses.push("asleep");
        }
        break;
      }
      case "Ombre Psy": {
        // Gardevoir : attache une Énergie 🌀 au Pokémon Psy Actif.
        if (!seat.active) {
          this.sendErrorToSeat(seatId, "Pas de Pokémon Actif.");
          return;
        }
        const activeData = getCardForBattle(seat.active.cardId);
        if (activeData?.type !== "psychic") {
          this.sendErrorToSeat(
            seatId,
            "Ombre Psy ne s'utilise que si l'Actif est de type Psy.",
          );
          return;
        }
        seat.active.attachedEnergies.push("psychic");
        break;
      }
      case "Fuite de Gaz": {
        // Smogogo (Actif requis) : Actif adverse Empoisonné.
        if (!isActive) {
          this.sendErrorToSeat(seatId, "Smogogo doit être Actif.");
          return;
        }
        if (!opp.active) {
          this.sendErrorToSeat(seatId, "Pas de cible.");
          return;
        }
        if (!opp.active.statuses.includes("poisoned")) {
          opp.active.statuses.push("poisoned");
        }
        break;
      }
      case "Déroute": {
        // Roucarnage : force l'adversaire à choisir un nouvel Actif (comme
        // Morgane). On déplace l'Actif adverse au Banc et on flag mustPromoteActive.
        if (!opp.active) {
          this.sendErrorToSeat(seatId, "Pas de cible.");
          return;
        }
        if (opp.bench.length === 0) {
          this.sendErrorToSeat(
            seatId,
            "L'adversaire n'a pas de Banc à promouvoir.",
          );
          return;
        }
        opp.bench.push(opp.active);
        opp.active = null;
        opp.mustPromoteActive = true;
        break;
      }
      case "Numérisation": {
        // Porygon : peek top deck. Privé au joueur.
        const top = seat.deck[seat.deck.length - 1];
        if (!top) {
          this.sendErrorToSeat(seatId, "Plus de cartes à regarder.");
          return;
        }
        if (seat.conn) {
          this.sendTo(seat.conn, {
            type: "battle-trainer-reveal",
            trainerName: "Numérisation",
            cardIds: [top.cardId],
          });
        }
        break;
      }
      default: {
        this.sendErrorToSeat(
          seatId,
          `Talent « ${abilityName} » non implémenté.`,
        );
        return;
      }
    }

    // Marque le talent comme utilisé pour cette carte ce tour + log + broadcast.
    seat.abilitiesUsedThisTurn.add(cardUid);
    this.pushLog(`${data.name} utilise son Talent « ${abilityName} ».`);
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
        const data = getCardForBattle(s.active.cardId);
        if (data && s.active.damage >= data.hp) {
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
    seat.abilitiesUsedThisTurn = new Set();
    // Le flag "no Supporter ce tour" était actif PENDANT ce tour qui se
    // termine — on le clear maintenant. Si l'adversaire en a posé un pour
    // CE tour-ci (déjà transféré), on est OK.
    seat.noSupporterThisTurn = false;
    // Pocket : énergie pending non attachée est perdue à end-of-turn.
    seat.pendingEnergy = null;

    const next: BattleSeatId = seatId === "p1" ? "p2" : "p1";
    this.activeSeat = next;
    this.turnNumber++;
    // Clear les flags "prochain tour" qui ont expiré (turnNumber > flagTurn).
    this.clearExpiredNextTurnFlags();
    // Bascule le flag « no Supporter au prochain tour » (posé par l'attaque
    // adverse au tour précédent) sur le joueur entrant : il s'applique
    // maintenant à son tour qui démarre.
    const nextSeatRef = this.seats[next];
    if (nextSeatRef && nextSeatRef.nextTurnNoSupporter) {
      nextSeatRef.noSupporterThisTurn = true;
      nextSeatRef.nextTurnNoSupporter = false;
    }
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
    // Arme le timer anti-AFK pour le nouveau joueur actif.
    this.armIdleTimer(next);
    this.broadcastState();
  }

  private handleEndTurn(seatId: BattleSeatId) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    if (!this.requireOpponentReady(seatId)) return;
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

  /** Arme le timer anti-AFK pour le joueur actif. Si pas d'action en
   *  3 minutes, auto-concede. Bot mode skip (le bot peut être lent). */
  private armIdleTimer(activeSeat: BattleSeatId) {
    if (this.idleTimerHandle) clearTimeout(this.idleTimerHandle);
    if (this.botMode) return;
    this.idleTimerHandle = setTimeout(() => {
      if (this.phase !== "playing") return;
      if (this.activeSeat !== activeSeat) return;
      this.pushLog(
        `⏰ ${this.seats[activeSeat]?.username ?? "Joueur"} inactif depuis 3 minutes — auto-concède.`,
      );
      this.handleConcede(activeSeat);
    }, this.idleTimeoutMs);
  }

  private declareWinner(winner: BattleSeatId, reason: string) {
    this.phase = "ended";
    this.winner = winner;
    if (this.idleTimerHandle) {
      clearTimeout(this.idleTimerHandle);
      this.idleTimerHandle = null;
    }
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
        .then(async (res) => {
          if (res && ranked) {
            this.pushLog(
              `📊 ELO — ${w.username} ${res.winner_elo_before}→${res.winner_elo_after} · ${l.username} ${res.loser_elo_before}→${res.loser_elo_after}.`,
            );
            this.broadcastState();
          }
          // Vérifie les achievements pour les DEUX joueurs (le perdant
          // peut débloquer « 1er match », « 50 matches », etc.).
          await this.checkAndUnlockAchievements(w.authId, gameId, w.username);
          await this.checkAndUnlockAchievements(l.authId, gameId, l.username);
        })
        .catch(() => {});
      // Persiste le replay (log textuel) — best effort, async.
      void savePokemonReplay(this.room, {
        gameId,
        winnerId: w.authId,
        loserId: l.authId,
        winnerUsername: w.username,
        loserUsername: l.username,
        winnerDeckName: w.deckName,
        loserDeckName: l.deckName,
        ranked,
        durationSeconds: Math.round(
          (Date.now() - this.startedAt) / 1000,
        ),
        log: this.replayLog,
      }).catch(() => {});
    }
  }

  /** Récupère les agrégats du joueur depuis Supabase et vérifie chaque
   *  achievement du catalogue. Pour ceux dont la condition est remplie,
   *  appelle try_unlock_achievement (idempotent). Si nouvellement
   *  débloqué, log dans la partie. */
  private async checkAndUnlockAchievements(
    userId: string,
    gameId: string,
    username: string,
  ) {
    const aggregates = await fetchBattleAggregates(this.room, userId, gameId);
    if (!aggregates) return;
    for (const ach of TCG_ACHIEVEMENTS) {
      // Filter par gameId si l'achievement est game-specific.
      if (ach.gameId && ach.gameId !== gameId) continue;
      if (!ach.check(aggregates)) continue;
      try {
        const newlyUnlocked = await tryUnlockAchievement(
          this.room,
          userId,
          gameId,
          ach.id,
        );
        if (newlyUnlocked) {
          this.pushLog(
            `🏅 ${username} débloque « ${ach.name} » ${ach.icon}`,
          );
          this.broadcastState();
          // Toast privé au siège du joueur qui vient d'unlock.
          const targetSeat: BattleSeatId | null =
            this.seats.p1?.authId === userId
              ? "p1"
              : this.seats.p2?.authId === userId
                ? "p2"
                : null;
          if (targetSeat) {
            const conn = this.seats[targetSeat]?.conn;
            if (conn) {
              this.sendTo(conn, {
                type: "battle-achievement-unlocked",
                id: ach.id,
                name: ach.name,
                description: ach.description,
                icon: ach.icon,
                tier: ach.tier,
              });
            }
          }
        }
      } catch {
        // best-effort, on ignore les erreurs réseau
      }
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
    // replayLog non capé pour la persistance fin de match.
    this.replayLog.push(line);
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
      abilitiesUsedThisTurn: [...seat.abilitiesUsedThisTurn],
      noSupporterThisTurn: seat.noSupporterThisTurn,
      pendingEnergy: seat.pendingEnergy,
    };
  }

  private snapshotSelf(seat: SeatState | null): BattleSelfState | null {
    const pub = this.snapshotPublic(seat);
    if (!pub || !seat) return null;
    return {
      ...pub,
      hand: seat.hand.map((c) => ({ uid: c.uid, cardId: c.cardId })),
    };
  }

  private snapshotForSeat(seatId: BattleSeatId | null): BattleState {
    const selfSeat = seatId ? this.seats[seatId] : null;
    const opponentSeatId: BattleSeatId | null =
      seatId === "p1" ? "p2" : seatId === "p2" ? "p1" : null;
    const opponentSeat = opponentSeatId ? this.seats[opponentSeatId] : null;
    // Mode spectateur (seatId null) : on montre p1 dans `self` (en mode
    // public, pas de hand révélée) et p2 dans `opponent`. Ça permet au
    // client existant de tout afficher sans modification.
    if (seatId === null) {
      const p1Seat = this.seats.p1;
      const p2Seat = this.seats.p2;
      return {
        roomId: this.room.id,
        phase: this.phase,
        self: p1Seat ? (this.snapshotPublic(p1Seat) as never) : null,
        opponent: this.snapshotPublic(p2Seat),
        selfSeat: null,
        activeSeat: this.activeSeat,
        turnNumber: this.turnNumber,
        winner: this.winner,
        log: [...this.log],
      };
    }
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
