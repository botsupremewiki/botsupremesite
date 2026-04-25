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
} from "../../shared/types";
import { fetchProfile, fetchTcgDeckById } from "./lib/supabase";
import type {
  PokemonAbilityEffect,
} from "../../shared/types";
import {
  type DeckCard,
  dealOpeningHand,
  expandDeck,
  getCard,
  isBasicPokemon,
  isEnergy,
  shuffle,
  takePrizes,
} from "./lib/battle-engine";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRIZE_COUNT = 6;
const MAX_BENCH = 5;
const LOG_KEEP = 30;

type SeatState = {
  authId: string;
  username: string;
  conn: Party.Connection | null;
  deck: DeckCard[];
  hand: DeckCard[];
  prizes: DeckCard[];
  discard: DeckCard[];
  active: BattleCard | null;
  bench: BattleCard[];
  hasSetup: boolean;
  // Limites par tour de jeu (reset à end-turn).
  energyAttachedThisTurn: boolean;
  hasRetreatedThisTurn: boolean;
  evolvedThisTurn: Set<string>; // uids
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

  constructor(readonly room: Party.Room) {}

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

    if (!this.seats[seatId]) {
      // Première connexion sur ce siège : load deck depuis la DB.
      const deckRow = await fetchTcgDeckById(this.room, deckId);
      if (!deckRow) {
        this.sendError(conn, "Deck introuvable.");
        conn.close();
        return;
      }
      const total = (deckRow.cards ?? []).reduce((s, c) => s + c.count, 0);
      if (total !== 60) {
        this.sendError(
          conn,
          `Deck invalide (${total}/60 cartes).`,
        );
        conn.close();
        return;
      }
      const deck = expandDeck(
        (deckRow.cards ?? []).map((c) => ({
          cardId: c.card_id,
          count: c.count,
        })),
      );
      shuffle(deck);
      const { hand, mulligans } = dealOpeningHand(deck);
      const prizes = takePrizes(deck, PRIZE_COUNT);
      this.seats[seatId] = {
        authId,
        username,
        conn,
        deck,
        hand,
        prizes,
        discard: [],
        active: null,
        bench: [],
        hasSetup: false,
        energyAttachedThisTurn: false,
        hasRetreatedThisTurn: false,
        evolvedThisTurn: new Set(),
        mustPromoteActive: false,
      };
      this.connToSeat.set(conn.id, seatId);

      if (mulligans > 0) {
        this.pushLog(
          `${username} mulligan ×${mulligans} (aucun Pokémon de Base au départ).`,
        );
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
      this.pushLog("Les deux joueurs sont là. Choisissez votre Pokémon Actif.");
    }
    this.broadcastState();
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
        this.handleAttachEnergy(seatId, data.handIndex, data.targetUid);
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
      this.sendErrorToSeat(seatId, "Banc complet (5 max).");
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
    this.pushLog(`${seat.username} a placé son Actif et son Banc.`);
    this.broadcastState();

    // Si les deux ont confirmé → coin flip et début de la partie.
    if (this.seats.p1?.hasSetup && this.seats.p2?.hasSetup) {
      const first: BattleSeatId = Math.random() < 0.5 ? "p1" : "p2";
      this.activeSeat = first;
      this.phase = "playing";
      this.turnNumber = 1;
      const name = this.seats[first]!.username;
      this.pushLog(`Pile/Face : ${name} commence !`);
      this.broadcastState();
    }
  }

  // ─────────────── playing-phase actions ───────────────

  /** Pose un Pokémon de Base de la main au Banc en main phase. */
  private handlePlayBasic(seatId: BattleSeatId, handIndex: number) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    const seat = this.seats[seatId];
    if (!seat || seat.mustPromoteActive) return;
    if (seat.bench.length >= MAX_BENCH) {
      this.sendErrorToSeat(seatId, "Banc complet (5 max).");
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

  /** Attache une carte Énergie de la main à un Pokémon (Actif ou Banc). */
  private handleAttachEnergy(
    seatId: BattleSeatId,
    handIndex: number,
    targetUid: string,
  ) {
    if (this.phase !== "playing") return;
    if (this.activeSeat !== seatId) return;
    const seat = this.seats[seatId];
    if (!seat || seat.mustPromoteActive) return;
    const card = seat.hand[handIndex];
    if (!card || !isEnergy(card.cardId)) {
      this.sendErrorToSeat(seatId, "Cette carte n'est pas une Énergie.");
      return;
    }
    const target = this.findOwnPokemon(seat, targetUid);
    if (!target) {
      this.sendErrorToSeat(seatId, "Cible invalide.");
      return;
    }
    // Rain Dance (Tortank) : Eau → Pokémon Eau bypasse la limite 1/tour.
    const energyData = getCard(card.cardId);
    const targetData = getCard(target.cardId);
    const isWaterToWater =
      energyData?.kind === "energy" &&
      energyData.energyType === "water" &&
      targetData?.kind === "pokemon" &&
      targetData.type === "water" &&
      this.findAbility(seat, "rain-dance") !== null;
    if (seat.energyAttachedThisTurn && !isWaterToWater) {
      this.sendErrorToSeat(seatId, "Une seule Énergie peut être attachée par tour.");
      return;
    }
    seat.hand.splice(handIndex, 1);
    target.attachedEnergies.push(card.cardId);
    if (!isWaterToWater) seat.energyAttachedThisTurn = true;
    this.pushLog(
      `${seat.username} attache ${energyData?.name ?? "Énergie"} à ${
        targetData?.kind === "pokemon" ? targetData.name : "Pokémon"
      }${isWaterToWater ? " (Danse Pluie)" : ""}.`,
    );
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
    // on retire les conditions de statut (règle officielle).
    seat.hand.splice(handIndex, 1);
    target.cardId = handCard.cardId;
    target.statuses = [];
    seat.evolvedThisTurn.add(target.uid);
    this.pushLog(
      `${seat.username} évolue ${targetData.name} en ${evoData.name}.`,
    );
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
    const cost = data.retreatCost;
    if (seat.active.attachedEnergies.length < cost) {
      this.sendErrorToSeat(
        seatId,
        `Pas assez d'Énergies pour battre en retraite (${cost} requises).`,
      );
      return;
    }
    // Discard `cost` énergies (les plus anciennes en tête).
    const discarded = seat.active.attachedEnergies.splice(0, cost);
    for (const energyId of discarded) {
      seat.discard.push({ uid: `disc-${this.uidCounter++}`, cardId: energyId });
    }
    // Swap.
    const old = seat.active;
    seat.active = newActive;
    seat.bench.splice(benchIndex, 1);
    seat.bench.push(old);
    seat.hasRetreatedThisTurn = true;
    this.pushLog(
      `${seat.username} bat en retraite (${cost} Énergie(s) défaussée(s)).`,
    );
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
    if (!this.canPayAttackCost(seat.active.attachedEnergies, attack.cost, seat.active)) {
      this.sendErrorToSeat(seatId, "Coût en Énergies non payé.");
      return;
    }

    // Confusion : pile/face avant l'attaque. Face = attaque foire +
    // 30 dégâts à soi (pas de faiblesse/résistance pour ces dégâts).
    if (seat.active.statuses.includes("confused")) {
      const heads = this.coinFlip();
      this.pushLog(
        `${seat.username} (${attackerData.name}) Confus → pile/face : ${
          heads ? "Face" : "Pile"
        }.`,
      );
      if (!heads) {
        seat.active.damage += 30;
        this.pushLog(
          `💢 ${attackerData.name} se fait 30 dégâts (Confus).`,
        );
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
    if (
      defenderData.weakness &&
      defenderData.weakness === attackerData.type
    ) {
      damage *= 2;
    }
    if (
      defenderData.resistance &&
      defenderData.resistance === attackerData.type
    ) {
      damage = Math.max(0, damage - 30);
    }

    // ─── Abilities défensives sur le défenseur ───
    const defAbility = this.getAbilityEffect(opp.active);
    // Sans Garde (Ronflex) : si Endormi, ignore tous les dégâts.
    if (
      defAbility?.kind === "asleep-immunity" &&
      opp.active.statuses.includes("asleep") &&
      damage > 0
    ) {
      this.pushLog(
        `🛡️ ${defenderData.name} ignore les dégâts (Sans Garde).`,
      );
      damage = 0;
    }
    // Mur de Lumière (M. Mime) : ignore les dégâts ≥ threshold.
    if (
      defAbility?.kind === "damage-cap" &&
      damage >= defAbility.threshold
    ) {
      this.pushLog(
        `🛡️ ${defenderData.name} ignore les dégâts ≥ ${defAbility.threshold} (Mur de Lumière).`,
      );
      damage = 0;
    }
    // Esquive Neutre (Mew) : si attaquant évolué, coin/face ignore.
    if (
      defAbility?.kind === "evolved-attacker-coin" &&
      attackerData.stage !== "basic" &&
      damage > 0
    ) {
      const flip = this.coinFlip();
      this.pushLog(
        `🍃 Esquive Neutre — ${flip ? "Face" : "Pile"}.`,
      );
      if (!flip) {
        // Pile (tails) → dégâts ignorés
        damage = 0;
        this.pushLog(`🛡️ ${defenderData.name} esquive l'attaque.`);
      }
    }

    opp.active.damage += damage;

    this.pushLog(
      `${seat.username} (${attackerData.name}) attaque avec ${attack.name}` +
        (damage > 0 ? ` — ${damage} dégâts` : "") +
        (attack.text ? ` · ${attack.text}` : ""),
    );

    // Riposte (Mackogneur) : si dégâts effectivement reçus, contre-attaque.
    if (damage > 0 && defAbility?.kind === "counter-attack" && seat.active) {
      seat.active.damage += defAbility.amount;
      this.pushLog(
        `💢 Riposte — ${attackerData.name} subit ${defAbility.amount} dégâts.`,
      );
    }

    // Effets structurés de l'attaque (status, self-damage, discard, heal).
    if (attack.effects) {
      this.applyAttackEffects(seatId, oppId, attack.effects);
    }

    // Spores de Pollen (Rafflesia) : après chaque attaque, coin face → endormi.
    const attackerAbility = this.getAbilityEffect(seat.active);
    if (
      attackerAbility?.kind === "post-attack-status-coin" &&
      opp.active
    ) {
      const flip = this.coinFlip();
      this.pushLog(
        `🌺 ${attackerData.name} — ${flip ? "Face" : "Pile"} (Spores).`,
      );
      if (flip) {
        this.applyStatus(opp.active, attackerAbility.status);
        this.pushLog(
          `${defenderData.name} est ${statusLabel(attackerAbility.status)}.`,
        );
      }
    }

    // Vérif KO sur le défenseur (puis sur l'attaquant si self-damage / riposte).
    if (opp.active && opp.active.damage >= defenderData.hp) {
      this.knockOut(seatId, oppId);
    }
    if (
      this.phase === "playing" &&
      seat.active &&
      seat.active.damage >= attackerData.hp
    ) {
      this.knockOut(oppId, seatId);
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

  // ─────────────── ability helpers ───────────────

  /** Retourne l'effect d'ability d'un BattleCard si la carte sous-jacente
   *  en a une avec un effet machine-readable, sinon null. */
  private getAbilityEffect(
    card: BattleCard | null | undefined,
  ): PokemonAbilityEffect | null {
    if (!card) return null;
    const data = getCard(card.cardId);
    if (data?.kind !== "pokemon") return null;
    return data.ability?.effect ?? null;
  }

  /** Cherche une ability d'un kind donné parmi les Pokémon d'un siège.
   *  `slot` filtre où chercher : 'active', 'bench' ou 'any'. */
  private findAbility(
    seat: SeatState,
    kind: PokemonAbilityEffect["kind"],
    slot: "active" | "bench" | "any" = "any",
  ): { card: BattleCard; effect: PokemonAbilityEffect } | null {
    const candidates: BattleCard[] = [];
    if (slot !== "bench" && seat.active) candidates.push(seat.active);
    if (slot !== "active") candidates.push(...seat.bench);
    for (const c of candidates) {
      const eff = this.getAbilityEffect(c);
      if (eff && eff.kind === kind) return { card: c, effect: eff };
    }
    return null;
  }

  /** Applique chaque AttackEffect après les dégâts de base. */
  private applyAttackEffects(
    attackerSeatId: BattleSeatId,
    defenderSeatId: BattleSeatId,
    effects: import("../../shared/types").PokemonAttackEffect[],
  ) {
    const att = this.seats[attackerSeatId];
    const def = this.seats[defenderSeatId];
    if (!att || !def) return;
    for (const effect of effects) {
      switch (effect.kind) {
        case "apply-status": {
          const targetCard =
            effect.target === "self" ? att.active : def.active;
          const targetSeat =
            effect.target === "self" ? att : def;
          if (!targetCard) break;
          if (effect.coin) {
            const heads = this.coinFlip();
            const wantHeads = effect.coin === "heads";
            this.pushLog(
              `Pile/Face pour ${effect.status} : ${heads ? "Face" : "Pile"}.`,
            );
            if (heads !== wantHeads) break;
          }
          this.applyStatus(targetCard, effect.status);
          this.pushLog(
            `${targetSeat.username}'s ${getCardName(targetCard.cardId)} est ${statusLabel(effect.status)}.`,
          );
          break;
        }
        case "self-damage": {
          if (!att.active) break;
          if (effect.coin) {
            const heads = this.coinFlip();
            const wantHeads = effect.coin === "heads";
            this.pushLog(
              `Pile/Face pour récul : ${heads ? "Face" : "Pile"}.`,
            );
            if (heads !== wantHeads) break;
          }
          att.active.damage += effect.amount;
          this.pushLog(
            `💢 ${getCardName(att.active.cardId)} se fait ${effect.amount} dégâts.`,
          );
          break;
        }
        case "discard-energy": {
          if (!att.active) break;
          const n = Math.min(effect.count, att.active.attachedEnergies.length);
          const removed = att.active.attachedEnergies.splice(0, n);
          for (const eId of removed) {
            att.discard.push({
              uid: `disc-${this.uidCounter++}`,
              cardId: eId,
            });
          }
          this.pushLog(`${att.username} défausse ${n} Énergie(s).`);
          break;
        }
        case "heal": {
          if (!att.active) break;
          const before = att.active.damage;
          att.active.damage = Math.max(0, before - effect.amount);
          const healed = before - att.active.damage;
          if (healed > 0) {
            this.pushLog(
              `💚 ${getCardName(att.active.cardId)} récupère ${healed} PV.`,
            );
          }
          break;
        }
      }
    }
  }

  /** Applique un statut à un BattleCard, en respectant l'exclusion mutuelle
   *  asleep/paralyzed/confused (poison se cumule). */
  private applyStatus(
    card: BattleCard,
    status: import("../../shared/types").BattleStatus,
  ) {
    const exclusive = ["asleep", "paralyzed", "confused"];
    if (exclusive.includes(status)) {
      card.statuses = card.statuses.filter((s) => !exclusive.includes(s));
    }
    if (!card.statuses.includes(status)) card.statuses.push(status);
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
    const data = getCard(promote.cardId);
    this.pushLog(
      `${seat.username} promeut ${data?.kind === "pokemon" ? data.name : "?"} comme nouvel Actif.`,
    );
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
   *  Avec Energy Burn (Dracaufeu), toute Énergie attachée compte comme Feu. */
  private canPayAttackCost(
    attached: string[],
    cost: import("../../shared/types").PokemonEnergyType[],
    attacker: BattleCard | null = null,
  ): boolean {
    const energyBurn = this.getAbilityEffect(attacker)?.kind === "energy-burn";
    // Pool d'énergies par type effectif.
    const pool = new Map<string, number>();
    for (const energyId of attached) {
      const data = getCard(energyId);
      if (data?.kind !== "energy") continue;
      const effectiveType = energyBurn ? "fire" : data.energyType;
      pool.set(effectiveType, (pool.get(effectiveType) ?? 0) + 1);
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
    const koData = getCard(def.active.cardId);
    this.pushLog(
      `💥 ${koData?.kind === "pokemon" ? koData.name : "?"} est mis K.O. !`,
    );
    // Discard l'Actif + ses énergies attachées.
    def.discard.push({
      uid: `disc-${this.uidCounter++}`,
      cardId: def.active.cardId,
    });
    for (const energyId of def.active.attachedEnergies) {
      def.discard.push({
        uid: `disc-${this.uidCounter++}`,
        cardId: energyId,
      });
    }
    def.active = null;

    // Attaquant prend une carte de Prize (silencieusement passe en main).
    const prize = att.prizes.pop();
    if (prize) {
      att.hand.push(prize);
      this.pushLog(`${att.username} prend une carte de Prize.`);
    }

    // Conditions de victoire.
    if (att.prizes.length === 0) {
      this.declareWinner(attackerSeatId, "Toutes les Prizes prises.");
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
    // Sombre Rêve (Ectoplasma sur Banc + Actif adverse Endormi → 10 dmg).
    for (const sId of ["p1", "p2"] as BattleSeatId[]) {
      const s = this.seats[sId];
      if (!s) continue;
      const aura = this.findAbility(s, "bench-aura-asleep", "bench");
      if (!aura) continue;
      const oppId: BattleSeatId = sId === "p1" ? "p2" : "p1";
      const opp = this.seats[oppId];
      if (!opp?.active) continue;
      if (!opp.active.statuses.includes("asleep")) continue;
      const amount =
        aura.effect.kind === "bench-aura-asleep" ? aura.effect.amount : 0;
      opp.active.damage += amount;
      this.pushLog(
        `👻 Sombre Rêve — ${opp.username}'s ${getCardName(opp.active.cardId)} subit ${amount} dégâts.`,
      );
      const oppData = getCard(opp.active.cardId);
      if (oppData?.kind === "pokemon" && opp.active.damage >= oppData.hp) {
        this.knockOut(sId, oppId);
        if (this.phase === "ended") {
          this.broadcastState();
          return;
        }
      }
    }

    // Poison : 10 dégâts à chaque Actif empoisonné (les deux côtés).
    for (const sId of ["p1", "p2"] as BattleSeatId[]) {
      const s = this.seats[sId];
      if (!s?.active) continue;
      if (s.active.statuses.includes("poisoned")) {
        s.active.damage += 10;
        this.pushLog(
          `☠️ ${s.username}'s ${getCardName(s.active.cardId)} subit 10 dégâts (Empoisonné).`,
        );
        const data = getCard(s.active.cardId);
        if (data?.kind === "pokemon" && s.active.damage >= data.hp) {
          // KO inter-tours — l'autre joueur prend une prize.
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
    if (seat.active && seat.active.statuses.includes("asleep")) {
      const heads = this.coinFlip();
      this.pushLog(
        `💤 ${getCardName(seat.active.cardId)} → réveil ? ${heads ? "Face (réveille)" : "Pile (toujours endormi)"}.`,
      );
      if (heads) {
        seat.active.statuses = seat.active.statuses.filter(
          (s) => s !== "asleep",
        );
      }
    }

    // Paralysie : retirée à la fin du tour du joueur paralysé (i.e. après
    // un tour complet d'inaction). On le fait sur l'Actif du joueur dont
    // c'est le tour qui se termine.
    if (seat.active && seat.active.statuses.includes("paralyzed")) {
      seat.active.statuses = seat.active.statuses.filter(
        (s) => s !== "paralyzed",
      );
      this.pushLog(
        `⚡ ${getCardName(seat.active.cardId)} n'est plus Paralysé.`,
      );
    }

    // Reset des flags de tour pour le joueur actif.
    for (const c of [seat.active, ...seat.bench]) {
      if (c) c.playedThisTurn = false;
    }
    seat.energyAttachedThisTurn = false;
    seat.hasRetreatedThisTurn = false;
    seat.evolvedThisTurn = new Set();

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
    }
    this.pushLog(`Tour ${this.turnNumber} — ${nextSeat?.username} joue.`);
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
      prizesRemaining: seat.prizes.length,
      hasSetup: seat.hasSetup,
      mustPromoteActive: seat.mustPromoteActive,
      energyAttachedThisTurn: seat.energyAttachedThisTurn,
      hasRetreatedThisTurn: seat.hasRetreatedThisTurn,
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
