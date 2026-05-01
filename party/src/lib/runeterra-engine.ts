// Moteur de combat Legends of Runeterra — Phase 3.1 (skeleton).
//
// Pure-fonctionnel : pas de state, retourne toujours un nouvel état.
// Réutilisable côté serveur PartyKit ET côté client pour validation locale.
//
// Phase 3.1 (ce fichier) : types internes, deck building, mulligan,
// transitions de round, pioche, ressources (mana / spell mana / attack
// token). PAS encore : combat, spells, keywords, level-up champions.

import type {
  ImbueEffect,
  LastBreathEffect,
  RuneterraBattlePhase,
  RuneterraBattleState,
  RuneterraBattleUnit,
  RuneterraCardData,
  RuneterraPlayerPublicState,
  RuneterraSelfState,
  SpellEffect,
} from "../../../shared/types";
import {
  RUNETERRA_ATTACK_EFFECTS,
  RUNETERRA_BATTLE_CONFIG,
  RUNETERRA_DISCARD_EFFECTS,
  RUNETERRA_IMBUE_EFFECTS,
  RUNETERRA_LAST_BREATH_EFFECTS,
  RUNETERRA_NEXUS_STRIKE_EFFECTS,
  RUNETERRA_PLAY_EFFECTS,
  RUNETERRA_SPELL_EFFECTS,
  RUNETERRA_SUPPORT_EFFECTS,
  getSpellTargetCount,
  getSpellTargetSide,
} from "../../../shared/types";
import { RUNETERRA_BASE_SET_BY_CODE } from "../../../shared/tcg-runeterra-base";

/** Une carte de deck encapsulée (uid unique pour l'instance, cardCode pour
 *  remonter aux données riches via le set). */
export type DeckCard = {
  uid: string;
  cardCode: string;
};

/** Une lane d'attaque : 1 attaquant + 0 ou 1 bloqueur. Phase 3.18 :
 *  forcedBlockerUid optionnel (Challenger force un bloqueur spécifique). */
export type AttackLane = {
  attackerUid: string;
  blockerUid: string | null;
  forcedBlockerUid?: string | null;
};

/** État interne complet (serveur). Le serveur projette ensuite vers
 *  RuneterraBattleState pour chaque destinataire (self/opponent). */
export type InternalState = {
  roomId: string;
  phase: RuneterraBattlePhase;
  players: [InternalPlayer, InternalPlayer]; // index = seat (0 = p1, 1 = p2)
  activeSeatIdx: 0 | 1; // qui a la priorité ce round
  attackTokenSeatIdx: 0 | 1; // qui a le jeton d'attaque ce round
  round: number;
  // Compteur de passes consécutives : 2 passes d'affilée = round termine.
  // Reset à 0 dès qu'une action non-pass est jouée (unit, spell, attaque).
  consecutivePasses: number;
  // null = pas d'attaque en cours. Sinon, l'attaquant a déclaré ses unités
  // et le défenseur doit assigner des bloqueurs (ou laisser passer au
  // nexus). Phase 3.3 : résolution simultanée immédiate après assignBlockers
  // (pas encore de spell stack pendant l'attaque — Phase 3.4).
  attackInProgress: {
    attackerSeatIdx: 0 | 1;
    lanes: AttackLane[];
  } | null;
  winnerSeatIdx: 0 | 1 | null;
  log: string[];
};

/** Discriminé : réducteurs d'action retournent ok=false + raison si l'action
 *  est invalide (mana insuffisant, pas ton tour, hand index invalide, etc.). */
export type EngineResult =
  | { ok: true; state: InternalState }
  | { ok: false; error: string };

export type InternalPlayer = {
  authId: string;
  username: string;
  deck: DeckCard[];
  hand: DeckCard[];
  bench: RuneterraBattleUnit[];
  mana: number;
  manaMax: number;
  spellMana: number;
  nexusHealth: number;
  attackToken: boolean;
  hasMulliganed: boolean;
  // Phase 3.34 : compteur de morts d'alliés DANS ce round (reset à chaque
  // startRound). Sert aux sorts conditionnels « si un allié est mort... ».
  alliesDiedThisRound: number;
  // Phase 3.51 : liste des alliés morts CE round (uid + cardCode).
  // Reset à chaque startRound. Sert pour 01SI046 (revive random dead).
  deadAlliesThisRound: { uid: string; cardCode: string }[];
  // Phase 3.60 : liste des alliés morts CETTE PARTIE (cumulé, never reset).
  // Sert pour 01SI003 (revive 6 plus puissants morts cette partie).
  deadAlliesThisGame: { uid: string; cardCode: string }[];
  // Phase 3.61 : bonus permanent de mana slots (01FR012 Catalyseur).
  // manaMax = min(round + manaSlotsBonus, cap).
  manaSlotsBonus: number;
  // Phase 3.61 : uids des unités summoned ce round (côté ce joueur).
  // Reset à startRound. Sert à 01SI019 (dmg ennemis summoned ce round).
  summonedUidsThisRound: string[];
  // Phase 3.62 : uids des unités SUR ce banc qui ont été volées à
  // l'adversaire ce round (Possession). À startRound suivant elles sont
  // retirées du banc + restaurées sur le banc d'origine.
  stolenUidsThisRound: string[];
  // Phase 3.68 : flag pour 01FR023 (Appel de la chef de guerre). Une
  // fois activé, summon le 1er Unit du deck à chaque startRound.
  hasRecurringTopDeckSummon: boolean;
  // Phase 4.0b : flag Jinx L2 (01PZ040T1) — la 1re fois que la main
  // devient vide à chaque round, elle créé Super roquette en main.
  // Reset à startRound.
  jinxFiredEmptyHandThisRound: boolean;
  // Phase 5.10 : flag Lucian L2 (01DE022T1) — la 1re fois qu'un allié
  // meurt chaque round, le caster gagne le jeton d'attaque. Reset à
  // startRound.
  lucianRalliedThisRound: boolean;
  // Phase 3.54 : buffs persistants attachés aux cartes (par uid). Couvre
  // hand + deck. Appliqués au moment de jouer (playUnit) : powerDelta /
  // healthDelta directement sur la nouvelle unité, costDelta sur la mana
  // requise, addKeywords ajoutés. Persiste tant que la carte est en main
  // ou en deck. Une carte sans entrée = pas de buff (default 0).
  cardBuffs: Record<
    string,
    {
      powerDelta: number;
      healthDelta: number;
      costDelta: number;
      addKeywords: string[];
    }
  >;
  // Phase 3.58 : cardCodes uniques joués cette partie (Unit + Spell).
  // Sert pour 01PZ033 (≥ 20 = invoque Chatastrophe).
  uniqueCardCodesPlayedThisGame: string[];
  // Phase 3.5 + 3.9c + 3.10 : compteurs globaux pour conditions de level-up.
  championCounters: {
    alliesDied: number; // pour Lucian, Hécarim, etc.
    spellsCast: number; // pour Karma, etc.
    spellManaSpent: number; // pour Lux ("au moins 6 mana en sorts")
    enemyStunned: number; // pour Yasuo (étourdis/rappelés)
    // Phase 3.9c
    unitsDied: number; // toute mort, alliée OU ennemie (Thresh : 6+ morts)
    barriersGranted: number; // grant Barrier (Shen : 5 barrières)
    enemyTargetCount: number; // sorts ciblant un ennemi (Ezreal : 8+)
    enemiesFrostbitten: number; // frostbite-enemy résolu (Ashe : 5)
    // Phase 3.10
    alliesSurvivedDamage: number; // alliés qui ont survécu à des dégâts ce combat (Vladimir : 5)
    ephemeralAttackers: number; // alliés Éphémères ayant attaqué (Hécarim : 7)
    // Phase 3.12
    techPowerSummoned: number; // puissance totale d'alliés TECHNOLOGIE invoqués (Heimerdinger : 12)
    // Phase 3.13
    mushroomsPlanted: number; // pour Teemo : 5 par frappe Teemo au nexus
    // Phase 4.0 : Lucian peut level-up sur 1 Senna (01DE038) alliée morte.
    sennaAlliedDied: number;
  };
};

// ────────────────────── Helpers de base ──────────────────────────────────

export function getCard(cardCode: string): RuneterraCardData | undefined {
  return RUNETERRA_BASE_SET_BY_CODE.get(cardCode);
}

export function isUnit(cardCode: string): boolean {
  return getCard(cardCode)?.type === "Unit";
}

export function isSpell(cardCode: string): boolean {
  return getCard(cardCode)?.type === "Spell";
}

export function isChampion(cardCode: string): boolean {
  return getCard(cardCode)?.supertype === "Champion";
}

/** Mélange Fisher-Yates (mute le tableau, retourne aussi pour chaining). */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Construit un deck depuis une liste {cardCode, count}. Génère un uid
 *  unique pour chaque copie. Ne mélange pas — appeler `shuffle` après. */
export function expandDeck(
  cards: { cardId: string; count: number }[],
  seed: string,
): DeckCard[] {
  const out: DeckCard[] = [];
  let i = 0;
  for (const entry of cards) {
    for (let n = 0; n < entry.count; n++) {
      out.push({ uid: `${seed}-${i++}`, cardCode: entry.cardId });
    }
  }
  return out;
}

/** Crée un BattleUnit depuis une carte (lecture des stats imprimées). */
export function createUnit(uid: string, cardCode: string): RuneterraBattleUnit {
  const card = getCard(cardCode);
  if (!card) {
    throw new Error(`createUnit: carte inconnue ${cardCode}`);
  }
  if (card.type !== "Unit") {
    throw new Error(`createUnit: ${cardCode} n'est pas une Unité`);
  }
  return {
    uid,
    cardCode,
    power: card.attack ?? 0,
    health: card.health ?? 0,
    damage: 0,
    keywords: card.keywordRefs ?? [],
    level: 1,
    playedThisRound: true,
    barrierUsed: false,
    strikes: 0,
    kills: 0,
    damageTaken: 0,
    nexusStrikes: 0,
    endOfRoundPowerBuff: 0,
    endOfRoundHealthBuff: 0,
    frozen: false,
    stunned: false,
    survivedDamageOnce: false,
    lucianDeathTriggerUsed: false,
  };
}

/** Helper : l'unité a-t-elle ce mot-clé actif ? Match case-sensitive sur
 *  les keywordRefs anglais (Burst, QuickStrike, Tough, etc.). */
export function hasKeyword(unit: RuneterraBattleUnit, kw: string): boolean {
  return unit.keywords.includes(kw);
}

/** Phase 3.8b : modèle de timing combat à 2 phases.
 *   • Phase 1 = "Quick Strike timing" (avant l'autre)
 *   • Phase 2 = "simultané" (au même moment)
 *  - QuickStrike seul : 1 frappe en phase 1
 *  - DoubleStrike : 2 frappes — phase 1 + phase 2
 *  - Sans keyword : 1 frappe en phase 2
 *  Retourne la liste des phases où l'unité va frapper.
 */
function strikePhases(unit: RuneterraBattleUnit, ds: boolean): (1 | 2)[] {
  const qs = hasKeyword(unit, "QuickStrike");
  if (ds) return [1, 2];
  if (qs) return [1];
  return [2];
}

// ────────────────────── État initial / mulligan ──────────────────────────

/** Construit l'état initial d'une partie : decks shuffled, mains piochées
 *  (4 cartes), phase = "mulligan", attack token attribué aléatoirement.
 *  Le round est 0 — `startRound` l'incrémentera à 1 après le mulligan. */
export function createInitialState(
  roomId: string,
  p1: { authId: string; username: string; deck: { cardId: string; count: number }[] },
  p2: { authId: string; username: string; deck: { cardId: string; count: number }[] },
): InternalState {
  const cfg = RUNETERRA_BATTLE_CONFIG;
  const p1Deck = shuffle(expandDeck(p1.deck, `${roomId}-p1`));
  const p2Deck = shuffle(expandDeck(p2.deck, `${roomId}-p2`));

  // Pioche initiale : 4 cartes chacun.
  const p1Hand = p1Deck.splice(0, cfg.initialHandSize);
  const p2Hand = p2Deck.splice(0, cfg.initialHandSize);

  // Attack token aléatoire au premier round (parité Riot).
  const startingAttacker: 0 | 1 = Math.random() < 0.5 ? 0 : 1;

  const mkPlayer = (
    info: { authId: string; username: string },
    deck: DeckCard[],
    hand: DeckCard[],
    hasToken: boolean,
  ): InternalPlayer => ({
    authId: info.authId,
    username: info.username,
    deck,
    hand,
    bench: [],
    mana: 0,
    manaMax: 0,
    spellMana: 0,
    nexusHealth: cfg.initialNexusHealth,
    attackToken: hasToken,
    hasMulliganed: false,
    alliesDiedThisRound: 0,
    deadAlliesThisRound: [],
    deadAlliesThisGame: [],
    cardBuffs: {},
    uniqueCardCodesPlayedThisGame: [],
    manaSlotsBonus: 0,
    summonedUidsThisRound: [],
    stolenUidsThisRound: [],
    hasRecurringTopDeckSummon: false,
    jinxFiredEmptyHandThisRound: false,
    lucianRalliedThisRound: false,
    championCounters: {
      alliesDied: 0,
      spellsCast: 0,
      spellManaSpent: 0,
      enemyStunned: 0,
      unitsDied: 0,
      barriersGranted: 0,
      enemyTargetCount: 0,
      enemiesFrostbitten: 0,
      alliesSurvivedDamage: 0,
      ephemeralAttackers: 0,
      techPowerSummoned: 0,
      mushroomsPlanted: 0,
      sennaAlliedDied: 0,
    },
  });

  return {
    roomId,
    phase: "mulligan",
    players: [
      mkPlayer(p1, p1Deck, p1Hand, startingAttacker === 0),
      mkPlayer(p2, p2Deck, p2Hand, startingAttacker === 1),
    ],
    activeSeatIdx: startingAttacker,
    attackTokenSeatIdx: startingAttacker,
    round: 0,
    consecutivePasses: 0,
    attackInProgress: null,
    winnerSeatIdx: null,
    log: [`Partie démarrée. ${startingAttacker === 0 ? p1.username : p2.username} attaque en premier.`],
  };
}

/** Applique le mulligan d'un joueur : remplace les cartes aux indices
 *  donnés (in hand) par de nouvelles cartes du deck (shuffled). Le joueur
 *  ne peut mulliganer qu'une fois.
 *
 *  Si les 2 joueurs ont mulligané, transition automatique vers `round`
 *  via `startRound`. */
export function applyMulligan(
  state: InternalState,
  seatIdx: 0 | 1,
  replaceIndices: number[],
): InternalState {
  if (state.phase !== "mulligan") return state;
  const player = state.players[seatIdx];
  if (player.hasMulliganed) return state;

  // Validation indices : uniques, dans le range [0, hand.length).
  const valid = new Set<number>();
  for (const i of replaceIndices) {
    if (Number.isInteger(i) && i >= 0 && i < player.hand.length) valid.add(i);
  }

  // Sépare les cartes à garder vs à remplacer.
  const newHand: DeckCard[] = [];
  const replaced: DeckCard[] = [];
  for (let i = 0; i < player.hand.length; i++) {
    if (valid.has(i)) replaced.push(player.hand[i]);
    else newHand.push(player.hand[i]);
  }

  // Réinjecte les cartes remplacées dans le deck, mélange, repioche.
  const newDeck = shuffle([...player.deck, ...replaced]);
  const drawn = newDeck.splice(0, replaced.length);
  newHand.push(...drawn);

  const updatedPlayer: InternalPlayer = {
    ...player,
    hand: newHand,
    deck: newDeck,
    hasMulliganed: true,
  };

  const newPlayers: [InternalPlayer, InternalPlayer] = [...state.players] as [
    InternalPlayer,
    InternalPlayer,
  ];
  newPlayers[seatIdx] = updatedPlayer;

  const log = [
    ...state.log,
    `${player.username} a mulligané ${replaced.length} carte${replaced.length > 1 ? "s" : ""}.`,
  ];

  // Si les 2 ont mulligané → démarre le round 1.
  if (newPlayers[0].hasMulliganed && newPlayers[1].hasMulliganed) {
    return startRound({
      ...state,
      players: newPlayers,
      log,
    });
  }

  return {
    ...state,
    players: newPlayers,
    log,
  };
}

// ────────────────────── Transitions de round ──────────────────────────────

/** Démarre un nouveau round :
 *   • round++
 *   • Pour chaque joueur :
 *     - manaMax = min(round, 10)
 *     - mana = manaMax (recharge complète)
 *     - spellMana inchangée (déjà bankée à la fin du round précédent)
 *     - pioche 1 carte (sauf au tout premier round, où on a déjà piaché 4)
 *   • Attack token swap : le joueur qui n'avait pas le token l'a maintenant
 *   • activeSeat = porteur du token (= déclare l'attaque s'il veut)
 *   • phase = "round"
 *   • Reset playedThisRound de toutes les unités sur le banc.
 */
export function startRound(state: InternalState): InternalState {
  const cfg = RUNETERRA_BATTLE_CONFIG;
  const newRound = state.round + 1;
  const isFirstRound = state.round === 0; // mulligan terminé, on entre dans round 1

  // Phase 3.62 : restitue les unités volées (Possession) à leur owner
  // d'origine. Pour chaque seat, retire les uids de stolenUidsThisRound
  // de son banc et les push sur le banc adverse.
  let restoredState: InternalState = state;
  for (const seat of [0, 1] as const) {
    const player = restoredState.players[seat];
    if (player.stolenUidsThisRound.length === 0) continue;
    const stolen = new Set(player.stolenUidsThisRound);
    const stolenUnits = player.bench.filter((u) => stolen.has(u.uid));
    const remaining = player.bench.filter((u) => !stolen.has(u.uid));
    const otherSeatIdx = (1 - seat) as 0 | 1;
    const otherPlayer = restoredState.players[otherSeatIdx];
    const newOtherBench =
      otherPlayer.bench.length + stolenUnits.length <= cfg.maxBench
        ? [...otherPlayer.bench, ...stolenUnits]
        : [
            ...otherPlayer.bench,
            ...stolenUnits.slice(
              0,
              cfg.maxBench - otherPlayer.bench.length,
            ),
          ];
    const newPlayers: [InternalPlayer, InternalPlayer] = [
      restoredState.players[0],
      restoredState.players[1],
    ] as [InternalPlayer, InternalPlayer];
    newPlayers[seat] = { ...player, bench: remaining };
    newPlayers[otherSeatIdx] = { ...otherPlayer, bench: newOtherBench };
    restoredState = { ...restoredState, players: newPlayers };
  }

  // Swap attack token : l'inverse du round précédent. Au tout premier
  // round, on garde celui choisi à createInitialState.
  const newAttackTokenSeat: 0 | 1 = isFirstRound
    ? restoredState.attackTokenSeatIdx
    : ((1 - restoredState.attackTokenSeatIdx) as 0 | 1);

  // Phase 3.61 : manaMax inclut manaSlotsBonus per-player (Catalyseur).
  const updatedPlayers: [InternalPlayer, InternalPlayer] = [
    refreshPlayerForRound(
      restoredState.players[0],
      Math.min(newRound + restoredState.players[0].manaSlotsBonus, cfg.maxMana),
      newAttackTokenSeat === 0,
      isFirstRound,
    ),
    refreshPlayerForRound(
      restoredState.players[1],
      Math.min(newRound + restoredState.players[1].manaSlotsBonus, cfg.maxMana),
      newAttackTokenSeat === 1,
      isFirstRound,
    ),
  ];
  const newManaMax = updatedPlayers[0].manaMax; // pour le log (peu importe quel)

  const log = [
    ...restoredState.log,
    `─── Round ${newRound} (${newManaMax} mana max). ${updatedPlayers[newAttackTokenSeat].username} a le jeton d'attaque.`,
  ];

  // Phase 3.68 : recurring top-deck summon (01FR023). Pour chaque joueur
  // avec hasRecurringTopDeckSummon, summon le 1er Unit du deck (cap maxBench).
  let withSummons: [InternalPlayer, InternalPlayer] = [
    updatedPlayers[0],
    updatedPlayers[1],
  ];
  for (const seat of [0, 1] as const) {
    const p = withSummons[seat];
    if (!p.hasRecurringTopDeckSummon) continue;
    if (p.bench.length >= cfg.maxBench) continue;
    const idx = p.deck.findIndex((c) => {
      const card = getCard(c.cardCode);
      return card?.type === "Unit";
    });
    if (idx === -1) continue;
    const drawn = p.deck[idx];
    const newDeck = [...p.deck.slice(0, idx), ...p.deck.slice(idx + 1)];
    const baseUnit = createUnit(drawn.uid, drawn.cardCode);
    const buff = p.cardBuffs[drawn.uid];
    const newUnit: RuneterraBattleUnit = buff
      ? {
          ...baseUnit,
          power: baseUnit.power + buff.powerDelta,
          health: baseUnit.health + buff.healthDelta,
          keywords: Array.from(
            new Set([...baseUnit.keywords, ...buff.addKeywords]),
          ),
        }
      : baseUnit;
    const newCardBuffs = { ...p.cardBuffs };
    delete newCardBuffs[drawn.uid];
    withSummons[seat] = {
      ...p,
      deck: newDeck,
      bench: [...p.bench, newUnit],
      cardBuffs: newCardBuffs,
      summonedUidsThisRound: [...p.summonedUidsThisRound, newUnit.uid],
    };
    const cardName = getCard(drawn.cardCode)?.name ?? drawn.cardCode;
    log.push(
      `${p.username} invoque ${cardName} (Appel de la chef de guerre).`,
    );
  }

  // Phase 5.7 : Round Start triggers data-driven.
  // - Garen L2 (01DE012T1) : Rally (donne le jeton d'attaque ce round).
  // - Elise L2 (01SI053T2) : invoque 1 Jeune araignée si autre araignée alliée.
  // - Jinx L2 (01PZ040T1) : pioche 1 carte.
  // - Œuf d'Anivia (01FR024T4) : retransforme en Anivia si Illumination.
  let baseState: InternalState = {
    ...restoredState,
    phase: "round",
    players: withSummons,
    activeSeatIdx: newAttackTokenSeat,
    attackTokenSeatIdx: newAttackTokenSeat,
    round: newRound,
    consecutivePasses: 0,
    log,
  };
  baseState = applyRoundStartChampionTriggers(baseState);
  return baseState;
}

/** Phase 5.7 : Round Start triggers spécifiques aux champions L2. */
function applyRoundStartChampionTriggers(state: InternalState): InternalState {
  let newState = state;
  for (const seat of [0, 1] as const) {
    const player = newState.players[seat];
    // Jinx L2 : pioche 1 carte au round start.
    const jinxL2Count = player.bench.filter(
      (u) => u.cardCode === "01PZ040T1",
    ).length;
    for (let i = 0; i < jinxL2Count; i++) {
      const drawn = drawCards(newState, seat, 1);
      newState = drawn.state;
    }
    // Garen L2 : Rally (gagne le jeton d'attaque ce round).
    const garenL2Count = newState.players[seat].bench.filter(
      (u) => u.cardCode === "01DE012T1",
    ).length;
    if (garenL2Count > 0 && !newState.players[seat].attackToken) {
      const newPlayers: [InternalPlayer, InternalPlayer] = [
        newState.players[0],
        newState.players[1],
      ] as [InternalPlayer, InternalPlayer];
      newPlayers[seat] = { ...newPlayers[seat], attackToken: true };
      newState = {
        ...newState,
        players: newPlayers,
        log: [
          ...newState.log,
          `${player.username} : Garen rallie — gagne le jeton d'attaque.`,
        ],
      };
    }
    // Elise L2 : invoque 1 Jeune araignée si autre araignée alliée présente.
    const eliseL2Bench = newState.players[seat].bench.filter(
      (u) => u.cardCode === "01SI053T2",
    );
    for (const elise of eliseL2Bench) {
      const otherSpiders = newState.players[seat].bench.filter(
        (u) =>
          u.uid !== elise.uid &&
          getCard(u.cardCode)?.subtypes?.includes("ARAIGNÉE"),
      );
      if (otherSpiders.length === 0) continue;
      newState = applySpellEffect(
        newState,
        seat,
        { type: "summon-tokens", cardCode: "01SI002", count: 1 },
        null,
      );
    }
    // Œuf d'Anivia (01FR024T4) : si Illumination atteinte, retransforme
    // en Anivia (01FR024T3) niveau 2.
    if (newState.players[seat].manaMax >= 10) {
      const eggIdxs: number[] = [];
      newState.players[seat].bench.forEach((u, idx) => {
        if (u.cardCode === "01FR024T4") eggIdxs.push(idx);
      });
      if (eggIdxs.length > 0) {
        const aniviaCard = getCard("01FR024T3");
        if (aniviaCard) {
          const newBench = [...newState.players[seat].bench];
          for (const idx of eggIdxs) {
            const egg = newBench[idx];
            newBench[idx] = {
              ...egg,
              cardCode: "01FR024T3",
              power: aniviaCard.attack ?? egg.power,
              health: aniviaCard.health ?? egg.health,
              damage: 0, // reset damage à la transformation
              keywords: aniviaCard.keywordRefs ?? egg.keywords,
              level: 2,
            };
          }
          const newPlayers: [InternalPlayer, InternalPlayer] = [
            newState.players[0],
            newState.players[1],
          ] as [InternalPlayer, InternalPlayer];
          newPlayers[seat] = { ...newPlayers[seat], bench: newBench };
          newState = {
            ...newState,
            players: newPlayers,
            log: [
              ...newState.log,
              `${player.username} : Anivia renaît de son Œuf au niveau supérieur !`,
            ],
          };
        }
      }
    }
  }
  return newState;
}

function refreshPlayerForRound(
  player: InternalPlayer,
  newManaMax: number,
  hasToken: boolean,
  isFirstRound: boolean,
): InternalPlayer {
  // Pioche 1 carte (sauf round 1 où on a déjà piaché 4).
  let newDeck = player.deck;
  let newHand = player.hand;
  if (!isFirstRound && newDeck.length > 0) {
    const drawn = newDeck[0];
    newDeck = newDeck.slice(1);
    newHand = [...newHand, drawn];
  }
  // Reset playedThisRound (les unités déjà sur le banc peuvent maintenant
  // attaquer) et barrierUsed (les Barrières se rechargent chaque round).
  const newBench = player.bench.map((u) => ({
    ...u,
    playedThisRound: false,
    barrierUsed: false,
  }));
  return {
    ...player,
    deck: newDeck,
    hand: newHand,
    bench: newBench,
    manaMax: newManaMax,
    mana: newManaMax,
    attackToken: hasToken,
    // Phase 3.34 + 3.51 + 3.61 + 3.62 : reset compteurs/listes per-round.
    alliesDiedThisRound: 0,
    deadAlliesThisRound: [],
    summonedUidsThisRound: [],
    stolenUidsThisRound: [],
    // Phase 4.0b : reset le flag Jinx L2 chaque round.
    jinxFiredEmptyHandThisRound: false,
    // Phase 5.10 : reset le flag Lucian L2 rally chaque round.
    lucianRalliedThisRound: false,
  };
}

/** Fin du round : la mana non dépensée est bankée en spell mana (cap 3).
 *  Vérifie si la partie est terminée (un nexus à 0). Sinon, démarre le
 *  round suivant. */
export function endRound(state: InternalState): InternalState {
  const cfg = RUNETERRA_BATTLE_CONFIG;
  // 1) Bank spell mana
  // 2) Expire round-only buffs (Phase 3.7)
  // 3) Regeneration : les unités avec ce mot-clé soignent tous leurs dégâts
  // 4) Phase 3.76 : Karma EOR trigger (apply BEFORE bank/expire pour
  //    que les compteurs spellManaSpent fassent sens dans le round).
  let stateForEor: InternalState = state;
  for (const seat of [0, 1] as const) {
    const p = stateForEor.players[seat];
    // Phase 5.9 : compte les 2 formes (L1 + L2 = 01IO041 + 01IO041T1).
    const karmaCount = p.bench.filter(
      (u) => u.cardCode === "01IO041" || u.cardCode === "01IO041T1",
    ).length;
    for (let i = 0; i < karmaCount; i++) {
      // Crée un random spell des régions du caster (réutilise la logique
      // de Sagesse ancestrale via applySpellEffect).
      stateForEor = applySpellEffect(
        stateForEor,
        seat,
        { type: "create-random-spell-in-hand-from-regions" },
        null,
      );
    }
  }
  const updatedPlayers: [InternalPlayer, InternalPlayer] = [
    applyFleetingDiscard(
      applyRegeneration(expireRoundBuffs(bankSpellMana(stateForEor.players[0]))),
    ),
    applyFleetingDiscard(
      applyRegeneration(expireRoundBuffs(bankSpellMana(stateForEor.players[1]))),
    ),
  ];

  // Vérifier game over.
  const p0Dead = updatedPlayers[0].nexusHealth <= 0;
  const p1Dead = updatedPlayers[1].nexusHealth <= 0;
  if (p0Dead || p1Dead) {
    const winner: 0 | 1 | null =
      p0Dead && p1Dead ? null : p0Dead ? 1 : 0;
    return {
      ...stateForEor,
      phase: "ended",
      players: updatedPlayers,
      winnerSeatIdx: winner,
      log: [
        ...stateForEor.log,
        winner === null
          ? "Égalité — les 2 nexus sont à 0."
          : `${updatedPlayers[winner].username} remporte la partie.`,
      ],
    };
  }

  // Sinon, on démarre le round suivant. Phase 3.76 : utilise stateForEor
  // pour préserver les logs de Karma EOR.
  return startRound({
    ...stateForEor,
    players: updatedPlayers,
  });
  void cfg;
}

function bankSpellMana(player: InternalPlayer): InternalPlayer {
  const cfg = RUNETERRA_BATTLE_CONFIG;
  const banked = Math.min(player.spellMana + player.mana, cfg.maxSpellMana);
  return {
    ...player,
    mana: 0, // sera réassignée dans startRound
    spellMana: banked,
  };
}

/** Phase 4.8 : Fleeting (mot-clé Fugace) — les cartes Fleeting encore en
 *  main à la fin du round sont défaussées (oblitérées, pas dans le deck).
 *  Couvre les tokens Heimer turrets, Lux Final Spark, Katarina Dague
 *  fugace, Ezreal Tir mystique, etc. Vérifie keywordRefs sur la card
 *  imprimée (les buffs cardBuffs ne définissent pas Fleeting). */
function applyFleetingDiscard(player: InternalPlayer): InternalPlayer {
  if (player.hand.length === 0) return player;
  const newHand: typeof player.hand = [];
  const discardedNames: string[] = [];
  const newCardBuffs = { ...player.cardBuffs };
  for (const handCard of player.hand) {
    const card = getCard(handCard.cardCode);
    if (card?.keywordRefs?.includes("Fleeting")) {
      discardedNames.push(card.name);
      delete newCardBuffs[handCard.uid];
      continue;
    }
    newHand.push(handCard);
  }
  if (discardedNames.length === 0) return player;
  return { ...player, hand: newHand, cardBuffs: newCardBuffs };
}

/** Régénération (mot-clé Regeneration) : à la fin de chaque round, les
 *  unités avec ce mot-clé soignent tous leurs dégâts. Appliqué dans
 *  endRound avant que le round suivant démarre. */
function applyRegeneration(player: InternalPlayer): InternalPlayer {
  const newBench = player.bench.map((u) => {
    if (u.damage > 0 && hasKeyword(u, "Regeneration")) {
      return { ...u, damage: 0 };
    }
    return u;
  });
  return { ...player, bench: newBench };
}

/** Phase 3.7+3.8c+3.11 : annule les buffs round-only à la fin du round.
 *  Soustrait endOfRoundPowerBuff/HealthBuff de power/health, puis reset
 *  les deltas. Reset aussi frozen et stunned (statuts round-only). */
function expireRoundBuffs(player: InternalPlayer): InternalPlayer {
  const newBench = player.bench.map((u) => {
    if (
      u.endOfRoundPowerBuff === 0 &&
      u.endOfRoundHealthBuff === 0 &&
      !u.frozen &&
      !u.stunned
    ) {
      return u;
    }
    return {
      ...u,
      power: u.power - u.endOfRoundPowerBuff,
      health: u.health - u.endOfRoundHealthBuff,
      endOfRoundPowerBuff: 0,
      endOfRoundHealthBuff: 0,
      frozen: false,
      stunned: false,
    };
  });
  return { ...player, bench: newBench };
}

// ────────────────────── Pioche / utilitaires ─────────────────────────────

/** Pioche N cartes depuis le deck du joueur, jusqu'à la limite de main
 *  (cartes excédentaires écartées — règle LoR : si tu pioches au-delà de
 *  10 cartes, l'excédent est défaussé). Retourne le nouvel état + la
 *  liste des cartes piochées (utile pour l'animation client). */
export function drawCards(
  state: InternalState,
  seatIdx: 0 | 1,
  count: number,
): { state: InternalState; drawn: DeckCard[]; discarded: DeckCard[] } {
  const cfg = RUNETERRA_BATTLE_CONFIG;
  const player = state.players[seatIdx];
  const drawnRaw = player.deck.slice(0, count);
  const newDeck = player.deck.slice(drawnRaw.length);

  // Phase 3.69 : Mushroom (01PZ022) trigger on-draw — 1 dmg au nexus
  // du joueur qui pioche, ne va PAS en main (consommé). Compté avant
  // le filtre maxHand.
  const mushroomCount = drawnRaw.filter((c) => c.cardCode === "01PZ022").length;
  const nonMushroomDrawn = drawnRaw.filter((c) => c.cardCode !== "01PZ022");

  // Sépare ce qui rentre en main vs ce qui dépasse maxHand.
  const room = Math.max(0, cfg.maxHand - player.hand.length);
  const drawn = nonMushroomDrawn.slice(0, room);
  const discarded = nonMushroomDrawn.slice(room);

  const newNexusHealth = player.nexusHealth - mushroomCount;
  const updatedPlayer: InternalPlayer = {
    ...player,
    deck: newDeck,
    hand: [...player.hand, ...drawn],
    nexusHealth: newNexusHealth,
  };
  const newPlayers: [InternalPlayer, InternalPlayer] = [...state.players] as [
    InternalPlayer,
    InternalPlayer,
  ];
  newPlayers[seatIdx] = updatedPlayer;

  let newLog = state.log;
  if (mushroomCount > 0) {
    newLog = [
      ...state.log,
      `${player.username} pioche ${mushroomCount} Champignon(s) vénéneux — ${mushroomCount} dmg nexus.`,
    ];
  }

  // Game over si nexus ≤ 0 par les Mushrooms.
  if (newNexusHealth <= 0) {
    return {
      state: {
        ...state,
        players: newPlayers,
        phase: "ended",
        winnerSeatIdx: otherSeat(seatIdx),
        log: [
          ...newLog,
          `${state.players[otherSeat(seatIdx)].username} remporte la partie (Champignons létaux).`,
        ],
      },
      drawn,
      discarded,
    };
  }

  return {
    state: { ...state, players: newPlayers, log: newLog },
    drawn,
    discarded,
  };
}

/** Mappe seat-id (0/1) → "p1"/"p2" pour l'envoi client. */
export function seatToId(seatIdx: 0 | 1): "p1" | "p2" {
  return seatIdx === 0 ? "p1" : "p2";
}

/** Phase 3.72 : déclenche l'effet « si défaussé » d'un cardCode si
 *  enregistré. Réutilise applySpellEffect comme un cast normal (sans
 *  ciblage : RUNETERRA_DISCARD_EFFECTS ne contient que des effets
 *  side="none"). casterSeat = celui dont la carte est défaussée. */
export function triggerDiscardEffect(
  state: InternalState,
  cardCode: string,
  casterSeat: 0 | 1,
): InternalState {
  const effect = RUNETERRA_DISCARD_EFFECTS[cardCode];
  if (!effect) return state;
  return applySpellEffect(state, casterSeat, effect, null);
}

/** Phase 3.73 : déclenche l'effet on-summon d'un Unit si enregistré.
 *  triggerSourceUid = uid de la unité fraîchement summonée (sert aux
 *  effets type "buff-all-other-allies-round" qui doivent skip self). */
export function triggerOnSummon(
  state: InternalState,
  cardCode: string,
  casterSeat: 0 | 1,
  summonedUid: string,
): InternalState {
  const effect = RUNETERRA_PLAY_EFFECTS[cardCode];
  if (!effect) return state;
  return applySpellEffect(state, casterSeat, effect, null, null, null, 0, summonedUid);
}

/** Phase 3.74 : déclenche l'effet on-attack d'un Unit si enregistré.
 *  Appelé par declareAttack pour chaque attaquant. triggerSourceUid =
 *  uid de l'attaquant (sert pour summon-token-copy-self-stats notamment). */
export function triggerOnAttack(
  state: InternalState,
  cardCode: string,
  attackerSeat: 0 | 1,
  attackerUid: string,
): InternalState {
  const effect = RUNETERRA_ATTACK_EFFECTS[cardCode];
  let newState = state;
  if (effect) {
    newState = applySpellEffect(
      newState,
      attackerSeat,
      effect,
      null,
      null,
      null,
      0,
      attackerUid,
    );
  }
  // Phase 5.8b : Hecarim L2 (01SI042T1) — même effet que L1 (summon 2
  // Cavaliers) ET en plus +3|+0 aux alliés Éphémères en combat ce round.
  if (cardCode === "01SI042T1") {
    // Forcer aussi le summon-tokens (pas dans RUNETERRA_ATTACK_EFFECTS pour
    // T1).
    newState = applySpellEffect(
      newState,
      attackerSeat,
      { type: "summon-tokens", cardCode: "01SI024", count: 2 },
      null,
      null,
      null,
      0,
      attackerUid,
    );
    // +3|+0 round buff sur tous les alliés Éphémères ATTAQUANTS.
    newState = applyHecarimLevel2EphemeralBuff(newState, attackerSeat);
  }
  return newState;
}

/** Phase 5.8b : Hecarim L2 — buff +3|+0 round sur les alliés Éphémères
 *  qui attaquent (présents dans state.attackInProgress.lanes côté
 *  attaquant). Si attackInProgress est null (pas dans une attaque), no-op. */
function applyHecarimLevel2EphemeralBuff(
  state: InternalState,
  attackerSeat: 0 | 1,
): InternalState {
  if (state.attackInProgress === null) return state;
  if (state.attackInProgress.attackerSeatIdx !== attackerSeat) return state;
  const attackerUids = new Set(
    state.attackInProgress.lanes.map((l) => l.attackerUid),
  );
  const player = state.players[attackerSeat];
  let buffCount = 0;
  const newBench = player.bench.map((u) => {
    if (!attackerUids.has(u.uid)) return u;
    if (!hasKeyword(u, "Ephemeral")) return u;
    buffCount++;
    return {
      ...u,
      power: u.power + 3,
      endOfRoundPowerBuff: u.endOfRoundPowerBuff + 3,
    };
  });
  if (buffCount === 0) return state;
  const newPlayers: [InternalPlayer, InternalPlayer] = [
    state.players[0],
    state.players[1],
  ] as [InternalPlayer, InternalPlayer];
  newPlayers[attackerSeat] = { ...player, bench: newBench };
  return {
    ...state,
    players: newPlayers,
    log: [
      ...state.log,
      `${player.username} : Hecarim galvanise ${buffCount} allié${buffCount > 1 ? "s" : ""} Éphémère (+3|+0).`,
    ],
  };
}

/** Phase 3.76 : Heimerdinger (01PZ056) — quand un sort est lancé par le
 *  caster, créer une tourelle fugace du même coût dans sa main, avec
 *  +1|+1 et coût ramené à 0 via cardBuffs. cost → cardCode mapping :
 *  0→T1, 1→T4, 2→T7, 3→T8, 4→T9, 5→T2, 6→T6, 7+→T5 (cap). */
const HEIMER_TURRETS_BY_COST: Record<number, string> = {
  0: "01PZ056T1",
  1: "01PZ056T4",
  2: "01PZ056T7",
  3: "01PZ056T8",
  4: "01PZ056T9",
  5: "01PZ056T2",
  6: "01PZ056T6",
  7: "01PZ056T5",
};

export function triggerHeimerdingerOnSpellCast(
  state: InternalState,
  casterSeat: 0 | 1,
  spellCost: number,
): InternalState {
  const cfg = RUNETERRA_BATTLE_CONFIG;
  const player = state.players[casterSeat];
  // Phase 4.0b : check les DEUX formes (level 1 = 01PZ056, level 2 = 01PZ056T10).
  // Au level 2, chaque turret gagne +2|+2 au lieu de +1|+1 (Heimer L2 boost).
  const heimerL1Count = player.bench.filter(
    (u) => u.cardCode === "01PZ056",
  ).length;
  const heimerL2Count = player.bench.filter(
    (u) => u.cardCode === "01PZ056T10",
  ).length;
  const heimerCount = heimerL1Count + heimerL2Count;
  if (heimerCount === 0) return state;
  const cappedCost = Math.min(spellCost, 7);
  const tokenCardCode = HEIMER_TURRETS_BY_COST[cappedCost];
  if (!tokenCardCode) return state;
  const tokenCard = getCard(tokenCardCode);
  if (!tokenCard) return state;
  let newPlayer = player;
  // 1 turret par Heimerdinger sur le banc. Le bonus dépend du level :
  // L1 = +1|+1, L2 = +2|+2 (cumulé : si 1 L1 + 1 L2, alors 2 turrets,
  // 1 avec +1|+1 et 1 avec +2|+2).
  const buffsToApply = [
    ...Array(heimerL2Count).fill({ power: 2, health: 2 }),
    ...Array(heimerL1Count).fill({ power: 1, health: 1 }),
  ];
  for (let i = 0; i < buffsToApply.length; i++) {
    if (newPlayer.hand.length >= cfg.maxHand) break;
    const newUid = `${casterSeat}-htur-${state.round}-${state.log.length}-${i}`;
    const newCardBuffs = { ...newPlayer.cardBuffs };
    newCardBuffs[newUid] = {
      powerDelta: buffsToApply[i].power,
      healthDelta: buffsToApply[i].health,
      costDelta: -cappedCost,
      addKeywords: [],
    };
    newPlayer = {
      ...newPlayer,
      hand: [...newPlayer.hand, { uid: newUid, cardCode: tokenCardCode }],
      cardBuffs: newCardBuffs,
    };
  }
  const newPlayers: [InternalPlayer, InternalPlayer] = [
    state.players[0],
    state.players[1],
  ] as [InternalPlayer, InternalPlayer];
  newPlayers[casterSeat] = newPlayer;
  return {
    ...state,
    players: newPlayers,
    log: [
      ...state.log,
      `${player.username} : Heimerdinger crée ${heimerCount} × ${tokenCard.name}.`,
    ],
  };
}

/** Phase 3.76 : Yasuo (01IO015) déclenche 2 dmg sur tout enemy qu'on
 *  vient de stun (ou recall). À appeler depuis tous les sites stun-enemy.
 *  casterSeat = le joueur qui a un Yasuo potentiel. stunnedEnemyUid =
 *  uid de l'unité ennemie stunnée (existe encore sur opp bench). */
export function triggerYasuoOnEnemyStunned(
  state: InternalState,
  casterSeat: 0 | 1,
  stunnedEnemyUid: string,
): InternalState {
  const oppSeatIdx = otherSeat(casterSeat);
  const caster = state.players[casterSeat];
  const opp = state.players[oppSeatIdx];
  // Phase 4.0b : check les DEUX formes (level 1 = 01IO015, level 2 = 01IO015T1).
  // Au level 2, Yasuo deal 4 dmg au lieu de 2 (Yasuo L2 boost de Riot).
  const yasuoL1Count = caster.bench.filter(
    (u) => u.cardCode === "01IO015",
  ).length;
  const yasuoL2Count = caster.bench.filter(
    (u) => u.cardCode === "01IO015T1",
  ).length;
  const yasuoCount = yasuoL1Count + yasuoL2Count;
  if (yasuoCount === 0) return state;
  const target = opp.bench.find((u) => u.uid === stunnedEnemyUid);
  if (!target) return state;
  // L1 deal 2, L2 deal 4 — somme cumulée par count.
  const totalDmg = 2 * yasuoL1Count + 4 * yasuoL2Count;
  const updatedBench = opp.bench.map((u) => {
    if (u.uid !== stunnedEnemyUid) return u;
    const c = { ...u };
    applyDamageToUnit(c, totalDmg);
    return c;
  });
  const survivors = updatedBench.filter((u) => u.damage < u.health);
  const dead = updatedBench.find((u) => u.damage >= u.health);
  const newPlayers: [InternalPlayer, InternalPlayer] = [
    state.players[0],
    state.players[1],
  ] as [InternalPlayer, InternalPlayer];
  newPlayers[oppSeatIdx] = {
    ...opp,
    bench: survivors,
    alliesDiedThisRound: opp.alliesDiedThisRound + (dead ? 1 : 0),
    championCounters: {
      ...opp.championCounters,
      alliesDied: opp.championCounters.alliesDied + (dead ? 1 : 0),
      unitsDied: opp.championCounters.unitsDied + (dead ? 1 : 0),
    },
  };
  newPlayers[casterSeat] = {
    ...caster,
    championCounters: {
      ...caster.championCounters,
      unitsDied: caster.championCounters.unitsDied + (dead ? 1 : 0),
    },
  };
  let newState: InternalState = {
    ...state,
    players: newPlayers,
    log: [
      ...state.log,
      `${target.uid} (Yasuo) prend ${totalDmg} dmg.`,
    ],
  };
  if (dead) newState = triggerLastBreath(newState, dead, oppSeatIdx);
  return newState;
}

/** Phase 3.78 : déclenche le Support effect d'un Unit si enregistré
 *  (Shen, Cuistots de guerre). attackerSeat = caster, supportedAllyUid =
 *  uid de la lane[i+1].attackerUid (l'allié soutenu). */
export function triggerOnSupport(
  state: InternalState,
  cardCode: string,
  attackerSeat: 0 | 1,
  supportedAllyUid: string,
): InternalState {
  const effect = RUNETERRA_SUPPORT_EFFECTS[cardCode];
  if (!effect) return state;
  return applySpellEffect(
    state,
    attackerSeat,
    effect,
    supportedAllyUid,
    null,
    null,
    0,
    null,
  );
}

/** Phase 3.75 : déclenche l'effet on-nexus-strike d'un Champion si
 *  enregistré. Appelé par resolveCombat pour chaque strike au nexus. */
export function triggerOnNexusStrike(
  state: InternalState,
  cardCode: string,
  attackerSeat: 0 | 1,
  attackerUid: string,
): InternalState {
  const effect = RUNETERRA_NEXUS_STRIKE_EFFECTS[cardCode];
  if (!effect) return state;
  return applySpellEffect(state, attackerSeat, effect, null, null, null, 0, attackerUid);
}

/** Phase 3.34 : helper qui bumpe alliesDiedThisRound (per-round) ET
 *  championCounters.alliesDied (per-game cumulé). Sert à tous les sites
 *  qui retirent une unité alliée du banc. À utiliser après avoir construit
 *  un nouvel objet player partiellement modifié.
 *  Si count <= 0, no-op (return as-is). */
export function bumpAllyDeaths(
  player: InternalPlayer,
  count: number,
): InternalPlayer {
  if (count <= 0) return player;
  return {
    ...player,
    alliesDiedThisRound: player.alliesDiedThisRound + count,
    championCounters: {
      ...player.championCounters,
      alliesDied: player.championCounters.alliesDied + count,
    },
  };
}

// ────────────────────── Phase 3.22 : Imbue ───────────────────────────────

/** Déclenche les effets Imbue de tous les alliés du caster qui ont le
 *  mot-clé Imbue. Appelé APRÈS la résolution d'un sort par le caster.
 *  Returns le nouvel état avec les buffs/effets Imbue appliqués + log. */
export function triggerImbue(
  state: InternalState,
  casterSeatIdx: 0 | 1,
): InternalState {
  const player = state.players[casterSeatIdx];
  let newBench = player.bench;
  let changed = false;
  const events: string[] = [];
  for (const unit of player.bench) {
    if (!unit.keywords.includes("Imbue")) continue;
    const effect = RUNETERRA_IMBUE_EFFECTS[unit.cardCode];
    if (!effect) continue;
    const applied = applyImbueEffect(newBench, unit.uid, effect);
    if (applied) {
      newBench = applied;
      changed = true;
      const card = getCard(unit.cardCode);
      if (effect.type === "buff-self-permanent") {
        events.push(
          `${card?.name ?? unit.cardCode} (Inspiration) gagne +${effect.power}|+${effect.health}.`,
        );
      }
    }
  }
  if (!changed) return state;
  const newPlayers: [InternalPlayer, InternalPlayer] = [
    state.players[0],
    state.players[1],
  ] as [InternalPlayer, InternalPlayer];
  newPlayers[casterSeatIdx] = { ...player, bench: newBench };
  return { ...state, players: newPlayers, log: [...state.log, ...events] };
}

function applyImbueEffect(
  bench: RuneterraBattleUnit[],
  unitUid: string,
  effect: ImbueEffect,
): RuneterraBattleUnit[] | null {
  switch (effect.type) {
    case "buff-self-permanent":
      return bench.map((u) =>
        u.uid === unitUid
          ? {
              ...u,
              power: u.power + effect.power,
              health: u.health + effect.health,
            }
          : u,
      );
  }
}

// ────────────────────── Phase 3.9b : Last Breath ─────────────────────────

/** Déclenche le Last Breath d'une unité qui vient de mourir. Appelé après
 *  le retrait de l'unité du banc. Retourne le nouvel état (potentiellement
 *  inchangé si l'unité n'a pas LastBreath ou n'est pas dans le registry).
 */
export function triggerLastBreath(
  state: InternalState,
  dyingUnit: RuneterraBattleUnit,
  dyingUnitSeat: 0 | 1,
): InternalState {
  // Phase 3.51 + 3.60 : enregistre toute mort d'allié dans
  // deadAlliesThisRound (reset à startRound) ET deadAlliesThisGame
  // (cumulé toute la partie). Avant l'effet Last Breath pour que les
  // sorts puissent voir la mort actuelle dans la liste.
  const dyingPlayer = state.players[dyingUnitSeat];
  const newPlayers: [InternalPlayer, InternalPlayer] = [
    state.players[0],
    state.players[1],
  ] as [InternalPlayer, InternalPlayer];
  const deathEntry = { uid: dyingUnit.uid, cardCode: dyingUnit.cardCode };
  newPlayers[dyingUnitSeat] = {
    ...dyingPlayer,
    deadAlliesThisRound: [...dyingPlayer.deadAlliesThisRound, deathEntry],
    deadAlliesThisGame: [...dyingPlayer.deadAlliesThisGame, deathEntry],
  };
  let stateWithDeath: InternalState = { ...state, players: newPlayers };
  // Phase 4.0 : si une Senna (01DE038) alliée meurt, bumpe le compteur
  // sennaAlliedDied pour que Lucian puisse level-up immédiatement (sa
  // condition est « 4+ alliés OR 1 Senna meurent »).
  if (dyingUnit.cardCode === "01DE038") {
    const owner = stateWithDeath.players[dyingUnitSeat];
    const psSenna: [InternalPlayer, InternalPlayer] = [
      stateWithDeath.players[0],
      stateWithDeath.players[1],
    ] as [InternalPlayer, InternalPlayer];
    psSenna[dyingUnitSeat] = {
      ...owner,
      championCounters: {
        ...owner.championCounters,
        sennaAlliedDied: owner.championCounters.sennaAlliedDied + 1,
      },
    };
    stateWithDeath = { ...stateWithDeath, players: psSenna };
  }
  // Phase 3.77 : Senna trigger — si un Lucian allié meurt, +1|+1 et
  // Double frappe à toutes les Sennas allies non-déjà-triggered.
  if (dyingUnit.cardCode === "01DE022") {
    const owner = stateWithDeath.players[dyingUnitSeat];
    let buffed = false;
    const newSennaBench = owner.bench.map((u) => {
      if (u.cardCode !== "01DE038") return u;
      if (u.lucianDeathTriggerUsed) return u;
      buffed = true;
      const newKeywords = u.keywords.includes("DoubleStrike")
        ? u.keywords
        : [...u.keywords, "DoubleStrike"];
      return {
        ...u,
        power: u.power + 1,
        health: u.health + 1,
        keywords: newKeywords,
        lucianDeathTriggerUsed: true,
      };
    });
    if (buffed) {
      const psSenna: [InternalPlayer, InternalPlayer] = [
        stateWithDeath.players[0],
        stateWithDeath.players[1],
      ] as [InternalPlayer, InternalPlayer];
      psSenna[dyingUnitSeat] = { ...owner, bench: newSennaBench };
      stateWithDeath = {
        ...stateWithDeath,
        players: psSenna,
        log: [
          ...stateWithDeath.log,
          `${owner.username} : Senna pleure Lucian (+1|+1 et Double frappe).`,
        ],
      };
    }
  }
  // Phase 5.10 : Lucian L2 (01DE022T1) — la 1re fois qu'un allié meurt
  // chaque round, le contrôleur de Lucian L2 gagne le jeton d'attaque
  // (rally). Triggered une seule fois par round par côté.
  {
    const owner = stateWithDeath.players[dyingUnitSeat];
    const lucianL2OnBench = owner.bench.some(
      (u) => u.cardCode === "01DE022T1",
    );
    if (
      lucianL2OnBench &&
      !owner.lucianRalliedThisRound &&
      !owner.attackToken
    ) {
      const psLucian: [InternalPlayer, InternalPlayer] = [
        stateWithDeath.players[0],
        stateWithDeath.players[1],
      ] as [InternalPlayer, InternalPlayer];
      psLucian[dyingUnitSeat] = {
        ...owner,
        attackToken: true,
        lucianRalliedThisRound: true,
      };
      stateWithDeath = {
        ...stateWithDeath,
        players: psLucian,
        log: [
          ...stateWithDeath.log,
          `${owner.username} : Lucian rallie — gagne le jeton d'attaque !`,
        ],
      };
    } else if (
      lucianL2OnBench &&
      !owner.lucianRalliedThisRound &&
      owner.attackToken
    ) {
      // Marque comme used même si déjà attack token (le trigger one-shot
      // se consomme au premier ally death même sans effet visible).
      const psLucian: [InternalPlayer, InternalPlayer] = [
        stateWithDeath.players[0],
        stateWithDeath.players[1],
      ] as [InternalPlayer, InternalPlayer];
      psLucian[dyingUnitSeat] = { ...owner, lucianRalliedThisRound: true };
      stateWithDeath = { ...stateWithDeath, players: psLucian };
    }
  }
  if (!dyingUnit.keywords.includes("LastBreath")) return stateWithDeath;
  const effect = RUNETERRA_LAST_BREATH_EFFECTS[dyingUnit.cardCode];
  if (!effect) return stateWithDeath;
  return applyLastBreathEffect(stateWithDeath, dyingUnitSeat, dyingUnit, effect);
}

function applyLastBreathEffect(
  state: InternalState,
  seatIdx: 0 | 1,
  dyingUnit: RuneterraBattleUnit,
  effect: LastBreathEffect,
): InternalState {
  const unitName = getCard(dyingUnit.cardCode)?.name ?? dyingUnit.cardCode;
  switch (effect.type) {
    case "draw-cards": {
      const result = drawCards(state, seatIdx, effect.count);
      return {
        ...result.state,
        log: [
          ...result.state.log,
          `${unitName} (Dernier souffle) — ${state.players[seatIdx].username} pioche ${effect.count} carte${effect.count > 1 ? "s" : ""}.`,
        ],
      };
    }
    case "deal-damage-enemy-nexus": {
      const oppSeat = otherSeat(seatIdx);
      const opp = state.players[oppSeat];
      const newNexus = opp.nexusHealth - effect.amount;
      const newPlayers: [InternalPlayer, InternalPlayer] = [
        state.players[0],
        state.players[1],
      ] as [InternalPlayer, InternalPlayer];
      newPlayers[oppSeat] = { ...opp, nexusHealth: newNexus };
      const log = [
        ...state.log,
        `${unitName} (Dernier souffle) inflige ${effect.amount} pt(s) au nexus de ${opp.username}.`,
      ];
      if (newNexus <= 0) {
        return {
          ...state,
          players: newPlayers,
          phase: "ended",
          winnerSeatIdx: seatIdx,
          log: [
            ...log,
            `${state.players[seatIdx].username} remporte la partie.`,
          ],
        };
      }
      return { ...state, players: newPlayers, log };
    }
    case "revive-as-different-card": {
      // Phase 3.15 : crée une nouvelle unité (avec un nouvel uid pour
      // éviter conflit avec d'autres références à l'unité morte) sur le
      // banc du joueur dont l'unité est morte. Skip si banc plein.
      const player = state.players[seatIdx];
      if (player.bench.length >= RUNETERRA_BATTLE_CONFIG.maxBench) {
        return {
          ...state,
          log: [
            ...state.log,
            `${unitName} (Dernier souffle) — pas de place pour ranimer (banc plein).`,
          ],
        };
      }
      const replacement = getCard(effect.replacementCardCode);
      if (!replacement || replacement.type !== "Unit") {
        return state; // mapping invalide
      }
      const newUid = `${dyingUnit.uid}-revived`;
      const newUnit = createUnit(newUid, effect.replacementCardCode);
      const newPlayers: [InternalPlayer, InternalPlayer] = [
        state.players[0],
        state.players[1],
      ] as [InternalPlayer, InternalPlayer];
      newPlayers[seatIdx] = {
        ...player,
        bench: [...player.bench, newUnit],
      };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${unitName} (Dernier souffle) — ranimé en ${replacement.name}.`,
        ],
      };
    }
  }
}

// ────────────────────── Projection serveur → client ──────────────────────

/** Projette l'état interne complet vers la perspective d'un joueur :
 *   • self = ton état (avec hand visible)
 *   • opponent = état adverse (hand cachée, juste le compte)
 *   • Tronque le log aux 20 derniers évènements
 */
export function projectStateForSeat(
  state: InternalState,
  viewerSeatIdx: 0 | 1,
): RuneterraBattleState {
  const selfPlayer = state.players[viewerSeatIdx];
  const opponentPlayer = state.players[otherSeat(viewerSeatIdx)];
  return {
    roomId: state.roomId,
    phase: state.phase,
    self: projectSelf(selfPlayer),
    opponent: projectPublic(opponentPlayer),
    selfSeat: seatToId(viewerSeatIdx),
    activeSeat: seatToId(state.activeSeatIdx),
    attackTokenSeat: seatToId(state.attackTokenSeatIdx),
    attackInProgress:
      state.attackInProgress === null
        ? null
        : {
            attackerSeat: seatToId(state.attackInProgress.attackerSeatIdx),
            lanes: state.attackInProgress.lanes,
          },
    round: state.round,
    winner:
      state.winnerSeatIdx === null ? null : seatToId(state.winnerSeatIdx),
    log: state.log.slice(-20),
  };
}

function projectPublic(p: InternalPlayer): RuneterraPlayerPublicState {
  return {
    authId: p.authId,
    username: p.username,
    deckSize: p.deck.length,
    handCount: p.hand.length,
    bench: p.bench,
    mana: p.mana,
    manaMax: p.manaMax,
    spellMana: p.spellMana,
    nexusHealth: p.nexusHealth,
    attackToken: p.attackToken,
    hasMulliganed: p.hasMulliganed,
  };
}

function projectSelf(p: InternalPlayer): RuneterraSelfState {
  // Phase 3.54 : ne projette cardBuffs que si non vide (économie de payload).
  const hasBuffs = Object.keys(p.cardBuffs).length > 0;
  return {
    ...projectPublic(p),
    hand: p.hand.map((c) => c.cardCode),
    handUids: p.hand.map((c) => c.uid),
    ...(hasBuffs ? { cardBuffs: p.cardBuffs } : {}),
  };
}

function otherSeat(seat: 0 | 1): 0 | 1 {
  return (1 - seat) as 0 | 1;
}

// ────────────────────── Phase 3.2 : actions de base ──────────────────────

/** Joue une unité depuis la main vers le banc.
 *   • Vérifie phase=round, c'est ton tour, hand index valide, carte est Unit
 *   • Vérifie mana >= cost et bench < maxBench
 *   • Déduit le mana, retire de la main, ajoute au banc avec
 *     playedThisRound=true (l'unité ne pourra pas attaquer ce round)
 *   • Reset consecutivePasses, switch priorité à l'adversaire
 */
export function playUnit(
  state: InternalState,
  seatIdx: 0 | 1,
  handIndex: number,
): EngineResult {
  if (state.phase !== "round") {
    return { ok: false, error: "La partie n'est pas en round." };
  }
  if (state.activeSeatIdx !== seatIdx) {
    return { ok: false, error: "Ce n'est pas ton tour." };
  }
  const player = state.players[seatIdx];
  if (handIndex < 0 || handIndex >= player.hand.length) {
    return { ok: false, error: "Carte introuvable dans la main." };
  }
  const handCard = player.hand[handIndex];
  const card = getCard(handCard.cardCode);
  if (!card) {
    return { ok: false, error: `Carte inconnue : ${handCard.cardCode}.` };
  }
  if (card.type !== "Unit") {
    return { ok: false, error: `${card.name} n'est pas une unité.` };
  }
  // Phase 3.54 : cost effectif (printed + costDelta du cardBuff, capé à 0).
  const buff = player.cardBuffs[handCard.uid];
  const effectiveCost = Math.max(0, card.cost + (buff?.costDelta ?? 0));
  if (player.mana < effectiveCost) {
    return {
      ok: false,
      error: `Mana insuffisante (${player.mana}/${effectiveCost}).`,
    };
  }
  if (player.bench.length >= RUNETERRA_BATTLE_CONFIG.maxBench) {
    return { ok: false, error: "Banc plein (6 max)." };
  }

  // Construit la nouvelle main + banc + mana.
  const newHand = [
    ...player.hand.slice(0, handIndex),
    ...player.hand.slice(handIndex + 1),
  ];
  const baseUnit = createUnit(handCard.uid, handCard.cardCode);
  // Phase 3.54 : applique le cardBuff (power/health/keywords) si présent.
  const newUnit: RuneterraBattleUnit = buff
    ? {
        ...baseUnit,
        power: baseUnit.power + buff.powerDelta,
        health: baseUnit.health + buff.healthDelta,
        keywords: Array.from(
          new Set([...baseUnit.keywords, ...buff.addKeywords]),
        ),
      }
    : baseUnit;
  const newBench = [...player.bench, newUnit];
  // Phase 3.12 : techPowerSummoned (Heimerdinger) — incrémenté de la
  // puissance imprimée si l'unité a le subtype TECHNOLOGIE.
  const techPowerDelta =
    card.subtypes?.includes("TECHNOLOGIE") ? (card.attack ?? 0) : 0;
  // Phase 3.54 : retire le cardBuff de la main (consommé).
  const newCardBuffs = { ...player.cardBuffs };
  delete newCardBuffs[handCard.uid];
  // Phase 3.58 : track unique cardCodes joués cette partie.
  const uniqueCodes = player.uniqueCardCodesPlayedThisGame.includes(
    handCard.cardCode,
  )
    ? player.uniqueCardCodesPlayedThisGame
    : [...player.uniqueCardCodesPlayedThisGame, handCard.cardCode];
  const updatedPlayer: InternalPlayer = {
    ...player,
    hand: newHand,
    bench: newBench,
    mana: player.mana - effectiveCost,
    cardBuffs: newCardBuffs,
    uniqueCardCodesPlayedThisGame: uniqueCodes,
    // Phase 3.61 : push uid à summonedUidsThisRound (pour 01SI019).
    summonedUidsThisRound: [...player.summonedUidsThisRound, newUnit.uid],
    championCounters: {
      ...player.championCounters,
      techPowerSummoned:
        player.championCounters.techPowerSummoned + techPowerDelta,
    },
  };

  const newPlayers: [InternalPlayer, InternalPlayer] = [...state.players] as [
    InternalPlayer,
    InternalPlayer,
  ];
  newPlayers[seatIdx] = updatedPlayer;

  // Phase 3.73 : déclenche on-summon (RUNETERRA_PLAY_EFFECTS) si le
  // cardCode du nouveau unit a une ability registrée. summonedUid permet
  // aux effets « buff-all-other-allies » de skip self.
  let stateAfterSummon: InternalState = {
    ...state,
    players: newPlayers,
    activeSeatIdx: otherSeat(seatIdx),
    consecutivePasses: 0,
    log: [
      ...state.log,
      `${player.username} joue ${card.name} (coût ${card.cost}).`,
    ],
  };
  stateAfterSummon = triggerOnSummon(
    stateAfterSummon,
    handCard.cardCode,
    seatIdx,
    handCard.uid,
  );

  return {
    ok: true,
    state: stateAfterSummon,
  };
}

/** Joue un sort depuis la main avec ciblage optionnel (Phase 3.7).
 *   • Vérifie phase=round, c'est ton tour, hand index valide, carte est Spell
 *   • Vérifie mana + spellMana >= cost (mana utilisée d'abord, puis spellMana)
 *   • Si le sort a un effet enregistré dans SPELL_EFFECT_REGISTRY :
 *     - Vérifie que le ciblage est correct (allié/ennemi/aucun selon l'effet)
 *     - Applique l'effet via le resolver
 *   • Sinon, le sort se joue sans effet (mana déduite, retiré de la main)
 *   • Reset consecutivePasses, switch priorité à l'adversaire
 */
export function playSpell(
  state: InternalState,
  seatIdx: 0 | 1,
  handIndex: number,
  targetUid?: string | null,
  targetUid2?: string | null,
  targetUid3?: string | null,
  spellChoice?: number,
): EngineResult {
  if (state.phase !== "round") {
    return { ok: false, error: "La partie n'est pas en round." };
  }
  if (state.activeSeatIdx !== seatIdx) {
    return { ok: false, error: "Ce n'est pas ton tour." };
  }
  const player = state.players[seatIdx];
  if (handIndex < 0 || handIndex >= player.hand.length) {
    return { ok: false, error: "Carte introuvable dans la main." };
  }
  const handCard = player.hand[handIndex];
  const card = getCard(handCard.cardCode);
  if (!card) {
    return { ok: false, error: `Carte inconnue : ${handCard.cardCode}.` };
  }
  if (card.type !== "Spell") {
    return { ok: false, error: `${card.name} n'est pas un sort.` };
  }
  // Phase 3.54 : cardBuff cost réduction sur les sorts aussi.
  // Phase 3.71 : 01DE033 réduction dynamique par alliesDiedThisRound.
  const buffSpell = player.cardBuffs[handCard.uid];
  let dynamicCostBonus = 0;
  if (handCard.cardCode === "01DE033") {
    dynamicCostBonus = -player.alliesDiedThisRound;
  }
  const effectiveSpellCost = Math.max(
    0,
    card.cost + (buffSpell?.costDelta ?? 0) + dynamicCostBonus,
  );
  const totalAvailable = player.mana + player.spellMana;
  if (totalAvailable < effectiveSpellCost) {
    return {
      ok: false,
      error: `Mana insuffisante (${totalAvailable}/${effectiveSpellCost}, dont spell mana ${player.spellMana}).`,
    };
  }

  // Phase 5.0 : validation spell speed.
  //   - Slow : ne peut PAS être joué en combat (attaque en cours).
  //   - Burst/Focus : caster GARDE la priorité après cast (combos).
  //   - Fast : caster passe la priorité (réaction adverse possible).
  // Le spell speed est sur card.spellSpeed ("Burst" | "Fast" | "Slow" | "Focus").
  const spellSpeed = card.spellSpeed;
  if (spellSpeed === "Slow" && state.attackInProgress !== null) {
    return {
      ok: false,
      error: `${card.name} (Lent) ne peut pas être joué pendant un combat.`,
    };
  }
  // Burst/Focus = pas de fenêtre de réaction adverse → caster keeps priority.
  const keepsPriorityAfterCast =
    spellSpeed === "Burst" || spellSpeed === "Focus";

  // Phase 3.7 + 3.37 + 3.70 : valide le ciblage (1, 2 ou 3 cibles selon
  // l'effet).
  const effect = RUNETERRA_SPELL_EFFECTS[handCard.cardCode];
  if (effect) {
    const validation = validateSpellTarget(
      state,
      seatIdx,
      effect,
      targetUid,
      targetUid2,
      targetUid3,
    );
    if (!validation.ok) return { ok: false, error: validation.error };
  }

  // Mana standard d'abord, spellMana en complément.
  // Phase 3.54 + 3.71 : utilise effectiveSpellCost (réduction cardBuff +
  // dynamique 01DE033) au lieu de card.cost.
  const fromMana = Math.min(effectiveSpellCost, player.mana);
  const fromSpellMana = effectiveSpellCost - fromMana;
  const newHand = [
    ...player.hand.slice(0, handIndex),
    ...player.hand.slice(handIndex + 1),
  ];
  // Phase 3.9c : enemyTargetCount incrémenté si cible ennemie (Ezreal).
  const targetSide = effect ? getSpellTargetSide(effect) : "none";
  const targetIsEnemy =
    targetUid !== null &&
    targetUid !== undefined &&
    state.players[otherSeat(seatIdx)].bench.some((u) => u.uid === targetUid);
  // Phase 3.58 : track unique cardCodes joués cette partie.
  const uniqueCodes = player.uniqueCardCodesPlayedThisGame.includes(
    handCard.cardCode,
  )
    ? player.uniqueCardCodesPlayedThisGame
    : [...player.uniqueCardCodesPlayedThisGame, handCard.cardCode];
  // Phase 3.71 : nettoie le cardBuff de la spell consommée.
  const newCardBuffsSpell = { ...player.cardBuffs };
  delete newCardBuffsSpell[handCard.uid];
  const updatedPlayer: InternalPlayer = {
    ...player,
    hand: newHand,
    mana: player.mana - fromMana,
    spellMana: player.spellMana - fromSpellMana,
    uniqueCardCodesPlayedThisGame: uniqueCodes,
    cardBuffs: newCardBuffsSpell,
    championCounters: {
      ...player.championCounters,
      spellsCast: player.championCounters.spellsCast + 1,
      spellManaSpent: player.championCounters.spellManaSpent + effectiveSpellCost,
      enemyTargetCount:
        player.championCounters.enemyTargetCount +
        (targetIsEnemy && (targetSide === "enemy" || targetSide === "any")
          ? 1
          : 0),
    },
  };

  let newPlayers: [InternalPlayer, InternalPlayer] = [...state.players] as [
    InternalPlayer,
    InternalPlayer,
  ];
  newPlayers[seatIdx] = updatedPlayer;

  // Applique l'effet enregistré.
  let intermediateState: InternalState = {
    ...state,
    players: newPlayers,
  };
  if (effect) {
    intermediateState = applySpellEffect(
      intermediateState,
      seatIdx,
      effect,
      targetUid ?? null,
      targetUid2 ?? null,
      targetUid3 ?? null,
      spellChoice ?? 0,
    );
    newPlayers = intermediateState.players;
    // Phase 5.2 : Karma niveau 2 (01IO041T1) — quand le caster lance
    // un sort, copiez-le sur les mêmes cibles. On applique l'effet une
    // 2e fois (cibles identiques). 1 application supplémentaire par
    // Karma L2 sur le banc.
    const karmaL2Count = newPlayers[seatIdx].bench.filter(
      (u) => u.cardCode === "01IO041T1",
    ).length;
    if (karmaL2Count > 0) {
      for (let i = 0; i < karmaL2Count; i++) {
        intermediateState = applySpellEffect(
          intermediateState,
          seatIdx,
          effect,
          targetUid ?? null,
          targetUid2 ?? null,
          targetUid3 ?? null,
          spellChoice ?? 0,
        );
      }
      const karmaPlayer = intermediateState.players[seatIdx];
      newPlayers = [
        intermediateState.players[0],
        intermediateState.players[1],
      ] as [InternalPlayer, InternalPlayer];
      intermediateState = {
        ...intermediateState,
        log: [
          ...intermediateState.log,
          `${karmaPlayer.username} : Karma copie ${card.name} (${karmaL2Count}× supplémentaire${karmaL2Count > 1 ? "s" : ""}).`,
        ],
      };
    }
  }

  // Phase 3.22 : déclenche Imbue sur tous les alliés du caster qui en ont.
  // Phase 5.0 : Burst/Focus → caster GARDE la priorité (active reste seatIdx).
  // Fast/Slow → priorité passe à l'adversaire (réaction possible).
  let postSpellState: InternalState = {
    ...intermediateState,
    activeSeatIdx: keepsPriorityAfterCast ? seatIdx : otherSeat(seatIdx),
    consecutivePasses: 0,
    log: [
      ...intermediateState.log,
      `${player.username} lance ${card.name} (coût ${card.cost}, ${spellSpeed ?? "?"}).`,
    ],
  };
  postSpellState = triggerImbue(postSpellState, seatIdx);
  // Phase 3.76 : Heimerdinger trigger (cast turret of same cost in hand).
  postSpellState = triggerHeimerdingerOnSpellCast(
    postSpellState,
    seatIdx,
    effectiveSpellCost,
  );
  // Phase 4.0b : Lux L2 — chaque fois que spellManaSpent crosse un
  // multiple de 6 dans le round, créer 1 Éclat final (01DE042T3) en main.
  // Trigger continu vs uniquement à level-up (qui était l'ancien
  // comportement bug).
  postSpellState = triggerLuxLevel2OnSpellCast(
    postSpellState,
    seatIdx,
    player.championCounters.spellManaSpent,
    player.championCounters.spellManaSpent + effectiveSpellCost,
  );
  // Phase 4.0b : Jinx L2 — si la main devient vide pour la 1re fois de
  // ce round, créer 1 Super roquette de la mort ! (01PZ040T2) en main.
  postSpellState = triggerJinxLevel2OnHandEmpty(postSpellState, seatIdx);
  // Phase 5.9 : Ezreal L2 — si le sort vient de cibler un ennemi, deal
  // 2 dmg au nexus ennemi (par Ezreal L2 sur le banc).
  if (targetIsEnemy && (targetSide === "enemy" || targetSide === "any")) {
    postSpellState = triggerEzrealLevel2OnEnemyTarget(postSpellState, seatIdx);
  }
  return {
    ok: true,
    state: checkLevelUps(postSpellState),
  };
}

/** Phase 5.9 : Ezreal niveau 2 (01PZ036T1) — quand vous ciblez un ennemi,
 *  infligez 2 dmg au nexus ennemi par Ezreal L2 sur le banc. */
function triggerEzrealLevel2OnEnemyTarget(
  state: InternalState,
  casterSeat: 0 | 1,
): InternalState {
  const player = state.players[casterSeat];
  const ezrealL2Count = player.bench.filter(
    (u) => u.cardCode === "01PZ036T1",
  ).length;
  if (ezrealL2Count === 0) return state;
  const oppSeat = otherSeat(casterSeat);
  const opp = state.players[oppSeat];
  const dmg = 2 * ezrealL2Count;
  const newPlayers: [InternalPlayer, InternalPlayer] = [
    state.players[0],
    state.players[1],
  ] as [InternalPlayer, InternalPlayer];
  newPlayers[oppSeat] = { ...opp, nexusHealth: opp.nexusHealth - dmg };
  return {
    ...state,
    players: newPlayers,
    log: [
      ...state.log,
      `${player.username} : Ezreal frappe le Nexus adverse pour ${dmg} dmg.`,
    ],
  };
}

/** Phase 4.0b : Lux niveau 2 (01DE042T2) — quand spellManaSpent du round
 *  crosse un multiple de 6, créer Éclat final (01DE042T3) en main. */
function triggerLuxLevel2OnSpellCast(
  state: InternalState,
  casterSeat: 0 | 1,
  beforeSpellMana: number,
  afterSpellMana: number,
): InternalState {
  const player = state.players[casterSeat];
  const luxL2Count = player.bench.filter(
    (u) => u.cardCode === "01DE042T2",
  ).length;
  if (luxL2Count === 0) return state;
  // Combien de "buckets de 6" on vient de crosser.
  const bucketsBefore = Math.floor(beforeSpellMana / 6);
  const bucketsAfter = Math.floor(afterSpellMana / 6);
  const crossings = bucketsAfter - bucketsBefore;
  if (crossings <= 0) return state;
  // 1 Éclat final par crossing × par Lux L2 sur le banc.
  let newState = state;
  for (let i = 0; i < crossings * luxL2Count; i++) {
    newState = applySpellEffect(
      newState,
      casterSeat,
      { type: "create-card-in-hand", cardCode: "01DE042T3" },
      null,
    );
  }
  return newState;
}

/** Phase 4.0b : Jinx niveau 2 (01PZ040T1) — la première fois que la main
 *  devient vide à chaque round, créer Super roquette de la mort !
 *  (01PZ040T2) en main. Track le flag jinxFiredEmptyHandThisRound dans
 *  alliesDiedThisRound's container — on va l'ajouter au player state. */
function triggerJinxLevel2OnHandEmpty(
  state: InternalState,
  casterSeat: 0 | 1,
): InternalState {
  const player = state.players[casterSeat];
  if (player.hand.length > 0) return state; // main pas encore vide
  if (player.jinxFiredEmptyHandThisRound) return state; // déjà fait ce round
  const jinxL2Count = player.bench.filter(
    (u) => u.cardCode === "01PZ040T1",
  ).length;
  if (jinxL2Count === 0) return state;
  // Set le flag d'abord pour éviter ré-entrée.
  const newPlayers: [InternalPlayer, InternalPlayer] = [
    state.players[0],
    state.players[1],
  ] as [InternalPlayer, InternalPlayer];
  newPlayers[casterSeat] = {
    ...player,
    jinxFiredEmptyHandThisRound: true,
  };
  let newState: InternalState = { ...state, players: newPlayers };
  // Crée 1 Super roquette par Jinx L2.
  for (let i = 0; i < jinxL2Count; i++) {
    newState = applySpellEffect(
      newState,
      casterSeat,
      { type: "create-card-in-hand", cardCode: "01PZ040T2" },
      null,
    );
  }
  return newState;
}

// ────────────────────── Phase 3.7 : résolution des sorts ────────────────

/** Validation serveur : la cible passée par le client est-elle légale pour
 *  cet effet ? (le client utilise getSpellTargetSide pour piloter l'UI). */
function validateSpellTarget(
  state: InternalState,
  casterSeat: 0 | 1,
  effect: SpellEffect,
  targetUid: string | null | undefined,
  targetUid2?: string | null | undefined,
  targetUid3?: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  const side = getSpellTargetSide(effect);
  if (side === "none") return { ok: true };
  if (!targetUid) return { ok: false, error: "Ce sort nécessite une cible." };
  const caster = state.players[casterSeat];
  const opponent = state.players[otherSeat(casterSeat)];
  // Phase 3.37 : si l'effet attend 2 cibles, valide la 2e + distinct.
  const targetCount = getSpellTargetCount(effect);
  if (targetCount === 2) {
    if (!targetUid2) {
      return { ok: false, error: "Ce sort nécessite 2 cibles distinctes." };
    }
    if (targetUid === targetUid2) {
      return { ok: false, error: "Les 2 cibles doivent être distinctes." };
    }
  }
  if (side === "ally") {
    const allyUnit = caster.bench.find((u) => u.uid === targetUid);
    if (!allyUnit) {
      return { ok: false, error: "La cible doit être un allié sur ton banc." };
    }
    // Conditions spécifiques à l'effet (ex Courage : « allié blessé »).
    if (effect.type === "buff-ally-permanent" && effect.requireWounded) {
      if (allyUnit.damage <= 0) {
        return {
          ok: false,
          error: "Cible invalide : l'allié doit être blessé (PV manquants).",
        };
      }
    }
    // Phase 3.17 : Seul contre tous → exactement N alliés sur le banc.
    if (
      effect.type === "buff-ally-permanent" &&
      effect.requireExactBenchSize !== undefined
    ) {
      if (caster.bench.length !== effect.requireExactBenchSize) {
        return {
          ok: false,
          error: `Cible invalide : tu dois avoir exactement ${effect.requireExactBenchSize} allié(s) sur ton banc (actuellement ${caster.bench.length}).`,
        };
      }
    }
    // Phase 3.37 : 2e cible doit aussi être un allié.
    if (targetCount === 2 && targetUid2) {
      const ally2 = caster.bench.find((u) => u.uid === targetUid2);
      if (!ally2) {
        return {
          ok: false,
          error: "La 2e cible doit être un allié sur ton banc.",
        };
      }
    }
    // Phase 3.56 : Sang pour sang — adept (non-Champion).
    if (effect.type === "damage-ally-create-copy-in-hand-if-survives") {
      const card = getCard(allyUnit.cardCode);
      if (card?.supertype === "Champion") {
        return {
          ok: false,
          error: "Cible invalide : un adepte allié (non-Champion) est requis.",
        };
      }
    }
    // Phase 3.48 : Jugement requiert que la cible soit au combat.
    if (effect.type === "ally-strikes-all-enemies-in-combat") {
      if (!state.attackInProgress) {
        return {
          ok: false,
          error: "Ce sort ne peut être lancé que pendant un combat.",
        };
      }
      const combatants = new Set<string>();
      for (const lane of state.attackInProgress.lanes) {
        combatants.add(lane.attackerUid);
        if (lane.blockerUid) combatants.add(lane.blockerUid);
      }
      if (!combatants.has(targetUid)) {
        return {
          ok: false,
          error: "La cible doit être un allié au combat.",
        };
      }
    }
    return { ok: true };
  }
  if (side === "enemy") {
    const enemyUnit = opponent.bench.find((u) => u.uid === targetUid);
    if (!enemyUnit) {
      return { ok: false, error: "La cible doit être une unité ennemie." };
    }
    // Conditions spécifiques (ex Acier cassant : Gel sur ennemi ≤ 3 PV).
    if (effect.type === "frostbite-enemy" && effect.maxHealth !== undefined) {
      const currentHealth = enemyUnit.health - enemyUnit.damage;
      if (currentHealth > effect.maxHealth) {
        return {
          ok: false,
          error: `Cible invalide : l'ennemi doit avoir ${effect.maxHealth} PV ou moins (${currentHealth} actuels).`,
        };
      }
    }
    // Phase 3.20 : Purification ne peut cibler qu'un adepte (non-Champion).
    if (effect.type === "silence-follower-target") {
      const card = getCard(enemyUnit.cardCode);
      if (card?.supertype === "Champion") {
        return {
          ok: false,
          error: `${card.name} est un Champion — Purification ne cible que les adeptes.`,
        };
      }
    }
    // Phase 3.62 + 3.63 : Possession (adepte only) / Capture (any unit).
    if (effect.type === "steal-enemy-adept-this-round") {
      if (!effect.allowChampion) {
        const card = getCard(enemyUnit.cardCode);
        if (card?.supertype === "Champion") {
          return {
            ok: false,
            error: `${card.name} est un Champion — Possession ne cible que les adeptes.`,
          };
        }
      }
      if (caster.bench.length >= RUNETERRA_BATTLE_CONFIG.maxBench) {
        return {
          ok: false,
          error: "Banc plein — impossible de voler une unité.",
        };
      }
    }
    // Phase 3.52 : Tempête d'acier exige que la cible soit un attaquant.
    if (effect.type === "stun-attacker-enemy") {
      if (!state.attackInProgress) {
        return {
          ok: false,
          error: "Ce sort ne peut être lancé que pendant un combat.",
        };
      }
      const isAttacker = state.attackInProgress.lanes.some(
        (lane) => lane.attackerUid === targetUid,
      );
      if (!isAttacker) {
        return {
          ok: false,
          error: "La cible doit être un assaillant ennemi.",
        };
      }
    }
    // Phase 3.37 : 2e cible doit aussi être un ennemi.
    if (targetCount === 2 && targetUid2) {
      const enemy2 = opponent.bench.find((u) => u.uid === targetUid2);
      if (!enemy2) {
        return {
          ok: false,
          error: "La 2e cible doit être une unité ennemie.",
        };
      }
    }
    return { ok: true };
  }
  // Phase 3.59 : "ally-and-any-or-nexus" — target1=ally, target2=any unit
  // or nexus (ally side, enemy side, ou "nexus-self"/"nexus-enemy").
  if (side === "ally-and-any-or-nexus") {
    const allyUnit = caster.bench.find((u) => u.uid === targetUid);
    if (!allyUnit) {
      return {
        ok: false,
        error: "La 1re cible doit être un allié à sacrifier.",
      };
    }
    if (!targetUid2) {
      return {
        ok: false,
        error: "Ce sort nécessite 2 cibles (1 allié + 1 cible).",
      };
    }
    if (targetUid === targetUid2) {
      return { ok: false, error: "Les 2 cibles doivent être distinctes." };
    }
    const isNexus = targetUid2 === "nexus-self" || targetUid2 === "nexus-enemy";
    // Phase 3.63 : Transformer ne peut pas cibler un nexus.
    if (effect.type === "transform-target-into-other-target" && isNexus) {
      return {
        ok: false,
        error: "Transformer ne peut pas cibler un nexus.",
      };
    }
    if (!isNexus) {
      const found =
        caster.bench.find((u) => u.uid === targetUid2) ??
        opponent.bench.find((u) => u.uid === targetUid2);
      if (!found) {
        return {
          ok: false,
          error: "La 2e cible doit être une unité ou un nexus.",
        };
      }
    }
    return { ok: true };
  }
  // Phase 3.46 : "ally-and-enemy" — target1 doit être ally, target2 enemy.
  if (side === "ally-and-enemy") {
    const allyUnit = caster.bench.find((u) => u.uid === targetUid);
    if (!allyUnit) {
      return {
        ok: false,
        error: "La 1re cible doit être un allié sur ton banc.",
      };
    }
    if (!targetUid2) {
      return {
        ok: false,
        error: "Ce sort nécessite 2 cibles (1 allié + 1 ennemi).",
      };
    }
    const enemyUnit = opponent.bench.find((u) => u.uid === targetUid2);
    if (!enemyUnit) {
      return {
        ok: false,
        error: "La 2e cible doit être une unité ennemie.",
      };
    }
    // Phase 3.49 : Marque de la mort exige que target1 ait Ephemeral.
    if (effect.type === "swap-ephemeral") {
      if (!allyUnit.keywords.includes("Ephemeral")) {
        return {
          ok: false,
          error: "L'allié ciblé doit avoir le mot-clé Éphémère.",
        };
      }
    }
    // Phase 3.47 : combat-only constraint pour unit-strike-unit-in-combat.
    if (effect.type === "unit-strike-unit-in-combat") {
      if (!state.attackInProgress) {
        return {
          ok: false,
          error: "Ce sort ne peut être lancé que pendant un combat.",
        };
      }
      const combatantUids = new Set<string>();
      for (const lane of state.attackInProgress.lanes) {
        combatantUids.add(lane.attackerUid);
        if (lane.blockerUid) combatantUids.add(lane.blockerUid);
      }
      if (!combatantUids.has(targetUid) || !combatantUids.has(targetUid2)) {
        return {
          ok: false,
          error: "Les 2 cibles doivent être au combat.",
        };
      }
    }
    return { ok: true };
  }
  // Phase 3.41 : "any-or-nexus" accepte unités OU "nexus-self" / "nexus-enemy".
  if (side === "any-or-nexus") {
    if (
      targetUid !== "nexus-self" &&
      targetUid !== "nexus-enemy" &&
      !caster.bench.find((u) => u.uid === targetUid) &&
      !opponent.bench.find((u) => u.uid === targetUid)
    ) {
      return {
        ok: false,
        error: "La cible doit être une unité ou un nexus.",
      };
    }
    // Phase 3.64 : si l'effet attend 2 cibles, valide la 2e (any-or-nexus
    // distinct).
    if (targetCount === 2 || targetCount === 3) {
      if (
        targetUid2 !== "nexus-self" &&
        targetUid2 !== "nexus-enemy" &&
        !caster.bench.find((u) => u.uid === targetUid2) &&
        !opponent.bench.find((u) => u.uid === targetUid2)
      ) {
        return {
          ok: false,
          error: "La 2e cible doit être une unité ou un nexus.",
        };
      }
    }
    // Phase 3.70 : 3 cibles distinctes pour Crépuscule.
    if (targetCount === 3) {
      if (!targetUid3) {
        return {
          ok: false,
          error: "Ce sort nécessite 3 cibles distinctes.",
        };
      }
      if (
        targetUid === targetUid3 ||
        targetUid2 === targetUid3
      ) {
        return { ok: false, error: "Les 3 cibles doivent être distinctes." };
      }
      if (
        targetUid3 !== "nexus-self" &&
        targetUid3 !== "nexus-enemy" &&
        !caster.bench.find((u) => u.uid === targetUid3) &&
        !opponent.bench.find((u) => u.uid === targetUid3)
      ) {
        return {
          ok: false,
          error: "La 3e cible doit être une unité ou un nexus.",
        };
      }
    }
    return { ok: true };
  }
  // any (unités seulement)
  const found =
    caster.bench.find((u) => u.uid === targetUid) ??
    opponent.bench.find((u) => u.uid === targetUid);
  if (!found) {
    return { ok: false, error: "La cible doit être une unité." };
  }
  // Conditions spécifiques side=any (ex Abattage : kill ≤ 3 puissance).
  if (effect.type === "kill-target-any" && effect.maxPower !== undefined) {
    if (found.power > effect.maxPower) {
      return {
        ok: false,
        error: `Cible invalide : l'unité doit avoir ${effect.maxPower} puissance ou moins (${found.power} actuel).`,
      };
    }
  }
  // Phase 3.56 : Guillotine noxienne — cible doit être blessée.
  if (effect.type === "kill-wounded-target-and-create-spell-in-hand") {
    if (found.damage <= 0) {
      return {
        ok: false,
        error: "Cible invalide : l'unité doit être blessée.",
      };
    }
  }
  // Phase 3.56 : Vagues souvenirs — cible doit être un adepte (non-Champion).
  if (effect.type === "create-ephemeral-copy-of-target-in-hand") {
    const card = getCard(found.cardCode);
    if (card?.supertype === "Champion") {
      return {
        ok: false,
        error: "Cible invalide : un adepte (non-Champion) est requis.",
      };
    }
  }
  return { ok: true };
}

/** Phase 3.64+3.70 : helper qui applique amount dmg à un targetUid qui
 *  peut être "nexus-self" / "nexus-enemy" ou un uid d'unité (ally/enemy).
 *  Gère Last Breath + counters bumpés + game over si nexus ≤ 0. Si target
 *  introuvable (uid invalide), no-op (return state). */
function applyDmgToAnyOrNexus(
  state: InternalState,
  casterSeat: 0 | 1,
  oppSeat: 0 | 1,
  targetUidStr: string,
  amount: number,
): InternalState {
  const ps: [InternalPlayer, InternalPlayer] = [
    state.players[0],
    state.players[1],
  ] as [InternalPlayer, InternalPlayer];
  if (targetUidStr === "nexus-self") {
    const me = ps[casterSeat];
    const newH = me.nexusHealth - amount;
    ps[casterSeat] = { ...me, nexusHealth: newH };
    if (newH <= 0) {
      return {
        ...state,
        players: ps,
        phase: "ended",
        winnerSeatIdx: oppSeat,
      };
    }
    return { ...state, players: ps };
  }
  if (targetUidStr === "nexus-enemy") {
    const opp = ps[oppSeat];
    const newH = opp.nexusHealth - amount;
    ps[oppSeat] = { ...opp, nexusHealth: newH };
    if (newH <= 0) {
      return {
        ...state,
        players: ps,
        phase: "ended",
        winnerSeatIdx: casterSeat,
      };
    }
    return { ...state, players: ps };
  }
  // Unit
  let tSeat: 0 | 1 | null = null;
  if (ps[casterSeat].bench.find((u) => u.uid === targetUidStr))
    tSeat = casterSeat;
  else if (ps[oppSeat].bench.find((u) => u.uid === targetUidStr))
    tSeat = oppSeat;
  if (tSeat === null) return state;
  const tp = ps[tSeat];
  const updated = tp.bench.map((u) => {
    if (u.uid !== targetUidStr) return u;
    const c = { ...u };
    applyDamageToUnit(c, amount);
    return c;
  });
  const survivors = updated.filter((u) => u.damage < u.health);
  const dead = updated.find((u) => u.damage >= u.health);
  ps[tSeat] = {
    ...tp,
    bench: survivors,
    alliesDiedThisRound: tp.alliesDiedThisRound + (dead ? 1 : 0),
    championCounters: {
      ...tp.championCounters,
      alliesDied: tp.championCounters.alliesDied + (dead ? 1 : 0),
    },
  };
  let newS: InternalState = { ...state, players: ps };
  if (dead) newS = triggerLastBreath(newS, dead, tSeat);
  return newS;
}

function applySpellEffect(
  state: InternalState,
  casterSeat: 0 | 1,
  effect: SpellEffect,
  targetUid: string | null,
  targetUid2: string | null = null,
  targetUid3: string | null = null,
  spellChoice: number = 0,
  triggerSourceUid: string | null = null,
): InternalState {
  if (!targetUid) return state;
  const oppSeat = otherSeat(casterSeat);
  const newPlayers: [InternalPlayer, InternalPlayer] = [
    state.players[0],
    state.players[1],
  ] as [InternalPlayer, InternalPlayer];

  switch (effect.type) {
    case "buff-ally-round": {
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        return {
          ...u,
          power: u.power + effect.power,
          health: u.health + effect.health,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff + effect.power,
          endOfRoundHealthBuff: u.endOfRoundHealthBuff + effect.health,
        };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "buff-ally-permanent": {
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        // Permanent : modifie power/health directement (pas via endOfRoundBuffs).
        return {
          ...u,
          power: u.power + effect.power,
          health: u.health + effect.health,
        };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "grant-keyword-ally":
    case "grant-keyword-ally-round": {
      // NOTE Phase 3.8c : on traite -round identique à permanent pour
      // l'instant. Pour Barrier le résultat est le même côté gameplay
      // (Barrier réinitialise barrierUsed à chaque startRound de toute
      // façon). Pour d'autres mots-clés, fixer en 3.8c.x.
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        if (u.keywords.includes(effect.keyword)) return u;
        return { ...u, keywords: [...u.keywords, effect.keyword] };
      });
      // Phase 3.9c : barriersGranted compteur (Shen).
      const grantedBarrier = effect.keyword === "Barrier" ? 1 : 0;
      newPlayers[casterSeat] = {
        ...player,
        bench: newBench,
        championCounters: {
          ...player.championCounters,
          barriersGranted:
            player.championCounters.barriersGranted + grantedBarrier,
        },
      };
      // Phase 5.10 : Shen L2 (01IO032T1) — quand un allié reçoit Barrière,
      // conférez-lui +3|+0 pour ce round. 1 buff par Shen L2 sur le banc.
      let resultState: InternalState = { ...state, players: newPlayers };
      if (grantedBarrier > 0) {
        const shenL2Count = newPlayers[casterSeat].bench.filter(
          (u) => u.cardCode === "01IO032T1",
        ).length;
        if (shenL2Count > 0) {
          const totalBuff = 3 * shenL2Count;
          const buffedBench = newPlayers[casterSeat].bench.map((u) => {
            if (u.uid !== targetUid) return u;
            return {
              ...u,
              power: u.power + totalBuff,
              endOfRoundPowerBuff: u.endOfRoundPowerBuff + totalBuff,
            };
          });
          const newPlayersWithBuff: [InternalPlayer, InternalPlayer] = [
            newPlayers[0],
            newPlayers[1],
          ] as [InternalPlayer, InternalPlayer];
          newPlayersWithBuff[casterSeat] = {
            ...newPlayers[casterSeat],
            bench: buffedBench,
          };
          resultState = {
            ...resultState,
            players: newPlayersWithBuff,
            log: [
              ...resultState.log,
              `${player.username} : Shen donne +${totalBuff}|+0 à l'allié protégé.`,
            ],
          };
        }
      }
      return resultState;
    }
    case "frostbite-enemy": {
      // Cherche l'ennemi (côté opposé de caster).
      const player = newPlayers[oppSeat];
      let appliedNew = false;
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        if (u.frozen) return u; // déjà gelé, no-op (pas de counter incrément)
        appliedNew = true;
        // Set power à 0 pour le round, restauré à endRound via
        // endOfRoundPowerBuff. Math : new endOfRoundPowerBuff = ancien + (-power)
        // → à endRound : power - newDelta = 0 - (oldDelta - power) = power - oldDelta
        // = restauration au power d'avant le Gel.
        const restorePower = u.power;
        return {
          ...u,
          power: 0,
          frozen: true,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff - restorePower,
        };
      });
      newPlayers[oppSeat] = { ...player, bench: newBench };
      // Phase 3.9c : enemiesFrostbitten compteur (Ashe).
      if (appliedNew) {
        const caster = newPlayers[casterSeat];
        newPlayers[casterSeat] = {
          ...caster,
          championCounters: {
            ...caster.championCounters,
            enemiesFrostbitten: caster.championCounters.enemiesFrostbitten + 1,
          },
        };
      }
      return { ...state, players: newPlayers };
    }
    case "frostbite-2-enemies": {
      // Phase 3.37 : gel 2 ennemis distincts (Vents mordants). Mirror
      // de frostbite-enemy mais sur targetUid + targetUid2.
      const player = newPlayers[oppSeat];
      let frostbitCount = 0;
      const targets = new Set([targetUid, targetUid2].filter(Boolean));
      const newBench = player.bench.map((u) => {
        if (!targets.has(u.uid)) return u;
        if (u.frozen) return u;
        frostbitCount++;
        const restorePower = u.power;
        return {
          ...u,
          power: 0,
          frozen: true,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff - restorePower,
        };
      });
      newPlayers[oppSeat] = { ...player, bench: newBench };
      if (frostbitCount > 0) {
        const caster = newPlayers[casterSeat];
        newPlayers[casterSeat] = {
          ...caster,
          championCounters: {
            ...caster.championCounters,
            enemiesFrostbitten:
              caster.championCounters.enemiesFrostbitten + frostbitCount,
          },
        };
      }
      return { ...state, players: newPlayers };
    }
    case "buff-2-allies-round": {
      // Phase 3.37 : +power/+health round à 2 alliés distincts.
      const player = newPlayers[casterSeat];
      const targets = new Set([targetUid, targetUid2].filter(Boolean));
      const newBench = player.bench.map((u) => {
        if (!targets.has(u.uid)) return u;
        return {
          ...u,
          power: u.power + effect.power,
          health: u.health + effect.health,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff + effect.power,
          endOfRoundHealthBuff: u.endOfRoundHealthBuff + effect.health,
        };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "buff-2-allies-permanent": {
      // Phase 3.37 : +power/+health permanent à 2 alliés distincts.
      const player = newPlayers[casterSeat];
      const targets = new Set([targetUid, targetUid2].filter(Boolean));
      const newBench = player.bench.map((u) => {
        if (!targets.has(u.uid)) return u;
        return {
          ...u,
          power: u.power + effect.power,
          health: u.health + effect.health,
        };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "damage-ally-buff-other-ally-round": {
      // Phase 3.37 : Transfusion. Inflige damage à allié1 (target1) puis
      // buff round allié2 (target2). Si allié1 meurt, Last Breath +
      // counters bumpés. Le buff s'applique même si allié1 meurt.
      const player = newPlayers[casterSeat];
      const damagedBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, effect.damage);
        return copy;
      });
      const survivors = damagedBench.filter((u) => u.damage < u.health);
      const deadUnit = damagedBench.find((u) => u.damage >= u.health);
      // Apply buff sur survivors (allié2 doit survivre à la 1re passe pour
      // recevoir le buff — il n'est pas la cible damage de toute façon).
      const buffedBench = survivors.map((u) => {
        if (u.uid !== targetUid2) return u;
        return {
          ...u,
          power: u.power + effect.buffPower,
          health: u.health + effect.buffHealth,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff + effect.buffPower,
          endOfRoundHealthBuff: u.endOfRoundHealthBuff + effect.buffHealth,
        };
      });
      newPlayers[casterSeat] = {
        ...player,
        bench: buffedBench,
        alliesDiedThisRound:
          player.alliesDiedThisRound + (deadUnit ? 1 : 0),
        championCounters: {
          ...player.championCounters,
          alliesDied: player.championCounters.alliesDied + (deadUnit ? 1 : 0),
          unitsDied: player.championCounters.unitsDied + (deadUnit ? 1 : 0),
        },
      };
      if (deadUnit) {
        newPlayers[oppSeat] = {
          ...newPlayers[oppSeat],
          championCounters: {
            ...newPlayers[oppSeat].championCounters,
            unitsDied: newPlayers[oppSeat].championCounters.unitsDied + 1,
          },
        };
      }
      let newState: InternalState = { ...state, players: newPlayers };
      if (deadUnit) {
        newState = triggerLastBreath(newState, deadUnit, casterSeat);
      }
      return newState;
    }
    case "deal-damage-enemy-nexus": {
      // Pas de cible : dégâts directs au nexus ennemi.
      const player = newPlayers[oppSeat];
      const newNexus = player.nexusHealth - effect.amount;
      newPlayers[oppSeat] = { ...player, nexusHealth: newNexus };
      // Vérifie game over (le check final se fait dans le pipeline serveur,
      // mais on prépare l'état si nexus <= 0).
      if (newNexus <= 0) {
        return {
          ...state,
          players: newPlayers,
          phase: "ended",
          winnerSeatIdx: casterSeat,
          log: [
            ...state.log,
            `${state.players[casterSeat].username} remporte la partie (sort direct au nexus).`,
          ],
        };
      }
      return { ...state, players: newPlayers };
    }
    case "kill-target-any": {
      // Cherche la cible des deux côtés et la retire du banc + crédit
      // alliesDied + déclenche Last Breath de la cible si applicable.
      let killedUnit: RuneterraBattleUnit | null = null;
      let killedSeat: 0 | 1 | null = null;
      for (const seat of [casterSeat, oppSeat] as const) {
        const player = newPlayers[seat];
        const idx = player.bench.findIndex((u) => u.uid === targetUid);
        if (idx === -1) continue;
        killedUnit = player.bench[idx];
        killedSeat = seat;
        newPlayers[seat] = bumpAllyDeaths(
          {
            ...player,
            bench: [
              ...player.bench.slice(0, idx),
              ...player.bench.slice(idx + 1),
            ],
          },
          1,
        );
        break;
      }
      let newState: InternalState = { ...state, players: newPlayers };
      if (killedUnit && killedSeat !== null) {
        newState = triggerLastBreath(newState, killedUnit, killedSeat);
      }
      return newState;
    }
    case "heal-ally-or-nexus": {
      // Cible = allié sur ton banc → heal damage de X (cap 0). Ou nexus self
      // si targetUid === "nexus-self" (côté UI à formaliser, pour Phase 3.9a
      // on ne supporte que les unités alliées).
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        return { ...u, damage: Math.max(0, u.damage - effect.amount) };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "recall-ally": {
      // Retire l'allié du banc, l'ajoute à la main du caster.
      const player = newPlayers[casterSeat];
      const idx = player.bench.findIndex((u) => u.uid === targetUid);
      if (idx === -1) return state;
      const unit = player.bench[idx];
      newPlayers[casterSeat] = {
        ...player,
        bench: [
          ...player.bench.slice(0, idx),
          ...player.bench.slice(idx + 1),
        ],
        hand: [
          ...player.hand,
          { uid: unit.uid, cardCode: unit.cardCode },
        ],
        // Phase 3.11 : "rappelé" compte pour Yasuo level-up.
        championCounters: {
          ...player.championCounters,
          enemyStunned: player.championCounters.enemyStunned + 1,
        },
      };
      return { ...state, players: newPlayers };
    }
    case "recall-any": {
      // Retourne l'unité dans la main de SON propriétaire (le caster reçoit
      // le crédit Yasuo "rappelé" peu importe le côté).
      for (const seat of [casterSeat, oppSeat] as const) {
        const player = newPlayers[seat];
        const idx = player.bench.findIndex((u) => u.uid === targetUid);
        if (idx === -1) continue;
        const unit = player.bench[idx];
        newPlayers[seat] = {
          ...player,
          bench: [
            ...player.bench.slice(0, idx),
            ...player.bench.slice(idx + 1),
          ],
          hand: [...player.hand, { uid: unit.uid, cardCode: unit.cardCode }],
        };
        break;
      }
      // Compteur Yasuo sur le caster.
      const caster = newPlayers[casterSeat];
      newPlayers[casterSeat] = {
        ...caster,
        championCounters: {
          ...caster.championCounters,
          enemyStunned: caster.championCounters.enemyStunned + 1,
        },
      };
      return { ...state, players: newPlayers };
    }
    case "stun-enemy": {
      // Étourdit l'ennemi pour le round (ne peut plus attaquer/bloquer).
      const player = newPlayers[oppSeat];
      let appliedNew = false;
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        if (u.stunned) return u; // déjà stunned
        appliedNew = true;
        return { ...u, stunned: true };
      });
      newPlayers[oppSeat] = { ...player, bench: newBench };
      if (appliedNew) {
        const caster = newPlayers[casterSeat];
        newPlayers[casterSeat] = {
          ...caster,
          championCounters: {
            ...caster.championCounters,
            enemyStunned: caster.championCounters.enemyStunned + 1,
          },
        };
      }
      let stateAfterStun: InternalState = { ...state, players: newPlayers };
      // Phase 3.76 : Yasuo (01IO015) — 2 dmg à l'ennemi stunned.
      if (appliedNew && targetUid) {
        stateAfterStun = triggerYasuoOnEnemyStunned(
          stateAfterStun,
          casterSeat,
          targetUid,
        );
      }
      return stateAfterStun;
    }
    case "combo-buff-keyword-ally-round": {
      // +power/+health round + grant keyword (round-only via convention,
      // pour Phase 3.14 : keyword traité comme permanent — meme limitation
      // que grant-keyword-ally-round, OK pour la plupart des keywords).
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        const newKw = u.keywords.includes(effect.keyword)
          ? u.keywords
          : [...u.keywords, effect.keyword];
        return {
          ...u,
          power: u.power + effect.power,
          health: u.health + effect.health,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff + effect.power,
          endOfRoundHealthBuff: u.endOfRoundHealthBuff + effect.health,
          keywords: newKw,
        };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "kill-all-units": {
      // Tue toutes les unités des 2 côtés. Last Breath déclenché pour
      // chacune (séquentiel : caster d'abord puis adversaire).
      const casterDead = [...newPlayers[casterSeat].bench];
      const oppDead = [...newPlayers[oppSeat].bench];
      newPlayers[casterSeat] = {
        ...newPlayers[casterSeat],
        bench: [],
        alliesDiedThisRound:
          newPlayers[casterSeat].alliesDiedThisRound + casterDead.length,
        championCounters: {
          ...newPlayers[casterSeat].championCounters,
          alliesDied:
            newPlayers[casterSeat].championCounters.alliesDied +
            casterDead.length,
          unitsDied:
            newPlayers[casterSeat].championCounters.unitsDied +
            casterDead.length +
            oppDead.length,
        },
      };
      newPlayers[oppSeat] = {
        ...newPlayers[oppSeat],
        bench: [],
        alliesDiedThisRound:
          newPlayers[oppSeat].alliesDiedThisRound + oppDead.length,
        championCounters: {
          ...newPlayers[oppSeat].championCounters,
          alliesDied:
            newPlayers[oppSeat].championCounters.alliesDied + oppDead.length,
          unitsDied:
            newPlayers[oppSeat].championCounters.unitsDied +
            casterDead.length +
            oppDead.length,
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      for (const dead of casterDead) {
        newState = triggerLastBreath(newState, dead, casterSeat);
        if (newState.phase === "ended") return newState;
      }
      for (const dead of oppDead) {
        newState = triggerLastBreath(newState, dead, oppSeat);
        if (newState.phase === "ended") return newState;
      }
      return newState;
    }
    case "damage-all-enemies-heal-nexus": {
      // Inflige X dégâts à tous les ennemis (gère Barrier/Tough via
      // applyDamageToUnit) + heal nexus du caster de Y (cap initial).
      const cfg = RUNETERRA_BATTLE_CONFIG;
      const oppPlayer = newPlayers[oppSeat];
      const newOppBench = oppPlayer.bench.map((u) => {
        const copy = { ...u };
        applyDamageToUnit(copy, effect.damageAmount);
        return copy;
      });
      // Filtre morts + Last Breath
      const oppDeadUnits = newOppBench.filter((u) => u.damage >= u.health);
      const oppSurvivors = newOppBench.filter((u) => u.damage < u.health);
      newPlayers[oppSeat] = {
        ...oppPlayer,
        bench: oppSurvivors,
        alliesDiedThisRound:
          oppPlayer.alliesDiedThisRound + oppDeadUnits.length,
        championCounters: {
          ...oppPlayer.championCounters,
          alliesDied: oppPlayer.championCounters.alliesDied + oppDeadUnits.length,
          unitsDied: oppPlayer.championCounters.unitsDied + oppDeadUnits.length,
        },
      };
      // Heal du nexus caster (cap initial).
      const casterPl = newPlayers[casterSeat];
      newPlayers[casterSeat] = {
        ...casterPl,
        nexusHealth: Math.min(
          cfg.initialNexusHealth,
          casterPl.nexusHealth + effect.healAmount,
        ),
        championCounters: {
          ...casterPl.championCounters,
          unitsDied: casterPl.championCounters.unitsDied + oppDeadUnits.length,
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      for (const dead of oppDeadUnits) {
        newState = triggerLastBreath(newState, dead, oppSeat);
        if (newState.phase === "ended") return newState;
      }
      return newState;
    }
    case "grant-keyword-all-allies-round": {
      // Grant le keyword à tous les alliés sur le banc (round-only par
      // convention — comme grant-keyword-ally-round).
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        if (u.keywords.includes(effect.keyword)) return u;
        return { ...u, keywords: [...u.keywords, effect.keyword] };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "grant-keywords-ally-round": {
      // Phase 3.16 : grant plusieurs keywords à un allié spécifique
      // (target). Évite duplications.
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        const additions = effect.keywords.filter(
          (kw) => !u.keywords.includes(kw),
        );
        if (additions.length === 0) return u;
        return { ...u, keywords: [...u.keywords, ...additions] };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "damage-all-units": {
      // Phase 3.17 : Avalanche — dégâts à toutes les unités (2 côtés).
      // Respecte Barrier/Tough via applyDamageToUnit, déclenche Last
      // Breath pour chaque mort. Bail-out si phase=ended.
      const allDeadUnits: { unit: RuneterraBattleUnit; seat: 0 | 1 }[] = [];
      const deadCountBySeat: [number, number] = [0, 0];
      for (const seat of [0, 1] as const) {
        const player = newPlayers[seat];
        const newBench = player.bench.map((u) => {
          const copy = { ...u };
          applyDamageToUnit(copy, effect.amount);
          return copy;
        });
        const survivors = newBench.filter((u) => u.damage < u.health);
        const deadUnits = newBench.filter((u) => u.damage >= u.health);
        for (const dead of deadUnits) allDeadUnits.push({ unit: dead, seat });
        deadCountBySeat[seat] = deadUnits.length;
        newPlayers[seat] = {
          ...player,
          bench: survivors,
          alliesDiedThisRound:
            player.alliesDiedThisRound + deadUnits.length,
          championCounters: {
            ...player.championCounters,
            alliesDied:
              player.championCounters.alliesDied + deadUnits.length,
          },
        };
      }
      // unitsDied = total morts vu par chaque joueur (cohérent avec
      // resolveCombat qui crédite la totalité aux 2 côtés).
      const totalDied = deadCountBySeat[0] + deadCountBySeat[1];
      for (const seat of [0, 1] as const) {
        newPlayers[seat] = {
          ...newPlayers[seat],
          championCounters: {
            ...newPlayers[seat].championCounters,
            unitsDied: newPlayers[seat].championCounters.unitsDied + totalDied,
          },
        };
      }
      let newState: InternalState = { ...state, players: newPlayers };
      for (const { unit, seat } of allDeadUnits) {
        newState = triggerLastBreath(newState, unit, seat);
        if (newState.phase === "ended") return newState;
      }
      return newState;
    }
    case "gain-attack-token-self": {
      // Phase 3.17 : Rally (Poursuite inlassable). Si déjà attackToken,
      // no-op (l'effet est juste de regagner le jeton si consommé).
      const player = newPlayers[casterSeat];
      newPlayers[casterSeat] = { ...player, attackToken: true };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} regagne le jeton d'attaque (Ralliement).`,
        ],
      };
    }
    case "silence-follower-target": {
      // Phase 3.20 : Purification. Supprime tous les mots-clés et reset
      // les statuts round-only (frozen, stunned, barrierUsed) + annule
      // les endOfRoundBuffs (revert power/health aux valeurs de base).
      const player = newPlayers[oppSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        // Annule les buffs round-only (subtract et reset).
        return {
          ...u,
          keywords: [],
          power: u.power - u.endOfRoundPowerBuff,
          health: u.health - u.endOfRoundHealthBuff,
          endOfRoundPowerBuff: 0,
          endOfRoundHealthBuff: 0,
          frozen: false,
          stunned: false,
          barrierUsed: false,
        };
      });
      newPlayers[oppSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "heal-ally-full": {
      // Phase 3.23 : Regain de courage. Soigne entièrement l'allié ciblé
      // (damage = 0). Pas de cap : si l'unité a été buffée en health par
      // ailleurs, le full-heal restaure tout.
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        return { ...u, damage: 0 };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "combo-buff-keyword-all-allies-round": {
      // Phase 3.23 : Esprit de meute. +power/+health pour ce round +
      // grant un mot-clé à TOUS les alliés sur le banc. Mirror de
      // grant-keyword-all-allies-round mais avec un buff stat additionnel.
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        const newKw = u.keywords.includes(effect.keyword)
          ? u.keywords
          : [...u.keywords, effect.keyword];
        return {
          ...u,
          power: u.power + effect.power,
          health: u.health + effect.health,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff + effect.power,
          endOfRoundHealthBuff: u.endOfRoundHealthBuff + effect.health,
          keywords: newKw,
        };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "heal-ally-and-draw": {
      // Phase 3.42 : Rituel du renouveau. Soigne l'allié (damage -=
      // healAmount, cap 0) puis pioche drawCount cartes.
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        return { ...u, damage: Math.max(0, u.damage - effect.healAmount) };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      const intermediate: InternalState = { ...state, players: newPlayers };
      return drawCards(intermediate, casterSeat, effect.drawCount).state;
    }
    case "recall-ally-and-summon-token": {
      // Phase 3.45 : Inversion spectrale. Retire l'allié ciblé du banc,
      // l'ajoute à la main, puis summon le token à sa place (si slot dispo).
      const player = newPlayers[casterSeat];
      const idx = player.bench.findIndex((u) => u.uid === targetUid);
      if (idx === -1) return state;
      const recalled = player.bench[idx];
      const benchSansAlly = [
        ...player.bench.slice(0, idx),
        ...player.bench.slice(idx + 1),
      ];
      // Yasuo level-up : "rappelé" compte aussi.
      const playerAfterRecall: InternalPlayer = {
        ...player,
        bench: benchSansAlly,
        hand: [...player.hand, { uid: recalled.uid, cardCode: recalled.cardCode }],
        championCounters: {
          ...player.championCounters,
          enemyStunned: player.championCounters.enemyStunned + 1,
        },
      };
      newPlayers[casterSeat] = playerAfterRecall;
      // Summon le token.
      const tokenCard = getCard(effect.tokenCardCode);
      if (!tokenCard || tokenCard.type !== "Unit") {
        return { ...state, players: newPlayers };
      }
      const newUid = `${casterSeat}-rs-${state.round}-${state.log.length}`;
      const newUnit = createUnit(newUid, effect.tokenCardCode);
      newPlayers[casterSeat] = {
        ...playerAfterRecall,
        bench: [...playerAfterRecall.bench, newUnit],
      };
      const recalledName = getCard(recalled.cardCode)?.name ?? recalled.cardCode;
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} rappelle ${recalledName} et invoque ${tokenCard.name}.`,
        ],
      };
    }
    case "damage-or-frostbite-by-power-zero": {
      // Phase 3.45 : Acier glacial. Si target power=0, dmg ; sinon freeze.
      const opp = newPlayers[oppSeat];
      const target = opp.bench.find((u) => u.uid === targetUid);
      if (!target) return state;
      if (target.power === 0) {
        // Dmg branch.
        const updatedBench = opp.bench.map((u) => {
          if (u.uid !== targetUid) return u;
          const copy = { ...u };
          applyDamageToUnit(copy, effect.amount);
          return copy;
        });
        const survivors = updatedBench.filter((u) => u.damage < u.health);
        const dead = updatedBench.find((u) => u.damage >= u.health);
        newPlayers[oppSeat] = { ...opp, bench: survivors };
        let newState: InternalState = { ...state, players: newPlayers };
        if (dead) newState = triggerLastBreath(newState, dead, oppSeat);
        return newState;
      }
      // Frostbite branch (mirror de frostbite-enemy).
      let froze = false;
      const newBench = opp.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        if (u.frozen) return u;
        froze = true;
        const restorePower = u.power;
        return {
          ...u,
          power: 0,
          frozen: true,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff - restorePower,
        };
      });
      newPlayers[oppSeat] = { ...opp, bench: newBench };
      if (froze) {
        const caster = newPlayers[casterSeat];
        newPlayers[casterSeat] = {
          ...caster,
          championCounters: {
            ...caster.championCounters,
            enemiesFrostbitten: caster.championCounters.enemiesFrostbitten + 1,
          },
        };
      }
      return { ...state, players: newPlayers };
    }
    case "kill-power-zero-and-frostbite-all-enemies": {
      // Phase 3.45 : Ours blanc. Tue les ennemis avec power=0, puis
      // gèle tous les ennemis restants.
      const opp = newPlayers[oppSeat];
      const dead = opp.bench.filter((u) => u.power === 0);
      const survivors = opp.bench.filter((u) => u.power > 0);
      // Apply freeze sur survivors.
      let frostCount = 0;
      const frozenSurvivors = survivors.map((u) => {
        if (u.frozen) return u;
        frostCount++;
        const restorePower = u.power;
        return {
          ...u,
          power: 0,
          frozen: true,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff - restorePower,
        };
      });
      newPlayers[oppSeat] = {
        ...opp,
        bench: frozenSurvivors,
        alliesDiedThisRound: opp.alliesDiedThisRound + dead.length,
        championCounters: {
          ...opp.championCounters,
          alliesDied: opp.championCounters.alliesDied + dead.length,
          unitsDied: opp.championCounters.unitsDied + dead.length,
        },
      };
      const caster = newPlayers[casterSeat];
      newPlayers[casterSeat] = {
        ...caster,
        championCounters: {
          ...caster.championCounters,
          unitsDied: caster.championCounters.unitsDied + dead.length,
          enemiesFrostbitten:
            caster.championCounters.enemiesFrostbitten + frostCount,
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      for (const d of dead) {
        newState = triggerLastBreath(newState, d, oppSeat);
        if (newState.phase === "ended") return newState;
      }
      return newState;
    }
    case "kill-wounded-target-and-create-spell-in-hand": {
      // Phase 3.56 : Guillotine noxienne. Tue cible blessée + crée
      // spellCardCode dans la main du caster. Validation déjà faite.
      let targetSeat: 0 | 1 | null = null;
      const casterUnit = newPlayers[casterSeat].bench.find(
        (u) => u.uid === targetUid,
      );
      if (casterUnit) targetSeat = casterSeat;
      else if (newPlayers[oppSeat].bench.find((u) => u.uid === targetUid))
        targetSeat = oppSeat;
      if (targetSeat === null) return state;
      const targetPlayer = newPlayers[targetSeat];
      const idx = targetPlayer.bench.findIndex((u) => u.uid === targetUid);
      const dyingUnit = targetPlayer.bench[idx];
      const newBench = [
        ...targetPlayer.bench.slice(0, idx),
        ...targetPlayer.bench.slice(idx + 1),
      ];
      newPlayers[targetSeat] = {
        ...targetPlayer,
        bench: newBench,
        alliesDiedThisRound: targetPlayer.alliesDiedThisRound + 1,
        championCounters: {
          ...targetPlayer.championCounters,
          alliesDied: targetPlayer.championCounters.alliesDied + 1,
          unitsDied: targetPlayer.championCounters.unitsDied + 1,
        },
      };
      // Crée le spell dans la main du caster.
      const newUid = `${casterSeat}-cr-${state.round}-${state.log.length}`;
      const caster = newPlayers[casterSeat];
      newPlayers[casterSeat] = {
        ...caster,
        hand: [...caster.hand, { uid: newUid, cardCode: effect.spellCardCode }],
        championCounters: {
          ...caster.championCounters,
          unitsDied: caster.championCounters.unitsDied + 1,
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      newState = triggerLastBreath(newState, dyingUnit, targetSeat);
      return newState;
    }
    case "damage-ally-create-copy-in-hand-if-survives": {
      // Phase 3.56 : Sang pour sang. 1 dmg à l'adepte allié. S'il survit,
      // crée une copie en main.
      const player = newPlayers[casterSeat];
      const target = player.bench.find((u) => u.uid === targetUid);
      if (!target) return state;
      const updatedBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, effect.damage);
        return copy;
      });
      const survivor = updatedBench.find(
        (u) => u.uid === targetUid && u.damage < u.health,
      );
      const dead = updatedBench.find(
        (u) => u.uid === targetUid && u.damage >= u.health,
      );
      const newBench = updatedBench.filter((u) => u.damage < u.health);
      let newCard: { uid: string; cardCode: string } | null = null;
      if (survivor) {
        newCard = {
          uid: `${casterSeat}-cp-${state.round}-${state.log.length}`,
          cardCode: target.cardCode,
        };
      }
      newPlayers[casterSeat] = {
        ...player,
        bench: newBench,
        hand: newCard ? [...player.hand, newCard] : player.hand,
        alliesDiedThisRound: player.alliesDiedThisRound + (dead ? 1 : 0),
        championCounters: {
          ...player.championCounters,
          alliesDied: player.championCounters.alliesDied + (dead ? 1 : 0),
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      if (dead) newState = triggerLastBreath(newState, dead, casterSeat);
      return newState;
    }
    case "create-ephemeral-copy-of-target-in-hand": {
      // Phase 3.56 : Vagues souvenirs. Crée une copie de l'adepte ciblé
      // dans la main avec un cardBuff Ephemeral pour qu'il soit Ephemeral
      // quand joué.
      let target: RuneterraBattleUnit | undefined;
      const casterUnit = newPlayers[casterSeat].bench.find(
        (u) => u.uid === targetUid,
      );
      if (casterUnit) target = casterUnit;
      else
        target = newPlayers[oppSeat].bench.find((u) => u.uid === targetUid);
      if (!target) return state;
      const newUid = `${casterSeat}-ec-${state.round}-${state.log.length}`;
      const caster = newPlayers[casterSeat];
      const newCardBuffs = { ...caster.cardBuffs };
      newCardBuffs[newUid] = {
        powerDelta: 0,
        healthDelta: 0,
        costDelta: 0,
        addKeywords: ["Ephemeral"],
      };
      newPlayers[casterSeat] = {
        ...caster,
        hand: [...caster.hand, { uid: newUid, cardCode: target.cardCode }],
        cardBuffs: newCardBuffs,
      };
      const cardName = getCard(target.cardCode)?.name ?? target.cardCode;
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${caster.username} ajoute une copie éphémère de ${cardName} à sa main.`,
        ],
      };
    }
    case "draw-cards": {
      // Phase 3.66 : pioche count cartes pour le caster.
      return drawCards(
        { ...state, players: newPlayers },
        casterSeat,
        effect.count,
      ).state;
    }
    case "summon-first-unit-from-deck": {
      // Phase 3.65 + 3.68 : 01FR023. Summon le 1er Unit du deck NOW +
      // active hasRecurringTopDeckSummon pour répéter à chaque startRound.
      const cfgFU = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      // Active le flag même si banc plein ou pas d'Unit (recurring
      // future).
      let updated: InternalPlayer = {
        ...player,
        hasRecurringTopDeckSummon: true,
      };
      if (player.bench.length < cfgFU.maxBench) {
        const idx = player.deck.findIndex((c) => {
          const card = getCard(c.cardCode);
          return card?.type === "Unit";
        });
        if (idx !== -1) {
          const drawn = player.deck[idx];
          const newDeck = [
            ...player.deck.slice(0, idx),
            ...player.deck.slice(idx + 1),
          ];
          const baseUnit = createUnit(drawn.uid, drawn.cardCode);
          const buff = player.cardBuffs[drawn.uid];
          const newUnit: RuneterraBattleUnit = buff
            ? {
                ...baseUnit,
                power: baseUnit.power + buff.powerDelta,
                health: baseUnit.health + buff.healthDelta,
                keywords: Array.from(
                  new Set([...baseUnit.keywords, ...buff.addKeywords]),
                ),
              }
            : baseUnit;
          const newCardBuffs = { ...player.cardBuffs };
          delete newCardBuffs[drawn.uid];
          updated = {
            ...updated,
            deck: newDeck,
            bench: [...player.bench, newUnit],
            cardBuffs: newCardBuffs,
            summonedUidsThisRound: [
              ...player.summonedUidsThisRound,
              newUnit.uid,
            ],
          };
          newPlayers[casterSeat] = updated;
          const cardName = getCard(drawn.cardCode)?.name ?? drawn.cardCode;
          return {
            ...state,
            players: newPlayers,
            log: [
              ...state.log,
              `${player.username} invoque ${cardName} (et chaque round désormais).`,
            ],
          };
        }
      }
      newPlayers[casterSeat] = updated;
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} active Appel de la chef de guerre (summon chaque round).`,
        ],
      };
    }
    case "insert-tokens-into-enemy-deck": {
      // Phase 3.65 : Mushrooms. Insère insertCount copies du token dans
      // le deck adverse à des positions aléatoires.
      const opp = newPlayers[oppSeat];
      let newOppDeck = [...opp.deck];
      for (let i = 0; i < effect.insertCount; i++) {
        const newUid = `${oppSeat}-mu-${state.round}-${state.log.length}-${i}`;
        const insertIdx = Math.floor(Math.random() * (newOppDeck.length + 1));
        newOppDeck = [
          ...newOppDeck.slice(0, insertIdx),
          { uid: newUid, cardCode: effect.tokenCardCode },
          ...newOppDeck.slice(insertIdx),
        ];
      }
      newPlayers[oppSeat] = { ...opp, deck: newOppDeck };
      const tokenName = getCard(effect.tokenCardCode)?.name ?? effect.tokenCardCode;
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${state.players[casterSeat].username} plante ${effect.insertCount} ${tokenName} dans le deck de ${opp.username}.`,
        ],
      };
    }
    case "deal-damage-enemy-nexus-fixed": {
      // Phase 3.65 : 01PZ004 simplifié — dmg amount au nexus ennemi.
      const opp = newPlayers[oppSeat];
      const newNexus = opp.nexusHealth - effect.amount;
      newPlayers[oppSeat] = { ...opp, nexusHealth: newNexus };
      if (newNexus <= 0) {
        return {
          ...state,
          players: newPlayers,
          phase: "ended",
          winnerSeatIdx: casterSeat,
          log: [
            ...state.log,
            `${state.players[casterSeat].username} remporte la partie (sort direct au nexus).`,
          ],
        };
      }
      return { ...state, players: newPlayers };
    }
    case "auto-copy-best-hand-card-into-deck": {
      // Phase 3.62 : Contrefaçons. Pick le card de plus haut cost en
      // main (le sort lui-même est déjà retiré par playSpell). Crée
      // copyCount copies de son cardCode dans le deck (insertions
      // aléatoires).
      const player = newPlayers[casterSeat];
      if (player.hand.length === 0) return state;
      const sorted = [...player.hand].sort((a, b) => {
        const ca = getCard(a.cardCode);
        const cb = getCard(b.cardCode);
        return (cb?.cost ?? 0) - (ca?.cost ?? 0);
      });
      const chosenCardCode = sorted[0].cardCode;
      let newDeck = [...player.deck];
      for (let i = 0; i < effect.copyCount; i++) {
        const newUid = `${casterSeat}-cf-${state.round}-${state.log.length}-${i}`;
        const insertIdx = Math.floor(Math.random() * (newDeck.length + 1));
        newDeck = [
          ...newDeck.slice(0, insertIdx),
          { uid: newUid, cardCode: chosenCardCode },
          ...newDeck.slice(insertIdx),
        ];
      }
      newPlayers[casterSeat] = { ...player, deck: newDeck };
      const cardName = getCard(chosenCardCode)?.name ?? chosenCardCode;
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} ajoute ${effect.copyCount} copies de ${cardName} dans son deck.`,
        ],
      };
    }
    case "steal-enemy-adept-this-round": {
      // Phase 3.62 : Possession. Move target enemy adept au banc du
      // caster + push uid à stolenUidsThisRound. Au prochain startRound
      // l'unité est restaurée à l'opp (logique dans startRound).
      const opp = newPlayers[oppSeat];
      const idx = opp.bench.findIndex((u) => u.uid === targetUid);
      if (idx === -1) return state;
      const stolenUnit = opp.bench[idx];
      newPlayers[oppSeat] = {
        ...opp,
        bench: [...opp.bench.slice(0, idx), ...opp.bench.slice(idx + 1)],
      };
      const caster = newPlayers[casterSeat];
      newPlayers[casterSeat] = {
        ...caster,
        bench: [...caster.bench, stolenUnit],
        stolenUidsThisRound: [...caster.stolenUidsThisRound, stolenUnit.uid],
      };
      const cardName = getCard(stolenUnit.cardCode)?.name ?? stolenUnit.cardCode;
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${caster.username} vole ${cardName} pour ce round.`,
        ],
      };
    }
    case "gain-mana-slot-and-heal-nexus": {
      // Phase 3.61 : Catalyseur. +1 manaSlotsBonus permanent + heal nexus.
      // Le manaMax sera bumpé au prochain startRound. Pour ce round on
      // bumpe aussi manaMax + mana actuels pour que le bonus soit
      // visible immédiatement.
      const cfgMS = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      const newSlots = player.manaSlotsBonus + 1;
      const newManaMax = Math.min(player.manaMax + 1, cfgMS.maxMana);
      newPlayers[casterSeat] = {
        ...player,
        manaSlotsBonus: newSlots,
        manaMax: newManaMax,
        mana: Math.min(player.mana + 1, newManaMax),
        nexusHealth: Math.min(
          cfgMS.initialNexusHealth,
          player.nexusHealth + effect.healAmount,
        ),
      };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} gagne un emplacement de mana (manaMax = ${newManaMax}).`,
        ],
      };
    }
    case "pay-all-mana-deal-damage-target-any": {
      // Phase 3.61 : Rayon thermogénique. Pay all mana + spellMana,
      // dmg = ce montant à une unité (any side).
      const player = newPlayers[casterSeat];
      const dmg = player.mana + player.spellMana;
      if (dmg <= 0) return state;
      newPlayers[casterSeat] = { ...player, mana: 0, spellMana: 0 };
      // Apply damage à target.
      let target: RuneterraBattleUnit | undefined;
      let targetSeat: 0 | 1 | null = null;
      const casterUnit = newPlayers[casterSeat].bench.find(
        (u) => u.uid === targetUid,
      );
      if (casterUnit) {
        target = casterUnit;
        targetSeat = casterSeat;
      } else {
        const oppUnit = newPlayers[oppSeat].bench.find(
          (u) => u.uid === targetUid,
        );
        if (oppUnit) {
          target = oppUnit;
          targetSeat = oppSeat;
        }
      }
      if (!target || targetSeat === null) {
        return { ...state, players: newPlayers };
      }
      const targetPlayer = newPlayers[targetSeat];
      const updatedBench = targetPlayer.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, dmg);
        return copy;
      });
      const survivors = updatedBench.filter((u) => u.damage < u.health);
      const deadUnit = updatedBench.find((u) => u.damage >= u.health);
      newPlayers[targetSeat] = {
        ...targetPlayer,
        bench: survivors,
        alliesDiedThisRound:
          targetPlayer.alliesDiedThisRound + (deadUnit ? 1 : 0),
        championCounters: {
          ...targetPlayer.championCounters,
          alliesDied:
            targetPlayer.championCounters.alliesDied + (deadUnit ? 1 : 0),
        },
      };
      let newState: InternalState = {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} dépense ${dmg} mana pour infliger ${dmg} dmg.`,
        ],
      };
      if (deadUnit) newState = triggerLastBreath(newState, deadUnit, targetSeat);
      return newState;
    }
    case "damage-summoned-this-round-enemies": {
      // Phase 3.61 : La cage. Dmg amount à toutes les unités ennemies
      // dont l'uid est dans opp.summonedUidsThisRound.
      const opp = newPlayers[oppSeat];
      const summonedSet = new Set(opp.summonedUidsThisRound);
      const newBench = opp.bench.map((u) => {
        if (!summonedSet.has(u.uid)) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, effect.amount);
        return copy;
      });
      const survivors = newBench.filter((u) => u.damage < u.health);
      const dead = newBench.filter((u) => u.damage >= u.health);
      newPlayers[oppSeat] = {
        ...opp,
        bench: survivors,
        alliesDiedThisRound: opp.alliesDiedThisRound + dead.length,
        championCounters: {
          ...opp.championCounters,
          alliesDied: opp.championCounters.alliesDied + dead.length,
          unitsDied: opp.championCounters.unitsDied + dead.length,
        },
      };
      const caster = newPlayers[casterSeat];
      newPlayers[casterSeat] = {
        ...caster,
        championCounters: {
          ...caster.championCounters,
          unitsDied: caster.championCounters.unitsDied + dead.length,
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      for (const d of dead) {
        newState = triggerLastBreath(newState, d, oppSeat);
        if (newState.phase === "ended") return newState;
      }
      return newState;
    }
    case "revive-n-most-powerful-dead-allies-this-game-as-ephemeral": {
      // Phase 3.60 : pick les count cardCodes morts les plus puissants
      // (par card.attack) dans deadAlliesThisGame, summon chacun avec
      // Ephemeral. Capé à maxBench. Les uids consommés sont retirés.
      const cfgRN = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      const sorted = [...player.deadAlliesThisGame].sort((a, b) => {
        const ca = getCard(a.cardCode);
        const cb = getCard(b.cardCode);
        return (cb?.attack ?? 0) - (ca?.attack ?? 0);
      });
      const slotsAvailable = cfgRN.maxBench - player.bench.length;
      const toRevive = Math.min(effect.count, sorted.length, slotsAvailable);
      if (toRevive === 0) return state;
      const chosen = sorted.slice(0, toRevive);
      const chosenUids = new Set(chosen.map((c) => c.uid));
      const newUnits: RuneterraBattleUnit[] = [];
      for (let i = 0; i < chosen.length; i++) {
        const newUid = `${casterSeat}-rn-${state.round}-${state.log.length}-${i}`;
        const baseUnit = createUnit(newUid, chosen[i].cardCode);
        newUnits.push({
          ...baseUnit,
          keywords: Array.from(new Set([...baseUnit.keywords, "Ephemeral"])),
        });
      }
      const newDeadList = player.deadAlliesThisGame.filter(
        (d) => !chosenUids.has(d.uid),
      );
      newPlayers[casterSeat] = {
        ...player,
        bench: [...player.bench, ...newUnits],
        deadAlliesThisGame: newDeadList,
      };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} ranime ${toRevive} allié${toRevive > 1 ? "s" : ""} (Ephemeral).`,
        ],
      };
    }
    case "deal-damage-2-targets-any-or-nexus-and-draw": {
      // Phase 3.64 : 01PZ031. Inflige damage1 à target1 + damage2 à
      // target2 (unit ou nexus chacun) + draw drawCount. Last Breath +
      // counters bumpés.
      let stateAfter: InternalState = { ...state, players: newPlayers };
      stateAfter = applyDmgToAnyOrNexus(
        stateAfter,
        casterSeat,
        oppSeat,
        targetUid ?? "",
        effect.damage1,
      );
      if (stateAfter.phase === "ended") return stateAfter;
      stateAfter = applyDmgToAnyOrNexus(
        stateAfter,
        casterSeat,
        oppSeat,
        targetUid2 ?? "",
        effect.damage2,
      );
      if (stateAfter.phase === "ended") return stateAfter;
      return drawCards(stateAfter, casterSeat, effect.drawCount).state;
    }
    case "buff-all-other-allies-round": {
      // Phase 3.73 : +pwr/+hp round à tous les alliés du caster sauf le
      // triggerSourceUid (la source du on-summon). Garen.
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid === triggerSourceUid) return u;
        return {
          ...u,
          power: u.power + effect.power,
          health: u.health + effect.health,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff + effect.power,
          endOfRoundHealthBuff: u.endOfRoundHealthBuff + effect.health,
        };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "damage-all-enemies-and-nexus": {
      // Phase 3.74 : Anivia attack. amount dmg à tous les ennemis +
      // amount dmg au nexus ennemi. Last Breath déclenché pour chaque mort.
      const opp = newPlayers[oppSeat];
      const newBench = opp.bench.map((u) => {
        const copy = { ...u };
        applyDamageToUnit(copy, effect.amount);
        return copy;
      });
      const survivors = newBench.filter((u) => u.damage < u.health);
      const dead = newBench.filter((u) => u.damage >= u.health);
      const newNexus = opp.nexusHealth - effect.amount;
      newPlayers[oppSeat] = {
        ...opp,
        bench: survivors,
        nexusHealth: newNexus,
        alliesDiedThisRound: opp.alliesDiedThisRound + dead.length,
        championCounters: {
          ...opp.championCounters,
          alliesDied: opp.championCounters.alliesDied + dead.length,
          unitsDied: opp.championCounters.unitsDied + dead.length,
        },
      };
      const caster = newPlayers[casterSeat];
      newPlayers[casterSeat] = {
        ...caster,
        championCounters: {
          ...caster.championCounters,
          unitsDied: caster.championCounters.unitsDied + dead.length,
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      if (newNexus <= 0) {
        return {
          ...newState,
          phase: "ended",
          winnerSeatIdx: casterSeat,
          log: [
            ...newState.log,
            `${state.players[casterSeat].username} remporte la partie (Anivia attack).`,
          ],
        };
      }
      for (const d of dead) {
        newState = triggerLastBreath(newState, d, oppSeat);
        if (newState.phase === "ended") return newState;
      }
      return newState;
    }
    case "frostbite-strongest-enemy": {
      // Phase 3.74 : Ashe attack. Frostbite l'ennemi avec la plus haute
      // power (non-frozen). Mirror de frostbite-enemy mais target auto.
      const opp = newPlayers[oppSeat];
      const target = [...opp.bench]
        .filter((u) => !u.frozen && u.power > 0)
        .sort((a, b) => b.power - a.power)[0];
      if (!target) return state;
      const restorePower = target.power;
      const newBench = opp.bench.map((u) => {
        if (u.uid !== target.uid) return u;
        return {
          ...u,
          power: 0,
          frozen: true,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff - restorePower,
        };
      });
      newPlayers[oppSeat] = { ...opp, bench: newBench };
      const caster = newPlayers[casterSeat];
      newPlayers[casterSeat] = {
        ...caster,
        championCounters: {
          ...caster.championCounters,
          enemiesFrostbitten: caster.championCounters.enemiesFrostbitten + 1,
        },
      };
      return { ...state, players: newPlayers };
    }
    case "summon-token-copy-self-stats": {
      // Phase 3.74 : Zed attack. Summon 1 × tokenCardCode avec les stats
      // CURRENT du triggerSourceUid (Zed). Capé à maxBench.
      // Phase 6.0 : si Zed L2 (01IO009T2), copie AUSSI les keywords
      // positifs (Quick Strike, Elusive, etc. — pas les négatifs comme
      // Stunned).
      const cfgZ = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      const sourceUnit = player.bench.find((u) => u.uid === triggerSourceUid);
      if (!sourceUnit) return state;
      if (player.bench.length >= cfgZ.maxBench) return state;
      const tokenCard = getCard(effect.tokenCardCode);
      if (!tokenCard || tokenCard.type !== "Unit") return state;
      const newUid = `${casterSeat}-zs-${state.round}-${state.log.length}`;
      const baseUnit = createUnit(newUid, effect.tokenCardCode);
      // Phase 6.0 : Zed L2 copy positive keywords (filter out negatives).
      const POSITIVE_KEYWORDS = [
        "QuickStrike",
        "DoubleStrike",
        "Elusive",
        "Fearsome",
        "Lifesteal",
        "Tough",
        "Regeneration",
        "Barrier",
        "Challenger",
        "Overwhelm",
        "Imbue",
        "Support",
      ];
      const copiedKeywords =
        sourceUnit.cardCode === "01IO009T2"
          ? sourceUnit.keywords.filter((k) => POSITIVE_KEYWORDS.includes(k))
          : [];
      const newUnit: RuneterraBattleUnit = {
        ...baseUnit,
        power: sourceUnit.power,
        health: sourceUnit.health,
        keywords: Array.from(new Set([...baseUnit.keywords, ...copiedKeywords])),
      };
      newPlayers[casterSeat] = {
        ...player,
        bench: [...player.bench, newUnit],
      };
      const kwSuffix =
        copiedKeywords.length > 0 ? ` + ${copiedKeywords.length} mot-clé(s)` : "";
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} invoque ${tokenCard.name} (${sourceUnit.power}|${sourceUnit.health}${kwSuffix}).`,
        ],
      };
    }
    case "create-card-in-hand": {
      // Phase 3.73 : push un nouveau {uid, cardCode} dans la main.
      // Capé à maxHand (sinon discard direct = no-op pour l'instant).
      const cfgCH = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      if (player.hand.length >= cfgCH.maxHand) return state;
      const newUid = `${casterSeat}-ch-${state.round}-${state.log.length}`;
      newPlayers[casterSeat] = {
        ...player,
        hand: [...player.hand, { uid: newUid, cardCode: effect.cardCode }],
      };
      const cardName = getCard(effect.cardCode)?.name ?? effect.cardCode;
      return {
        ...state,
        players: newPlayers,
        log: [...state.log, `${player.username} crée ${cardName} dans sa main.`],
      };
    }
    case "buff-ally-round-choice": {
      // Phase 3.71 : 01IO012. Choisit optionA (default) ou optionB selon
      // spellChoice (0 ou 1). Buff round comme buff-ally-round.
      const chosen = spellChoice === 1 ? effect.optionB : effect.optionA;
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        return {
          ...u,
          power: u.power + chosen.power,
          health: u.health + chosen.health,
          endOfRoundPowerBuff: u.endOfRoundPowerBuff + chosen.power,
          endOfRoundHealthBuff: u.endOfRoundHealthBuff + chosen.health,
        };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "deal-damage-3-targets-any-or-nexus": {
      // Phase 3.70 : 01PZ004 Crépuscule. dmg[0]→t1, dmg[1]→t2, dmg[2]→t3.
      let stateAfter3: InternalState = { ...state, players: newPlayers };
      const targets = [targetUid ?? "", targetUid2 ?? "", targetUid3 ?? ""];
      for (let i = 0; i < 3; i++) {
        stateAfter3 = applyDmgToAnyOrNexus(
          stateAfter3,
          casterSeat,
          oppSeat,
          targets[i],
          effect.damages[i],
        );
        if (stateAfter3.phase === "ended") return stateAfter3;
      }
      return stateAfter3;
    }
    case "transform-target-into-other-target": {
      // Phase 3.63 : Transformer. Remplace target1 (ally) par une copie
      // exacte de target2 (any unit). Stats reset au card de base de
      // target2, keywords du nouveau cardCode. uid de target1 conservé.
      const player = newPlayers[casterSeat];
      const ally = player.bench.find((u) => u.uid === targetUid);
      if (!ally) return state;
      let templateUnit: RuneterraBattleUnit | undefined;
      const casterTemplate = newPlayers[casterSeat].bench.find(
        (u) => u.uid === targetUid2,
      );
      if (casterTemplate) templateUnit = casterTemplate;
      else
        templateUnit = newPlayers[oppSeat].bench.find(
          (u) => u.uid === targetUid2,
        );
      if (!templateUnit) return state;
      // Crée la nouvelle unité avec stats du template (via createUnit qui
      // lit card.attack/health) mais keep target1.uid pour cohérence.
      const transformed = createUnit(ally.uid, templateUnit.cardCode);
      const newBench = player.bench.map((u) =>
        u.uid === ally.uid ? transformed : u,
      );
      newPlayers[casterSeat] = { ...player, bench: newBench };
      const targetName = getCard(templateUnit.cardCode)?.name ?? templateUnit.cardCode;
      const allyName = getCard(ally.cardCode)?.name ?? ally.cardCode;
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} transforme ${allyName} en ${targetName}.`,
        ],
      };
    }
    case "kill-ally-deal-power-to-target-any-or-nexus": {
      // Phase 3.59 : Atrocité. Sacrifice target1 (allié) puis dmg =
      // target1.power à target2 (unité ou nexus).
      const player = newPlayers[casterSeat];
      const sacrificed = player.bench.find((u) => u.uid === targetUid);
      if (!sacrificed) return state;
      const dmg = sacrificed.power;
      // Retire l'allié sacrifié.
      const newBenchAlly = player.bench.filter((u) => u.uid !== targetUid);
      newPlayers[casterSeat] = {
        ...player,
        bench: newBenchAlly,
        alliesDiedThisRound: player.alliesDiedThisRound + 1,
        championCounters: {
          ...player.championCounters,
          alliesDied: player.championCounters.alliesDied + 1,
          unitsDied: player.championCounters.unitsDied + 1,
        },
      };
      newPlayers[oppSeat] = {
        ...newPlayers[oppSeat],
        championCounters: {
          ...newPlayers[oppSeat].championCounters,
          unitsDied: newPlayers[oppSeat].championCounters.unitsDied + 1,
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      newState = triggerLastBreath(newState, sacrificed, casterSeat);
      if (newState.phase === "ended") return newState;
      // Apply dmg à target2.
      const newPlayers2: [InternalPlayer, InternalPlayer] = [
        newState.players[0],
        newState.players[1],
      ] as [InternalPlayer, InternalPlayer];
      if (targetUid2 === "nexus-self") {
        const me = newPlayers2[casterSeat];
        const newNexus = me.nexusHealth - dmg;
        newPlayers2[casterSeat] = { ...me, nexusHealth: newNexus };
        if (newNexus <= 0) {
          return {
            ...newState,
            players: newPlayers2,
            phase: "ended",
            winnerSeatIdx: oppSeat,
          };
        }
        return { ...newState, players: newPlayers2 };
      }
      if (targetUid2 === "nexus-enemy") {
        const opp = newPlayers2[oppSeat];
        const newNexus = opp.nexusHealth - dmg;
        newPlayers2[oppSeat] = { ...opp, nexusHealth: newNexus };
        if (newNexus <= 0) {
          return {
            ...newState,
            players: newPlayers2,
            phase: "ended",
            winnerSeatIdx: casterSeat,
            log: [
              ...newState.log,
              `${newState.players[casterSeat].username} remporte la partie (Atrocité au nexus).`,
            ],
          };
        }
        return { ...newState, players: newPlayers2 };
      }
      // Unité (any side).
      let target2Seat: 0 | 1 | null = null;
      if (newPlayers2[casterSeat].bench.find((u) => u.uid === targetUid2))
        target2Seat = casterSeat;
      else if (newPlayers2[oppSeat].bench.find((u) => u.uid === targetUid2))
        target2Seat = oppSeat;
      if (target2Seat === null) return newState;
      const target2Player = newPlayers2[target2Seat];
      const updatedBench = target2Player.bench.map((u) => {
        if (u.uid !== targetUid2) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, dmg);
        return copy;
      });
      const survivors = updatedBench.filter((u) => u.damage < u.health);
      const dead2 = updatedBench.find((u) => u.damage >= u.health);
      newPlayers2[target2Seat] = {
        ...target2Player,
        bench: survivors,
        alliesDiedThisRound:
          target2Player.alliesDiedThisRound + (dead2 ? 1 : 0),
        championCounters: {
          ...target2Player.championCounters,
          alliesDied:
            target2Player.championCounters.alliesDied + (dead2 ? 1 : 0),
        },
      };
      let final: InternalState = { ...newState, players: newPlayers2 };
      if (dead2) final = triggerLastBreath(final, dead2, target2Seat);
      return final;
    }
    case "buff-ally-and-copies-everywhere-permanent": {
      // Phase 3.59 : buff l'ally ciblé ET toutes ses copies (même
      // cardCode) sur le banc (direct), dans la main et dans le deck
      // (cardBuffs cumulatif).
      const player = newPlayers[casterSeat];
      const target = player.bench.find((u) => u.uid === targetUid);
      if (!target) return state;
      const targetCardCode = target.cardCode;
      // Bench : direct stat buff.
      const newBench = player.bench.map((u) => {
        if (u.cardCode !== targetCardCode) return u;
        return {
          ...u,
          power: u.power + effect.power,
          health: u.health + effect.health,
        };
      });
      // Hand + deck : cardBuffs.
      const newCardBuffs = { ...player.cardBuffs };
      for (const c of [...player.hand, ...player.deck]) {
        if (c.cardCode !== targetCardCode) continue;
        const existing = newCardBuffs[c.uid] ?? {
          powerDelta: 0,
          healthDelta: 0,
          costDelta: 0,
          addKeywords: [],
        };
        newCardBuffs[c.uid] = {
          ...existing,
          powerDelta: existing.powerDelta + effect.power,
          healthDelta: existing.healthDelta + effect.health,
        };
      }
      newPlayers[casterSeat] = {
        ...player,
        bench: newBench,
        cardBuffs: newCardBuffs,
      };
      return { ...state, players: newPlayers };
    }
    case "summon-random-adept-from-region-cost": {
      // Phase 3.58 : pick un adepte (non-Champion) collectible aléatoire
      // matching region + cost, summon sur le banc du caster.
      const cfgSR = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      if (player.bench.length >= cfgSR.maxBench) return state;
      const candidates: RuneterraCardData[] = [];
      for (const card of RUNETERRA_BASE_SET_BY_CODE.values()) {
        if (card.type !== "Unit") continue;
        if (card.supertype === "Champion") continue;
        if (!card.collectible) continue;
        if (card.cost !== effect.cost) continue;
        if (!card.regions?.includes(effect.region)) continue;
        candidates.push(card);
      }
      if (candidates.length === 0) return state;
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      const newUid = `${casterSeat}-sr-${state.round}-${state.log.length}`;
      const newUnit = createUnit(newUid, picked.cardCode);
      newPlayers[casterSeat] = {
        ...player,
        bench: [...player.bench, newUnit],
      };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} invoque ${picked.name} (adepte ${effect.region} aléatoire).`,
        ],
      };
    }
    case "summon-token-if-unique-cards-played-min": {
      // Phase 3.58 : Chatastrophe. Si uniqueCardCodesPlayedThisGame ≥
      // minUnique, summon tokenCardCode. Sinon no-op.
      const cfgUC = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      if (player.uniqueCardCodesPlayedThisGame.length < effect.minUnique) {
        return state;
      }
      if (player.bench.length >= cfgUC.maxBench) return state;
      const tokenCard = getCard(effect.tokenCardCode);
      if (!tokenCard || tokenCard.type !== "Unit") return state;
      const newUid = `${casterSeat}-uc-${state.round}-${state.log.length}`;
      const newUnit = createUnit(newUid, effect.tokenCardCode);
      newPlayers[casterSeat] = {
        ...player,
        bench: [...player.bench, newUnit],
      };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} invoque ${tokenCard.name} (≥ ${effect.minUnique} cartes uniques jouées).`,
        ],
      };
    }
    case "summon-token-or-add-to-deck-if-no-subtype-ally": {
      // Phase 3.58 : si caster a un allié du subtype, summon le token
      // sur le banc. Sinon, push au top du deck (start of next pioche).
      const cfgYE = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      const hasSubtypeAlly = player.bench.some((u) => {
        const card = getCard(u.cardCode);
        return card?.subtypes?.includes(effect.subtype);
      });
      const tokenCard = getCard(effect.tokenCardCode);
      if (!tokenCard || tokenCard.type !== "Unit") return state;
      const newUid = `${casterSeat}-yt-${state.round}-${state.log.length}`;
      if (hasSubtypeAlly) {
        if (player.bench.length >= cfgYE.maxBench) return state;
        const newUnit = createUnit(newUid, effect.tokenCardCode);
        newPlayers[casterSeat] = {
          ...player,
          bench: [...player.bench, newUnit],
        };
        return {
          ...state,
          players: newPlayers,
          log: [
            ...state.log,
            `${player.username} invoque ${tokenCard.name}.`,
          ],
        };
      }
      // Push au top du deck.
      newPlayers[casterSeat] = {
        ...player,
        deck: [{ uid: newUid, cardCode: effect.tokenCardCode }, ...player.deck],
      };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} ajoute ${tokenCard.name} au sommet de son deck.`,
        ],
      };
    }
    case "create-random-spell-in-hand-from-regions": {
      // Phase 3.57 : pick un sort aléatoire collectible matching :
      //  - regions overlap avec les régions du caster (deck + bench + hand)
      //  - cost ≥ minCost (si défini)
      //  - type Spell + collectible
      // Optionnel : restoreSpellMana → spellMana = max.
      const cfgRS = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      const ownedRegions = new Set<string>();
      for (const c of [...player.deck, ...player.hand, ...player.bench]) {
        const card = getCard(c.cardCode);
        if (!card) continue;
        for (const r of card.regions ?? []) ownedRegions.add(r);
      }
      const candidates: RuneterraCardData[] = [];
      for (const card of RUNETERRA_BASE_SET_BY_CODE.values()) {
        if (card.type !== "Spell") continue;
        if (!card.collectible) continue;
        if (effect.minCost !== undefined && card.cost < effect.minCost) continue;
        const overlap = (card.regions ?? []).some((r) => ownedRegions.has(r));
        if (!overlap) continue;
        candidates.push(card);
      }
      let newPlayer: InternalPlayer = player;
      if (candidates.length > 0) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        const newUid = `${casterSeat}-rs-${state.round}-${state.log.length}`;
        newPlayer = {
          ...newPlayer,
          hand: [...newPlayer.hand, { uid: newUid, cardCode: picked.cardCode }],
        };
      }
      if (effect.restoreSpellMana) {
        newPlayer = { ...newPlayer, spellMana: cfgRS.maxSpellMana };
      }
      newPlayers[casterSeat] = newPlayer;
      return { ...state, players: newPlayers };
    }
    case "buff-all-allies-permanent": {
      // Phase 3.55 : +pwr/+hp permanent à tous les alliés sur le banc.
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => ({
        ...u,
        power: u.power + effect.power,
        health: u.health + effect.health,
      }));
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "auto-discard-and-draw-up-to-n": {
      // Phase 3.55 : Fouillis. Auto-discard up to maxDiscard cartes
      // (rightmost first comme heuristique simple) puis draw égal.
      // Phase 3.72 : déclenche l'effet « si défaussé » de chaque carte
      // discardée (01NX039, 01PZ028).
      const player = newPlayers[casterSeat];
      const discardCount = Math.min(effect.maxDiscard, player.hand.length);
      const discarded = player.hand.slice(player.hand.length - discardCount);
      const newHand = player.hand.slice(0, player.hand.length - discardCount);
      const newCardBuffs = { ...player.cardBuffs };
      for (const c of discarded) {
        delete newCardBuffs[c.uid];
      }
      newPlayers[casterSeat] = {
        ...player,
        hand: newHand,
        cardBuffs: newCardBuffs,
      };
      let intermediate: InternalState = {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} défausse ${discardCount} carte${discardCount > 1 ? "s" : ""}.`,
        ],
      };
      // Phase 3.72 : trigger discard effects pour chaque carte discardée.
      for (const c of discarded) {
        intermediate = triggerDiscardEffect(intermediate, c.cardCode, casterSeat);
      }
      if (discardCount === 0) return intermediate;
      return drawCards(intermediate, casterSeat, discardCount).state;
    }
    case "auto-discard-and-damage-target-any-or-nexus": {
      // Phase 3.55 : Enthousiasme. Auto-discard 1 carte (rightmost)
      // puis dmg à la cible (unité ou nexus).
      // Phase 3.72 : trigger discard effect de la carte discardée.
      const cfgED = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      let intermediate: InternalState = state;
      if (player.hand.length > 0) {
        const newHand = player.hand.slice(0, player.hand.length - 1);
        const newCardBuffs = { ...player.cardBuffs };
        const discarded = player.hand[player.hand.length - 1];
        delete newCardBuffs[discarded.uid];
        newPlayers[casterSeat] = {
          ...player,
          hand: newHand,
          cardBuffs: newCardBuffs,
        };
        intermediate = {
          ...state,
          players: newPlayers,
          log: [...state.log, `${player.username} défausse 1 carte.`],
        };
        intermediate = triggerDiscardEffect(
          intermediate,
          discarded.cardCode,
          casterSeat,
        );
      }
      // Maintenant, applique le damage (réutilise la logique de
      // deal-damage-target-any-or-nexus en inline).
      const newPlayersDmg: [InternalPlayer, InternalPlayer] = [
        intermediate.players[0],
        intermediate.players[1],
      ] as [InternalPlayer, InternalPlayer];
      if (targetUid === "nexus-self") {
        const me = newPlayersDmg[casterSeat];
        const newNexus = me.nexusHealth - effect.amount;
        newPlayersDmg[casterSeat] = { ...me, nexusHealth: newNexus };
        if (newNexus <= 0) {
          return {
            ...intermediate,
            players: newPlayersDmg,
            phase: "ended",
            winnerSeatIdx: oppSeat,
          };
        }
        return { ...intermediate, players: newPlayersDmg };
      }
      if (targetUid === "nexus-enemy") {
        const opp = newPlayersDmg[oppSeat];
        const newNexus = opp.nexusHealth - effect.amount;
        newPlayersDmg[oppSeat] = { ...opp, nexusHealth: newNexus };
        if (newNexus <= 0) {
          return {
            ...intermediate,
            players: newPlayersDmg,
            phase: "ended",
            winnerSeatIdx: casterSeat,
            log: [
              ...intermediate.log,
              `${intermediate.players[casterSeat].username} remporte la partie (sort direct au nexus).`,
            ],
          };
        }
        return { ...intermediate, players: newPlayersDmg };
      }
      // Unité.
      let target: RuneterraBattleUnit | undefined;
      let targetSeat: 0 | 1 | null = null;
      const casterUnit = newPlayersDmg[casterSeat].bench.find(
        (u) => u.uid === targetUid,
      );
      if (casterUnit) {
        target = casterUnit;
        targetSeat = casterSeat;
      } else {
        const oppUnit = newPlayersDmg[oppSeat].bench.find(
          (u) => u.uid === targetUid,
        );
        if (oppUnit) {
          target = oppUnit;
          targetSeat = oppSeat;
        }
      }
      if (!target || targetSeat === null) return intermediate;
      const targetPlayer = newPlayersDmg[targetSeat];
      const updatedBench = targetPlayer.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, effect.amount);
        return copy;
      });
      const survivors = updatedBench.filter((u) => u.damage < u.health);
      const deadUnit = updatedBench.find((u) => u.damage >= u.health);
      newPlayersDmg[targetSeat] = {
        ...targetPlayer,
        bench: survivors,
        alliesDiedThisRound:
          targetPlayer.alliesDiedThisRound + (deadUnit ? 1 : 0),
        championCounters: {
          ...targetPlayer.championCounters,
          alliesDied:
            targetPlayer.championCounters.alliesDied + (deadUnit ? 1 : 0),
        },
      };
      let newState: InternalState = { ...intermediate, players: newPlayersDmg };
      if (deadUnit) {
        newState = triggerLastBreath(newState, deadUnit, targetSeat);
      }
      void cfgED;
      return newState;
    }
    case "buff-allies-in-hand-permanent": {
      // Phase 3.54 : +pwr/+hp permanent à toutes les cartes Unit alliées
      // de la main via cardBuffs (cumulatif si déjà buffée).
      const player = newPlayers[casterSeat];
      const newCardBuffs = { ...player.cardBuffs };
      for (const handCard of player.hand) {
        const card = getCard(handCard.cardCode);
        if (card?.type !== "Unit") continue;
        const existing = newCardBuffs[handCard.uid] ?? {
          powerDelta: 0,
          healthDelta: 0,
          costDelta: 0,
          addKeywords: [],
        };
        newCardBuffs[handCard.uid] = {
          ...existing,
          powerDelta: existing.powerDelta + effect.power,
          healthDelta: existing.healthDelta + effect.health,
        };
      }
      newPlayers[casterSeat] = { ...player, cardBuffs: newCardBuffs };
      return { ...state, players: newPlayers };
    }
    case "reduce-cost-allies-in-hand": {
      // Phase 3.54 : -delta cost à toutes les cartes alliées de la main
      // (Unit + Spell, peu importe). Cumulatif.
      const player = newPlayers[casterSeat];
      const newCardBuffs = { ...player.cardBuffs };
      for (const handCard of player.hand) {
        const existing = newCardBuffs[handCard.uid] ?? {
          powerDelta: 0,
          healthDelta: 0,
          costDelta: 0,
          addKeywords: [],
        };
        newCardBuffs[handCard.uid] = {
          ...existing,
          costDelta: existing.costDelta - effect.delta,
        };
      }
      newPlayers[casterSeat] = { ...player, cardBuffs: newCardBuffs };
      return { ...state, players: newPlayers };
    }
    case "grant-keyword-ally-in-hand-and-draw": {
      // Phase 3.54 : grant keyword au 1er Unit allié de la main (default
      // sans target picker) puis pioche drawCount.
      const player = newPlayers[casterSeat];
      const firstUnitIdx = player.hand.findIndex((c) => {
        const cd = getCard(c.cardCode);
        return cd?.type === "Unit";
      });
      if (firstUnitIdx === -1) {
        // No-op buff, mais on draw quand même.
        return drawCards({ ...state, players: newPlayers }, casterSeat, effect.drawCount).state;
      }
      const targetUidHand = player.hand[firstUnitIdx].uid;
      const newCardBuffs = { ...player.cardBuffs };
      const existing = newCardBuffs[targetUidHand] ?? {
        powerDelta: 0,
        healthDelta: 0,
        costDelta: 0,
        addKeywords: [],
      };
      if (!existing.addKeywords.includes(effect.keyword)) {
        newCardBuffs[targetUidHand] = {
          ...existing,
          addKeywords: [...existing.addKeywords, effect.keyword],
        };
      }
      newPlayers[casterSeat] = { ...player, cardBuffs: newCardBuffs };
      return drawCards({ ...state, players: newPlayers }, casterSeat, effect.drawCount).state;
    }
    case "buff-allies-of-subtype-everywhere": {
      // Phase 3.54 : +pwr/+hp à toutes les unités du subtype dans bench
      // (direct stat) + hand + deck (cardBuffs cumulatif).
      const player = newPlayers[casterSeat];
      // Bench : stat buff direct.
      const newBench = player.bench.map((u) => {
        const card = getCard(u.cardCode);
        if (!card?.subtypes?.includes(effect.subtype)) return u;
        return {
          ...u,
          power: u.power + effect.power,
          health: u.health + effect.health,
        };
      });
      // Hand + deck : cardBuffs.
      const newCardBuffs = { ...player.cardBuffs };
      for (const handCard of [...player.hand, ...player.deck]) {
        const card = getCard(handCard.cardCode);
        if (!card?.subtypes?.includes(effect.subtype)) continue;
        const existing = newCardBuffs[handCard.uid] ?? {
          powerDelta: 0,
          healthDelta: 0,
          costDelta: 0,
          addKeywords: [],
        };
        newCardBuffs[handCard.uid] = {
          ...existing,
          powerDelta: existing.powerDelta + effect.power,
          healthDelta: existing.healthDelta + effect.health,
        };
      }
      newPlayers[casterSeat] = {
        ...player,
        bench: newBench,
        cardBuffs: newCardBuffs,
      };
      return { ...state, players: newPlayers };
    }
    case "draw-and-reduce-cost": {
      // Phase 3.54 : pioche drawCount + -delta cost aux nouvelles cartes.
      const player = newPlayers[casterSeat];
      const handBefore = new Set(player.hand.map((c) => c.uid));
      const drawResult = drawCards(
        { ...state, players: newPlayers },
        casterSeat,
        effect.drawCount,
      );
      const playerAfter = drawResult.state.players[casterSeat];
      const newDrawnUids = playerAfter.hand
        .filter((c) => !handBefore.has(c.uid))
        .map((c) => c.uid);
      if (newDrawnUids.length === 0) return drawResult.state;
      const newCardBuffs = { ...playerAfter.cardBuffs };
      for (const uid of newDrawnUids) {
        const existing = newCardBuffs[uid] ?? {
          powerDelta: 0,
          healthDelta: 0,
          costDelta: 0,
          addKeywords: [],
        };
        newCardBuffs[uid] = {
          ...existing,
          costDelta: existing.costDelta - effect.delta,
        };
      }
      const finalPlayers: [InternalPlayer, InternalPlayer] = [
        drawResult.state.players[0],
        drawResult.state.players[1],
      ] as [InternalPlayer, InternalPlayer];
      finalPlayers[casterSeat] = { ...playerAfter, cardBuffs: newCardBuffs };
      return { ...drawResult.state, players: finalPlayers };
    }
    case "summon-tokens-and-buff-subtype-allies": {
      // Phase 3.53 : summon count × tokenCardCode puis buff +pwr/+hp
      // permanent à TOUS les alliés du subtype (incluant les nouveaux).
      const cfgSB = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      const tokenCard = getCard(effect.tokenCardCode);
      if (!tokenCard || tokenCard.type !== "Unit") return state;
      const slotsAvailable = cfgSB.maxBench - player.bench.length;
      const toSummon = Math.max(0, Math.min(effect.count, slotsAvailable));
      const newUnits: RuneterraBattleUnit[] = [];
      for (let i = 0; i < toSummon; i++) {
        const newUid = `${casterSeat}-sb-${state.round}-${state.log.length}-${i}`;
        newUnits.push(createUnit(newUid, effect.tokenCardCode));
      }
      const fullBench = [...player.bench, ...newUnits];
      // Buff tous les alliés du subtype (incluant les nouveaux).
      const buffedBench = fullBench.map((u) => {
        const card = getCard(u.cardCode);
        if (!card?.subtypes?.includes(effect.subtype)) return u;
        return {
          ...u,
          power: u.power + effect.power,
          health: u.health + effect.health,
        };
      });
      newPlayers[casterSeat] = { ...player, bench: buffedBench };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} invoque ${toSummon} × ${tokenCard.name} et buff ses ${effect.subtype}s (+${effect.power}|+${effect.health}).`,
        ],
      };
    }
    case "kill-all-units-with-max-power-if-ally-min-power": {
      // Phase 3.53 : kill conditionnel. Si caster a un allié power ≥
      // minAllyPower, tue toutes les unités (2 côtés) power ≤ maxPower.
      const caster = newPlayers[casterSeat];
      const hasMinAlly = caster.bench.some((u) => u.power >= effect.minAllyPower);
      if (!hasMinAlly) return state;
      const allDeadUnits: { unit: RuneterraBattleUnit; seat: 0 | 1 }[] = [];
      const deadCountBySeat: [number, number] = [0, 0];
      for (const seat of [0, 1] as const) {
        const player = newPlayers[seat];
        const survivors = player.bench.filter((u) => u.power > effect.maxPower);
        const dead = player.bench.filter((u) => u.power <= effect.maxPower);
        for (const d of dead) allDeadUnits.push({ unit: d, seat });
        deadCountBySeat[seat] = dead.length;
        newPlayers[seat] = {
          ...player,
          bench: survivors,
          alliesDiedThisRound: player.alliesDiedThisRound + dead.length,
          championCounters: {
            ...player.championCounters,
            alliesDied: player.championCounters.alliesDied + dead.length,
          },
        };
      }
      const totalDied = deadCountBySeat[0] + deadCountBySeat[1];
      for (const seat of [0, 1] as const) {
        newPlayers[seat] = {
          ...newPlayers[seat],
          championCounters: {
            ...newPlayers[seat].championCounters,
            unitsDied: newPlayers[seat].championCounters.unitsDied + totalDied,
          },
        };
      }
      let newState: InternalState = { ...state, players: newPlayers };
      for (const { unit, seat } of allDeadUnits) {
        newState = triggerLastBreath(newState, unit, seat);
        if (newState.phase === "ended") return newState;
      }
      return newState;
    }
    case "grant-keyword-2-allies-round": {
      // Phase 3.53 : grant keyword round à 2 alliés distincts.
      const player = newPlayers[casterSeat];
      const targets = new Set([targetUid, targetUid2].filter(Boolean));
      const newBench = player.bench.map((u) => {
        if (!targets.has(u.uid)) return u;
        if (u.keywords.includes(effect.keyword)) return u;
        return { ...u, keywords: [...u.keywords, effect.keyword] };
      });
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "stun-attacker-enemy": {
      // Phase 3.52 : stun ennemi attaquant. Validation déjà faite.
      const opp = newPlayers[oppSeat];
      let stunned = false;
      const newBench = opp.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        if (u.stunned) return u;
        stunned = true;
        return { ...u, stunned: true };
      });
      newPlayers[oppSeat] = { ...opp, bench: newBench };
      if (stunned) {
        const caster = newPlayers[casterSeat];
        newPlayers[casterSeat] = {
          ...caster,
          championCounters: {
            ...caster.championCounters,
            enemyStunned: caster.championCounters.enemyStunned + 1,
          },
        };
      }
      let stateAfter: InternalState = { ...state, players: newPlayers };
      if (stunned && targetUid) {
        stateAfter = triggerYasuoOnEnemyStunned(stateAfter, casterSeat, targetUid);
      }
      return stateAfter;
    }
    case "grant-ephemeral-all-followers-in-combat": {
      // Phase 3.52 : grant Ephemeral à tous les adeptes (non-Champion)
      // au combat (les 2 côtés). No-op hors combat.
      if (!state.attackInProgress) return state;
      const combatants = new Set<string>();
      for (const lane of state.attackInProgress.lanes) {
        combatants.add(lane.attackerUid);
        if (lane.blockerUid) combatants.add(lane.blockerUid);
      }
      for (const seat of [0, 1] as const) {
        const player = newPlayers[seat];
        const newBench = player.bench.map((u) => {
          if (!combatants.has(u.uid)) return u;
          const card = getCard(u.cardCode);
          if (card?.supertype === "Champion") return u;
          if (u.keywords.includes("Ephemeral")) return u;
          return { ...u, keywords: [...u.keywords, "Ephemeral"] };
        });
        newPlayers[seat] = { ...player, bench: newBench };
      }
      return { ...state, players: newPlayers };
    }
    case "revive-random-dead-ally-this-round": {
      // Phase 3.51 : Appel de la brume. Pick un allié au hasard dans
      // deadAlliesThisRound, le summon avec ses stats de base. No-op si
      // liste vide ou banc plein.
      const cfgRev = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      if (player.deadAlliesThisRound.length === 0) return state;
      if (player.bench.length >= cfgRev.maxBench) return state;
      const idx = Math.floor(Math.random() * player.deadAlliesThisRound.length);
      const chosen = player.deadAlliesThisRound[idx];
      const card = getCard(chosen.cardCode);
      if (!card || card.type !== "Unit") return state;
      const newUid = `${casterSeat}-rv-${state.round}-${state.log.length}`;
      const newUnit = createUnit(newUid, chosen.cardCode);
      // Retire de deadAlliesThisRound (pas de double-revive du même).
      const newDeadList = [
        ...player.deadAlliesThisRound.slice(0, idx),
        ...player.deadAlliesThisRound.slice(idx + 1),
      ];
      newPlayers[casterSeat] = {
        ...player,
        bench: [...player.bench, newUnit],
        deadAlliesThisRound: newDeadList,
      };
      return {
        ...state,
        players: newPlayers,
        log: [...state.log, `${player.username} ranime ${card.name}.`],
      };
    }
    case "swap-ephemeral": {
      // Phase 3.49 : Marque de la mort. Retire Ephemeral de target1
      // (ally) et l'ajoute à target2 (enemy). Validation déjà faite.
      const ally = newPlayers[casterSeat];
      const newAllyBench = ally.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        return {
          ...u,
          keywords: u.keywords.filter((k) => k !== "Ephemeral"),
        };
      });
      newPlayers[casterSeat] = { ...ally, bench: newAllyBench };
      const opp = newPlayers[oppSeat];
      const newOppBench = opp.bench.map((u) => {
        if (u.uid !== targetUid2) return u;
        if (u.keywords.includes("Ephemeral")) return u;
        return { ...u, keywords: [...u.keywords, "Ephemeral"] };
      });
      newPlayers[oppSeat] = { ...opp, bench: newOppBench };
      return { ...state, players: newPlayers };
    }
    case "ally-strikes-all-enemies-in-combat": {
      // Phase 3.48 : Jugement. L'allié ciblé frappe tous les ennemis au
      // combat (dmg = power allié) ; l'allié reçoit la somme des power
      // ennemis. Last Breath déclenché pour chaque mort.
      if (!state.attackInProgress) return state;
      const combatants = new Set<string>();
      for (const lane of state.attackInProgress.lanes) {
        combatants.add(lane.attackerUid);
        if (lane.blockerUid) combatants.add(lane.blockerUid);
      }
      const ally = newPlayers[casterSeat].bench.find(
        (u) => u.uid === targetUid,
      );
      if (!ally) return state;
      const enemyTargets = newPlayers[oppSeat].bench.filter((u) =>
        combatants.has(u.uid),
      );
      if (enemyTargets.length === 0) return state;
      const allyDamageOut = ally.power;
      const allyDamageIn = enemyTargets.reduce((sum, e) => sum + e.power, 0);
      // Apply damage à chaque ennemi.
      const updatedEnemyBench = newPlayers[oppSeat].bench.map((u) => {
        if (!combatants.has(u.uid)) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, allyDamageOut);
        return copy;
      });
      const enemySurvivors = updatedEnemyBench.filter(
        (u) => u.damage < u.health,
      );
      const enemyDead = updatedEnemyBench.filter((u) => u.damage >= u.health);
      // Apply damage à l'allié.
      const updatedAllyBench = newPlayers[casterSeat].bench.map((u) => {
        if (u.uid !== ally.uid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, allyDamageIn);
        return copy;
      });
      const allySurvivors = updatedAllyBench.filter((u) => u.damage < u.health);
      const allyDead = updatedAllyBench.find((u) => u.damage >= u.health);
      newPlayers[casterSeat] = {
        ...newPlayers[casterSeat],
        bench: allySurvivors,
        alliesDiedThisRound:
          newPlayers[casterSeat].alliesDiedThisRound + (allyDead ? 1 : 0),
        championCounters: {
          ...newPlayers[casterSeat].championCounters,
          alliesDied:
            newPlayers[casterSeat].championCounters.alliesDied +
            (allyDead ? 1 : 0),
          unitsDied:
            newPlayers[casterSeat].championCounters.unitsDied +
            (allyDead ? 1 : 0) +
            enemyDead.length,
        },
      };
      newPlayers[oppSeat] = {
        ...newPlayers[oppSeat],
        bench: enemySurvivors,
        alliesDiedThisRound:
          newPlayers[oppSeat].alliesDiedThisRound + enemyDead.length,
        championCounters: {
          ...newPlayers[oppSeat].championCounters,
          alliesDied:
            newPlayers[oppSeat].championCounters.alliesDied + enemyDead.length,
          unitsDied:
            newPlayers[oppSeat].championCounters.unitsDied +
            (allyDead ? 1 : 0) +
            enemyDead.length,
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      if (allyDead) {
        newState = triggerLastBreath(newState, allyDead, casterSeat);
        if (newState.phase === "ended") return newState;
      }
      for (const d of enemyDead) {
        newState = triggerLastBreath(newState, d, oppSeat);
        if (newState.phase === "ended") return newState;
      }
      return newState;
    }
    case "unit-strike-unit":
    case "unit-strike-unit-in-combat": {
      // Phase 3.46 : Combat singulier. target1=ally, target2=enemy.
      // Les 2 se frappent simultanément (dmg = power de l'autre).
      // Pas de QuickStrike timing : les 2 reçoivent les dégâts.
      const ally = newPlayers[casterSeat].bench.find(
        (u) => u.uid === targetUid,
      );
      const enemy = newPlayers[oppSeat].bench.find(
        (u) => u.uid === targetUid2,
      );
      if (!ally || !enemy) return state;
      const allyDmg = enemy.power;
      const enemyDmg = ally.power;
      // Apply damage à ally.
      const updatedAllyBench = newPlayers[casterSeat].bench.map((u) => {
        if (u.uid !== ally.uid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, allyDmg);
        return copy;
      });
      const allySurvivors = updatedAllyBench.filter((u) => u.damage < u.health);
      const allyDead = updatedAllyBench.find((u) => u.damage >= u.health);
      // Apply damage à enemy.
      const updatedEnemyBench = newPlayers[oppSeat].bench.map((u) => {
        if (u.uid !== enemy.uid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, enemyDmg);
        return copy;
      });
      const enemySurvivors = updatedEnemyBench.filter((u) => u.damage < u.health);
      const enemyDead = updatedEnemyBench.find((u) => u.damage >= u.health);
      newPlayers[casterSeat] = {
        ...newPlayers[casterSeat],
        bench: allySurvivors,
        alliesDiedThisRound:
          newPlayers[casterSeat].alliesDiedThisRound + (allyDead ? 1 : 0),
        championCounters: {
          ...newPlayers[casterSeat].championCounters,
          alliesDied:
            newPlayers[casterSeat].championCounters.alliesDied +
            (allyDead ? 1 : 0),
          unitsDied:
            newPlayers[casterSeat].championCounters.unitsDied +
            (allyDead ? 1 : 0) +
            (enemyDead ? 1 : 0),
        },
      };
      newPlayers[oppSeat] = {
        ...newPlayers[oppSeat],
        bench: enemySurvivors,
        alliesDiedThisRound:
          newPlayers[oppSeat].alliesDiedThisRound + (enemyDead ? 1 : 0),
        championCounters: {
          ...newPlayers[oppSeat].championCounters,
          alliesDied:
            newPlayers[oppSeat].championCounters.alliesDied +
            (enemyDead ? 1 : 0),
          unitsDied:
            newPlayers[oppSeat].championCounters.unitsDied +
            (allyDead ? 1 : 0) +
            (enemyDead ? 1 : 0),
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      if (allyDead) {
        newState = triggerLastBreath(newState, allyDead, casterSeat);
        if (newState.phase === "ended") return newState;
      }
      if (enemyDead) {
        newState = triggerLastBreath(newState, enemyDead, oppSeat);
      }
      return newState;
    }
    case "damage-enemy-and-rally": {
      // Phase 3.44 : Shunpo. Inflige amount dmg à un ennemi puis caster
      // gagne (ou regagne) le jeton d'attaque.
      const opp = newPlayers[oppSeat];
      const updatedBench = opp.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, effect.amount);
        return copy;
      });
      const survivors = updatedBench.filter((u) => u.damage < u.health);
      const deadUnit = updatedBench.find((u) => u.damage >= u.health);
      newPlayers[oppSeat] = { ...opp, bench: survivors };
      const caster = newPlayers[casterSeat];
      newPlayers[casterSeat] = { ...caster, attackToken: true };
      let newState: InternalState = {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${caster.username} regagne le jeton d'attaque (Ralliement).`,
        ],
      };
      if (deadUnit) {
        newState = triggerLastBreath(newState, deadUnit, oppSeat);
      }
      return newState;
    }
    case "stun-enemy-buff-all-allies-round": {
      // Phase 3.42 : Manœuvre décisive. Stun ennemi cible + +pwr/+hp round
      // à tous les alliés du caster.
      const opp = newPlayers[oppSeat];
      let stunned = false;
      const newOppBench = opp.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        if (u.stunned) return u;
        stunned = true;
        return { ...u, stunned: true };
      });
      newPlayers[oppSeat] = { ...opp, bench: newOppBench };
      const caster = newPlayers[casterSeat];
      const newCasterBench = caster.bench.map((u) => ({
        ...u,
        power: u.power + effect.power,
        health: u.health + effect.health,
        endOfRoundPowerBuff: u.endOfRoundPowerBuff + effect.power,
        endOfRoundHealthBuff: u.endOfRoundHealthBuff + effect.health,
      }));
      newPlayers[casterSeat] = {
        ...caster,
        bench: newCasterBench,
        championCounters: stunned
          ? {
              ...caster.championCounters,
              enemyStunned: caster.championCounters.enemyStunned + 1,
            }
          : caster.championCounters,
      };
      let stateAfter: InternalState = { ...state, players: newPlayers };
      if (stunned && targetUid) {
        stateAfter = triggerYasuoOnEnemyStunned(stateAfter, casterSeat, targetUid);
      }
      return stateAfter;
    }
    case "drain-target-summon-token": {
      // Phase 3.42 : Vil festin. Drain drainAmount d'une unité (any) puis
      // summon 1 × token (capé à maxBench).
      const cfgVF = RUNETERRA_BATTLE_CONFIG;
      let target: RuneterraBattleUnit | undefined;
      let targetSeat: 0 | 1 | null = null;
      const casterUnit = newPlayers[casterSeat].bench.find(
        (u) => u.uid === targetUid,
      );
      if (casterUnit) {
        target = casterUnit;
        targetSeat = casterSeat;
      } else {
        const oppUnit = newPlayers[oppSeat].bench.find(
          (u) => u.uid === targetUid,
        );
        if (oppUnit) {
          target = oppUnit;
          targetSeat = oppSeat;
        }
      }
      if (!target || targetSeat === null) return state;
      // Drain damage.
      const targetPlayer = newPlayers[targetSeat];
      const updatedBench = targetPlayer.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, effect.drainAmount);
        return copy;
      });
      const survivors = updatedBench.filter((u) => u.damage < u.health);
      const deadUnit = updatedBench.find((u) => u.damage >= u.health);
      newPlayers[targetSeat] = {
        ...targetPlayer,
        bench: survivors,
        alliesDiedThisRound:
          targetPlayer.alliesDiedThisRound + (deadUnit ? 1 : 0),
        championCounters: {
          ...targetPlayer.championCounters,
          alliesDied:
            targetPlayer.championCounters.alliesDied + (deadUnit ? 1 : 0),
        },
      };
      // Heal nexus du caster.
      const casterPlayer = newPlayers[casterSeat];
      newPlayers[casterSeat] = {
        ...casterPlayer,
        nexusHealth: Math.min(
          cfgVF.initialNexusHealth,
          casterPlayer.nexusHealth + effect.drainAmount,
        ),
      };
      let newState: InternalState = { ...state, players: newPlayers };
      if (deadUnit) {
        newState = triggerLastBreath(newState, deadUnit, targetSeat);
        if (newState.phase === "ended") return newState;
      }
      // Summon 1 token sur le banc du caster (capé à maxBench).
      const casterAfterDrain = newState.players[casterSeat];
      if (casterAfterDrain.bench.length >= cfgVF.maxBench) return newState;
      const tokenCard = getCard(effect.tokenCardCode);
      if (!tokenCard || tokenCard.type !== "Unit") return newState;
      const newUid = `${casterSeat}-vf-${state.round}-${state.log.length}`;
      const newUnit = createUnit(newUid, effect.tokenCardCode);
      const newPlayers2: [InternalPlayer, InternalPlayer] = [
        newState.players[0],
        newState.players[1],
      ] as [InternalPlayer, InternalPlayer];
      newPlayers2[casterSeat] = {
        ...casterAfterDrain,
        bench: [...casterAfterDrain.bench, newUnit],
      };
      return {
        ...newState,
        players: newPlayers2,
        log: [
          ...newState.log,
          `${casterAfterDrain.username} invoque ${tokenCard.name}.`,
        ],
      };
    }
    case "deal-damage-target-any-or-nexus": {
      // Phase 3.41 : Tir mystique. Inflige amount dmg à une unité OU un
      // nexus. targetUid spéciaux : "nexus-self" / "nexus-enemy".
      const cfgN = RUNETERRA_BATTLE_CONFIG;
      if (targetUid === "nexus-self") {
        const me = newPlayers[casterSeat];
        const newNexus = me.nexusHealth - effect.amount;
        newPlayers[casterSeat] = { ...me, nexusHealth: newNexus };
        if (newNexus <= 0) {
          return {
            ...state,
            players: newPlayers,
            phase: "ended",
            winnerSeatIdx: oppSeat,
            log: [
              ...state.log,
              `${state.players[oppSeat].username} remporte la partie (${me.username} s'est auto-infligé un nexus létal).`,
            ],
          };
        }
        return { ...state, players: newPlayers };
      }
      if (targetUid === "nexus-enemy") {
        const opp = newPlayers[oppSeat];
        const newNexus = opp.nexusHealth - effect.amount;
        newPlayers[oppSeat] = { ...opp, nexusHealth: newNexus };
        if (newNexus <= 0) {
          return {
            ...state,
            players: newPlayers,
            phase: "ended",
            winnerSeatIdx: casterSeat,
            log: [
              ...state.log,
              `${state.players[casterSeat].username} remporte la partie (sort direct au nexus).`,
            ],
          };
        }
        return { ...state, players: newPlayers };
      }
      // Unité : mirror de deal-damage-anywhere mais sans condition.
      let target: RuneterraBattleUnit | undefined;
      let targetSeat: 0 | 1 | null = null;
      const casterUnit = newPlayers[casterSeat].bench.find(
        (u) => u.uid === targetUid,
      );
      if (casterUnit) {
        target = casterUnit;
        targetSeat = casterSeat;
      } else {
        const oppUnit = newPlayers[oppSeat].bench.find(
          (u) => u.uid === targetUid,
        );
        if (oppUnit) {
          target = oppUnit;
          targetSeat = oppSeat;
        }
      }
      if (!target || targetSeat === null) return state;
      const targetPlayer = newPlayers[targetSeat];
      const updatedBench = targetPlayer.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, effect.amount);
        return copy;
      });
      const survivors = updatedBench.filter((u) => u.damage < u.health);
      const deadUnit = updatedBench.find((u) => u.damage >= u.health);
      newPlayers[targetSeat] = {
        ...targetPlayer,
        bench: survivors,
        alliesDiedThisRound:
          targetPlayer.alliesDiedThisRound + (deadUnit ? 1 : 0),
        championCounters: {
          ...targetPlayer.championCounters,
          alliesDied:
            targetPlayer.championCounters.alliesDied + (deadUnit ? 1 : 0),
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      if (deadUnit) {
        newState = triggerLastBreath(newState, deadUnit, targetSeat);
      }
      // cfgN référencé pour silence ESLint (pas utilisé dans cette branche).
      void cfgN;
      return newState;
    }
    case "deal-damage-anywhere": {
      // Cherche cible des deux côtés.
      let target: RuneterraBattleUnit | undefined;
      let targetSeat: 0 | 1 | null = null;
      const casterUnit = newPlayers[casterSeat].bench.find(
        (u) => u.uid === targetUid,
      );
      if (casterUnit) {
        target = casterUnit;
        targetSeat = casterSeat;
      } else {
        const oppUnit = newPlayers[oppSeat].bench.find(
          (u) => u.uid === targetUid,
        );
        if (oppUnit) {
          target = oppUnit;
          targetSeat = oppSeat;
        }
      }
      if (!target || targetSeat === null) return state;
      const player = newPlayers[targetSeat];
      const newBench = player.bench
        .map((u) => {
          if (u.uid !== targetUid) return u;
          const updated = { ...u };
          applyDamageToUnit(updated, effect.amount);
          return updated;
        })
        .filter((u) => u.damage < u.health);
      newPlayers[targetSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "summon-ally-copies": {
      // Phase 3.33 : invoque count copies de l'allié ciblé sur le banc
      // du caster. Override stats + add keywords si fourni. Capé à
      // maxBench (autant que possible si pas assez de slots).
      const cfgCopy = RUNETERRA_BATTLE_CONFIG;
      const player = newPlayers[casterSeat];
      const sourceUnit = player.bench.find((u) => u.uid === targetUid);
      if (!sourceUnit) return state;
      const slotsAvailable = cfgCopy.maxBench - player.bench.length;
      if (slotsAvailable <= 0) return state;
      const toSummon = Math.min(effect.count, slotsAvailable);
      const newUnits: RuneterraBattleUnit[] = [];
      for (let i = 0; i < toSummon; i++) {
        const newUid = `${casterSeat}-cp-${state.round}-${state.log.length}-${i}`;
        const baseUnit = createUnit(newUid, sourceUnit.cardCode);
        const finalKeywords = effect.addKeywords
          ? Array.from(new Set([...baseUnit.keywords, ...effect.addKeywords]))
          : baseUnit.keywords;
        newUnits.push({
          ...baseUnit,
          power: effect.powerOverride ?? baseUnit.power,
          health: effect.healthOverride ?? baseUnit.health,
          keywords: finalKeywords,
        });
      }
      const sourceName = getCard(sourceUnit.cardCode)?.name ?? sourceUnit.cardCode;
      newPlayers[casterSeat] = {
        ...player,
        bench: [...player.bench, ...newUnits],
      };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} invoque ${toSummon} copie${toSummon > 1 ? "s" : ""} de ${sourceName}.`,
        ],
      };
    }
    case "kill-ally-for-draw": {
      // Phase 3.27 : tue l'allié ciblé (Last Breath déclenché) puis le
      // caster pioche drawCount cartes. Validation faite en amont (target
      // sur banc allié).
      const player = newPlayers[casterSeat];
      const idx = player.bench.findIndex((u) => u.uid === targetUid);
      if (idx === -1) return state;
      const dyingUnit = player.bench[idx];
      const newBench = [
        ...player.bench.slice(0, idx),
        ...player.bench.slice(idx + 1),
      ];
      newPlayers[casterSeat] = {
        ...player,
        bench: newBench,
        alliesDiedThisRound: player.alliesDiedThisRound + 1,
        championCounters: {
          ...player.championCounters,
          alliesDied: player.championCounters.alliesDied + 1,
          unitsDied: player.championCounters.unitsDied + 1,
        },
      };
      newPlayers[oppSeat] = {
        ...newPlayers[oppSeat],
        championCounters: {
          ...newPlayers[oppSeat].championCounters,
          unitsDied: newPlayers[oppSeat].championCounters.unitsDied + 1,
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      // Trigger Last Breath de l'unité sacrifiée.
      newState = triggerLastBreath(newState, dyingUnit, casterSeat);
      if (newState.phase === "ended") return newState;
      // Pioche drawCount cartes pour le caster.
      const drawResult = drawCards(newState, casterSeat, effect.drawCount);
      return drawResult.state;
    }
    case "damage-all-combatants": {
      // Phase 3.32 : inflige X dmg à toutes les unités au combat (uid
      // dans state.attackInProgress.lanes côté attacker ou blocker).
      // No-op si pas d'attaque en cours.
      if (!state.attackInProgress) return state;
      const combatantUids = new Set<string>();
      for (const lane of state.attackInProgress.lanes) {
        combatantUids.add(lane.attackerUid);
        if (lane.blockerUid) combatantUids.add(lane.blockerUid);
      }
      const allDeadUnits: { unit: RuneterraBattleUnit; seat: 0 | 1 }[] = [];
      const deadCountBySeat: [number, number] = [0, 0];
      for (const seat of [0, 1] as const) {
        const player = newPlayers[seat];
        const newBench = player.bench.map((u) => {
          if (!combatantUids.has(u.uid)) return u;
          const copy = { ...u };
          applyDamageToUnit(copy, effect.amount);
          return copy;
        });
        const survivors = newBench.filter((u) => u.damage < u.health);
        const dead = newBench.filter((u) => u.damage >= u.health);
        for (const d of dead) allDeadUnits.push({ unit: d, seat });
        deadCountBySeat[seat] = dead.length;
        newPlayers[seat] = {
          ...player,
          bench: survivors,
          alliesDiedThisRound: player.alliesDiedThisRound + dead.length,
          championCounters: {
            ...player.championCounters,
            alliesDied: player.championCounters.alliesDied + dead.length,
          },
        };
      }
      const totalDied = deadCountBySeat[0] + deadCountBySeat[1];
      for (const seat of [0, 1] as const) {
        newPlayers[seat] = {
          ...newPlayers[seat],
          championCounters: {
            ...newPlayers[seat].championCounters,
            unitsDied: newPlayers[seat].championCounters.unitsDied + totalDied,
          },
        };
      }
      let newState: InternalState = { ...state, players: newPlayers };
      for (const { unit, seat } of allDeadUnits) {
        newState = triggerLastBreath(newState, unit, seat);
        if (newState.phase === "ended") return newState;
      }
      return newState;
    }
    case "summon-tokens-if-ally-died": {
      // Phase 3.34 + 3.50 : si alliesDiedThisRound >= minDeaths (default 1),
      // summon count tokens. Sinon no-op.
      const player = newPlayers[casterSeat];
      const required = effect.minDeaths ?? 1;
      if (player.alliesDiedThisRound < required) return state;
      const cfgCond = RUNETERRA_BATTLE_CONFIG;
      const tokenCard = getCard(effect.cardCode);
      if (!tokenCard || tokenCard.type !== "Unit") return state;
      const slotsAvailable = cfgCond.maxBench - player.bench.length;
      if (slotsAvailable <= 0) {
        return {
          ...state,
          log: [
            ...state.log,
            `${player.username} : pas de place pour invoquer ${tokenCard.name}.`,
          ],
        };
      }
      const toSummon = Math.min(effect.count, slotsAvailable);
      const newUnits: RuneterraBattleUnit[] = [];
      for (let i = 0; i < toSummon; i++) {
        const newUid = `${casterSeat}-cd-${state.round}-${state.log.length}-${i}`;
        newUnits.push(createUnit(newUid, effect.cardCode));
      }
      newPlayers[casterSeat] = {
        ...player,
        bench: [...player.bench, ...newUnits],
      };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} invoque ${toSummon} × ${tokenCard.name} (allié mort ce round).`,
        ],
      };
    }
    case "deal-damage-anywhere-if-ally-died": {
      // Phase 3.34 : si alliesDiedThisRound > 0, inflige amount dmg
      // à la cible (any side, comme deal-damage-anywhere). Sinon no-op.
      const caster = newPlayers[casterSeat];
      if (caster.alliesDiedThisRound <= 0) return state;
      let target: RuneterraBattleUnit | undefined;
      let targetSeat: 0 | 1 | null = null;
      const casterUnit = caster.bench.find((u) => u.uid === targetUid);
      if (casterUnit) {
        target = casterUnit;
        targetSeat = casterSeat;
      } else {
        const oppUnit = newPlayers[oppSeat].bench.find(
          (u) => u.uid === targetUid,
        );
        if (oppUnit) {
          target = oppUnit;
          targetSeat = oppSeat;
        }
      }
      if (!target || targetSeat === null) return state;
      const player = newPlayers[targetSeat];
      const updatedBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, effect.amount);
        return copy;
      });
      const survivors = updatedBench.filter((u) => u.damage < u.health);
      const deadUnit = updatedBench.find((u) => u.damage >= u.health);
      newPlayers[targetSeat] = {
        ...player,
        bench: survivors,
        alliesDiedThisRound: player.alliesDiedThisRound + (deadUnit ? 1 : 0),
        championCounters: {
          ...player.championCounters,
          alliesDied: player.championCounters.alliesDied + (deadUnit ? 1 : 0),
        },
      };
      let newState: InternalState = { ...state, players: newPlayers };
      if (deadUnit) {
        newState = triggerLastBreath(newState, deadUnit, targetSeat);
      }
      return newState;
    }
    case "buff-all-allies-round": {
      // Phase 3.30 : +power/+health round à tous les alliés du caster
      // (sans grant keyword). Mirror de combo-buff-keyword-all-allies-round
      // mais sans la partie keyword.
      const player = newPlayers[casterSeat];
      const newBench = player.bench.map((u) => ({
        ...u,
        power: u.power + effect.power,
        health: u.health + effect.health,
        endOfRoundPowerBuff: u.endOfRoundPowerBuff + effect.power,
        endOfRoundHealthBuff: u.endOfRoundHealthBuff + effect.health,
      }));
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "summon-tokens": {
      // Phase 3.26 : invoque effect.count copies du token effect.cardCode
      // sur le banc du caster (capé à maxBench).
      const cfgSummon = RUNETERRA_BATTLE_CONFIG;
      const tokenCard = getCard(effect.cardCode);
      if (!tokenCard || tokenCard.type !== "Unit") return state;
      const player = newPlayers[casterSeat];
      const slotsAvailable = cfgSummon.maxBench - player.bench.length;
      if (slotsAvailable <= 0) {
        return {
          ...state,
          log: [
            ...state.log,
            `${player.username} : impossible d'invoquer ${tokenCard.name} (banc plein).`,
          ],
        };
      }
      const toSummon = Math.min(effect.count, slotsAvailable);
      const newUnits: RuneterraBattleUnit[] = [];
      for (let i = 0; i < toSummon; i++) {
        const newUid = `${casterSeat}-tk-${state.round}-${state.log.length}-${i}`;
        newUnits.push(createUnit(newUid, effect.cardCode));
      }
      newPlayers[casterSeat] = {
        ...player,
        bench: [...player.bench, ...newUnits],
      };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} invoque ${toSummon} × ${tokenCard.name}.`,
        ],
      };
    }
    case "draw-champion": {
      // Phase 3.25 : Haro. Cherche le 1er champion dans le deck du caster
      // (top → bottom) et le pioche. Si aucun champion → no-op silencieux.
      const player = newPlayers[casterSeat];
      const idx = player.deck.findIndex((c) => {
        const card = getCard(c.cardCode);
        return card?.supertype === "Champion";
      });
      if (idx === -1) return state;
      const drawn = player.deck[idx];
      const newDeck = [
        ...player.deck.slice(0, idx),
        ...player.deck.slice(idx + 1),
      ];
      const cardName = getCard(drawn.cardCode)?.name ?? drawn.cardCode;
      newPlayers[casterSeat] = {
        ...player,
        deck: newDeck,
        hand: [...player.hand, drawn],
      };
      return {
        ...state,
        players: newPlayers,
        log: [
          ...state.log,
          `${player.username} pioche ${cardName} (champion).`,
        ],
      };
    }
    case "stun-all-enemies-max-power": {
      // Phase 3.25 : Rugissement intimidant. Étourdit tous les ennemis
      // dont la puissance est ≤ maxPower. enemyStunned bumpé pour chaque
      // cible (compte vers Yasuo level-up).
      const opp = newPlayers[oppSeat];
      const freshlyStunnedUids: string[] = [];
      const newBench = opp.bench.map((u) => {
        if (u.power > effect.maxPower) return u;
        if (u.stunned) return u;
        freshlyStunnedUids.push(u.uid);
        return { ...u, stunned: true };
      });
      newPlayers[oppSeat] = { ...opp, bench: newBench };
      const stunCount = freshlyStunnedUids.length;
      if (stunCount > 0) {
        const caster = newPlayers[casterSeat];
        newPlayers[casterSeat] = {
          ...caster,
          championCounters: {
            ...caster.championCounters,
            enemyStunned: caster.championCounters.enemyStunned + stunCount,
          },
        };
      }
      let stateAfter: InternalState = { ...state, players: newPlayers };
      // Phase 3.76 : Yasuo trigger pour chaque ennemi stunned.
      for (const uid of freshlyStunnedUids) {
        stateAfter = triggerYasuoOnEnemyStunned(stateAfter, casterSeat, uid);
        if (stateAfter.phase === "ended") return stateAfter;
      }
      return stateAfter;
    }
    case "drain-target-any":
    case "drain-ally": {
      // Phase 3.24 : drain — inflige X dégâts à la cible et soigne le
      // nexus du caster du même montant (capé à initialNexusHealth).
      // drain-target-any peut viser n'importe quel côté ; drain-ally
      // ne vise que le banc du caster (validation faite en amont).
      const cfgDrain = RUNETERRA_BATTLE_CONFIG;
      let target: RuneterraBattleUnit | undefined;
      let targetSeat: 0 | 1 | null = null;
      const casterUnit = newPlayers[casterSeat].bench.find(
        (u) => u.uid === targetUid,
      );
      if (casterUnit) {
        target = casterUnit;
        targetSeat = casterSeat;
      } else if (effect.type === "drain-target-any") {
        const oppUnit = newPlayers[oppSeat].bench.find(
          (u) => u.uid === targetUid,
        );
        if (oppUnit) {
          target = oppUnit;
          targetSeat = oppSeat;
        }
      }
      if (!target || targetSeat === null) return state;
      // Inflige les dégâts (on récupère les unités tuées pour Last Breath).
      const targetPlayer = newPlayers[targetSeat];
      const updatedBench = targetPlayer.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        const copy = { ...u };
        applyDamageToUnit(copy, effect.amount);
        return copy;
      });
      const survivors = updatedBench.filter((u) => u.damage < u.health);
      const deadUnit = updatedBench.find((u) => u.damage >= u.health);
      newPlayers[targetSeat] = {
        ...targetPlayer,
        bench: survivors,
        alliesDiedThisRound:
          targetPlayer.alliesDiedThisRound + (deadUnit ? 1 : 0),
        championCounters: {
          ...targetPlayer.championCounters,
          alliesDied:
            targetPlayer.championCounters.alliesDied + (deadUnit ? 1 : 0),
        },
      };
      // Soigne le nexus du caster.
      const casterPlayer = newPlayers[casterSeat];
      newPlayers[casterSeat] = {
        ...casterPlayer,
        nexusHealth: Math.min(
          cfgDrain.initialNexusHealth,
          casterPlayer.nexusHealth + effect.amount,
        ),
      };
      // Bumpe unitsDied côté caster + déclenche Last Breath si mort.
      let newState: InternalState = { ...state, players: newPlayers };
      if (deadUnit) {
        const newPlayers2: [InternalPlayer, InternalPlayer] = [
          newState.players[0],
          newState.players[1],
        ] as [InternalPlayer, InternalPlayer];
        newPlayers2[casterSeat] = {
          ...newPlayers2[casterSeat],
          championCounters: {
            ...newPlayers2[casterSeat].championCounters,
            unitsDied: newPlayers2[casterSeat].championCounters.unitsDied + 1,
          },
        };
        newPlayers2[oppSeat] = {
          ...newPlayers2[oppSeat],
          championCounters: {
            ...newPlayers2[oppSeat].championCounters,
            unitsDied: newPlayers2[oppSeat].championCounters.unitsDied + 1,
          },
        };
        newState = { ...newState, players: newPlayers2 };
        newState = triggerLastBreath(newState, deadUnit, targetSeat);
      }
      return newState;
    }
  }
}

/** Le joueur actif passe la priorité à l'adversaire. Si les 2 joueurs ont
 *  passé d'affilée (consecutivePasses atteint 2), le round se termine et
 *  on transitionne au round suivant via `endRound`.
 */
export function passPriority(
  state: InternalState,
  seatIdx: 0 | 1,
): EngineResult {
  if (state.phase !== "round") {
    return { ok: false, error: "La partie n'est pas en round." };
  }
  if (state.activeSeatIdx !== seatIdx) {
    return { ok: false, error: "Ce n'est pas ton tour." };
  }

  const newPasses = state.consecutivePasses + 1;
  const player = state.players[seatIdx];
  const log = [...state.log, `${player.username} passe.`];

  // 2e pass d'affilée → round termine (avec swap attack token + bank spell mana).
  if (newPasses >= 2) {
    return {
      ok: true,
      state: endRound({
        ...state,
        consecutivePasses: 0,
        log,
      }),
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      activeSeatIdx: otherSeat(seatIdx),
      consecutivePasses: newPasses,
      log,
    },
  };
}

// ────────────────────── Phase 3.3 : combat ───────────────────────────────

/** Le porteur du jeton d'attaque déclare ses attaquants. Les unités passent
 *  en lanes (ordre fourni par le client). Le défenseur prend ensuite la
 *  priorité pour assigner ses bloqueurs (`assignBlockers`).
 *
 *   • Vérifie phase=round, c'est ton tour, tu as le jeton, pas d'attaque
 *     déjà en cours
 *   • Vérifie attackerUids tous présents sur ton banc, sans doublon, et
 *     non-playedThisRound (les unités fraîches du round ne peuvent pas
 *     attaquer le round où elles sont posées)
 *   • Vérifie au moins 1 attaquant
 *   • Consomme le jeton d'attaque (attackToken = false), passe la priorité
 *     au défenseur
 */
export function declareAttack(
  state: InternalState,
  seatIdx: 0 | 1,
  attackerUids: string[],
  forcedBlockerUids?: (string | null)[],
): EngineResult {
  if (state.phase !== "round") {
    return { ok: false, error: "La partie n'est pas en round." };
  }
  if (state.activeSeatIdx !== seatIdx) {
    return { ok: false, error: "Ce n'est pas ton tour." };
  }
  if (state.attackInProgress !== null) {
    return { ok: false, error: "Une attaque est déjà en cours." };
  }
  const player = state.players[seatIdx];
  if (!player.attackToken) {
    return { ok: false, error: "Tu n'as pas le jeton d'attaque ce round." };
  }
  if (!Array.isArray(attackerUids) || attackerUids.length === 0) {
    return { ok: false, error: "Sélectionne au moins 1 attaquant." };
  }
  // Vérifie unicité.
  if (new Set(attackerUids).size !== attackerUids.length) {
    return { ok: false, error: "Doublon dans les attaquants." };
  }
  // Vérifie que chaque uid est sur le banc et peut attaquer.
  for (const uid of attackerUids) {
    const unit = player.bench.find((u) => u.uid === uid);
    if (!unit) {
      return { ok: false, error: `Unité introuvable sur le banc : ${uid}.` };
    }
    if (unit.playedThisRound) {
      return {
        ok: false,
        error: `${getCard(unit.cardCode)?.name ?? unit.cardCode} ne peut pas attaquer le round où elle est posée.`,
      };
    }
    if (unit.power <= 0) {
      return {
        ok: false,
        error: `${getCard(unit.cardCode)?.name ?? unit.cardCode} a 0 puissance — ne peut pas attaquer.`,
      };
    }
    if (unit.stunned) {
      return {
        ok: false,
        error: `${getCard(unit.cardCode)?.name ?? unit.cardCode} est étourdie — ne peut pas attaquer ce round.`,
      };
    }
  }

  // Phase 3.18+3.21 : valide les forcedBlockers (Challenger ou Vulnerable).
  if (forcedBlockerUids !== undefined) {
    if (forcedBlockerUids.length !== attackerUids.length) {
      return {
        ok: false,
        error: `forcedBlockerUids doit être de même longueur que attackerUids (${forcedBlockerUids.length} vs ${attackerUids.length}).`,
      };
    }
    const opponent = state.players[otherSeat(seatIdx)];
    for (let i = 0; i < attackerUids.length; i++) {
      const forced = forcedBlockerUids[i];
      if (forced === null || forced === undefined) continue;
      const attackerUnit = player.bench.find(
        (u) => u.uid === attackerUids[i],
      );
      if (!attackerUnit) {
        return {
          ok: false,
          error: `Attaquant introuvable lane ${i + 1}.`,
        };
      }
      // La cible doit être une unité ennemie sur le banc.
      const forcedUnit = opponent.bench.find((u) => u.uid === forced);
      if (!forcedUnit) {
        return {
          ok: false,
          error: `Bloqueur forcé introuvable côté ennemi : ${forced}.`,
        };
      }
      // Force légale si : attacker a Challenger OU target a Vulnerable.
      const attackerHasChallenger = hasKeyword(attackerUnit, "Challenger");
      const targetHasVulnerable = hasKeyword(forcedUnit, "Vulnerable");
      if (!attackerHasChallenger && !targetHasVulnerable) {
        return {
          ok: false,
          error: `Force impossible (lane ${i + 1}) : l'attaquant doit avoir Challenger OU la cible doit avoir Vulnérabilité.`,
        };
      }
    }
  }

  // Construit les lanes avec forcedBlockerUid si fourni.
  const lanes: AttackLane[] = attackerUids.map((uid, i) => ({
    attackerUid: uid,
    blockerUid: null,
    forcedBlockerUid: forcedBlockerUids?.[i] ?? null,
  }));

  // Consomme le jeton d'attaque.
  // Phase 3.10 : ephemeralAttackers compteur (Hécarim).
  const ephemeralCount = attackerUids.reduce((n, uid) => {
    const u = player.bench.find((x) => x.uid === uid);
    return n + (u && hasKeyword(u, "Ephemeral") ? 1 : 0);
  }, 0);
  const updatedPlayer: InternalPlayer = {
    ...player,
    attackToken: false,
    championCounters: {
      ...player.championCounters,
      ephemeralAttackers:
        player.championCounters.ephemeralAttackers + ephemeralCount,
    },
  };
  const newPlayers: [InternalPlayer, InternalPlayer] = [...state.players] as [
    InternalPlayer,
    InternalPlayer,
  ];
  newPlayers[seatIdx] = updatedPlayer;

  // Phase 3.74 : déclenche on-attack pour chaque attaquant qui a une
  // ability registrée. État de base (avec attackInProgress posé) avant
  // les triggers pour que les effets puissent voir les lanes.
  let stateAfter: InternalState = {
    ...state,
    players: newPlayers,
    activeSeatIdx: otherSeat(seatIdx),
    consecutivePasses: 0,
    attackInProgress: { attackerSeatIdx: seatIdx, lanes },
    log: [
      ...state.log,
      `${player.username} déclare une attaque (${lanes.length} unité${lanes.length > 1 ? "s" : ""}).`,
    ],
  };
  for (const uid of attackerUids) {
    const u = stateAfter.players[seatIdx].bench.find((x) => x.uid === uid);
    if (!u) continue;
    stateAfter = triggerOnAttack(stateAfter, u.cardCode, seatIdx, uid);
    if (stateAfter.phase === "ended") break;
  }

  // Phase 3.78 : Support keyword. Pour chaque attaquant avec Support à
  // l'index i (i < lanes.length-1), apply RUNETERRA_SUPPORT_EFFECTS à
  // l'attaquant de la lane i+1.
  for (let i = 0; i < attackerUids.length - 1; i++) {
    const supporter = stateAfter.players[seatIdx].bench.find(
      (x) => x.uid === attackerUids[i],
    );
    if (!supporter) continue;
    if (!hasKeyword(supporter, "Support")) continue;
    stateAfter = triggerOnSupport(
      stateAfter,
      supporter.cardCode,
      seatIdx,
      attackerUids[i + 1],
    );
    if (stateAfter.phase === "ended") break;
  }

  return { ok: true, state: stateAfter };
}

/** Le défenseur assigne ses bloqueurs (1 par lane, ou null pour laisser
 *  passer au nexus). Phase 3.3 : combat se résout immédiatement après
 *  l'assignement (pas de fenêtre de réponse — Phase 3.4 ajoutera les
 *  spells durant le combat).
 *
 *   • blockerAssignments : tableau parallèle aux lanes, chaque entrée est
 *     soit un uid d'unité du défenseur, soit null (laisse passer au nexus)
 *   • Vérifie phase=round, c'est ton tour, attackInProgress active, tu es
 *     bien le défenseur
 *   • Vérifie tableau de bonne longueur, bloqueurs uniques, présents sur
 *     ton banc
 *   • Résolution simultanée : chaque attaquant + bloqueur s'inflige
 *     mutuellement leur puissance ; si pas de bloqueur, dégâts au nexus
 *     ennemi
 *   • Retire les unités mortes (damage >= health)
 *   • Reset attackInProgress, switch priorité de retour à l'attaquant
 *   • Vérifie game over (nexus <= 0)
 */
export function assignBlockers(
  state: InternalState,
  seatIdx: 0 | 1,
  blockerAssignments: (string | null)[],
): EngineResult {
  if (state.phase !== "round") {
    return { ok: false, error: "La partie n'est pas en round." };
  }
  if (state.activeSeatIdx !== seatIdx) {
    return { ok: false, error: "Ce n'est pas ton tour." };
  }
  if (state.attackInProgress === null) {
    return { ok: false, error: "Aucune attaque en cours." };
  }
  if (state.attackInProgress.attackerSeatIdx === seatIdx) {
    return { ok: false, error: "Tu es l'attaquant, pas le défenseur." };
  }
  const lanes = state.attackInProgress.lanes;
  if (
    !Array.isArray(blockerAssignments) ||
    blockerAssignments.length !== lanes.length
  ) {
    return {
      ok: false,
      error: `Attendu ${lanes.length} assignements (1 par lane), reçu ${blockerAssignments?.length ?? 0}.`,
    };
  }
  const defender = state.players[seatIdx];
  const attackerSeat = state.attackInProgress.attackerSeatIdx;
  const attacker = state.players[attackerSeat];
  // Vérifie unicité des bloqueurs (un bloqueur ne peut bloquer qu'1 lane).
  const blockerSet = new Set<string>();
  for (let i = 0; i < blockerAssignments.length; i++) {
    const b = blockerAssignments[i];
    if (b === null) continue;
    if (blockerSet.has(b)) {
      return { ok: false, error: `Le bloqueur ${b} est assigné à plusieurs lanes.` };
    }
    blockerSet.add(b);
    const unit = defender.bench.find((u) => u.uid === b);
    if (!unit) {
      return { ok: false, error: `Bloqueur introuvable sur ton banc : ${b}.` };
    }
    if (unit.stunned) {
      return {
        ok: false,
        error: `${getCard(unit.cardCode)?.name ?? unit.cardCode} est étourdie — ne peut pas bloquer ce round.`,
      };
    }
    // Phase 4.8 : mot-clé CantBlock — l'unité ne peut pas être bloqueur.
    if (hasKeyword(unit, "CantBlock")) {
      return {
        ok: false,
        error: `${getCard(unit.cardCode)?.name ?? unit.cardCode} ne peut pas bloquer.`,
      };
    }
    // Validation Elusive / Fearsome : l'attaquant impose des contraintes
    // sur quels bloqueurs sont légaux.
    const lane = lanes[i];
    const attackerUnit = attacker.bench.find(
      (u) => u.uid === lane.attackerUid,
    );
    if (!attackerUnit) {
      return {
        ok: false,
        error: `Attaquant introuvable : ${lane.attackerUid}.`,
      };
    }
    const attackerName =
      getCard(attackerUnit.cardCode)?.name ?? attackerUnit.cardCode;
    const blockerName = getCard(unit.cardCode)?.name ?? unit.cardCode;
    // Phase 3.18 : Challenger — si la lane a un bloqueur forcé, le
    // défenseur ne peut assigner QUE ce bloqueur (ou null = pas de
    // bloqueur, dégâts au nexus).
    if (lane.forcedBlockerUid && lane.forcedBlockerUid !== b) {
      return {
        ok: false,
        error: `${attackerName} (Challenger) force le blocage par ${
          getCard(
            attacker.bench.find((u) => u.uid === lane.forcedBlockerUid!)
              ?.cardCode ?? "",
          )?.name ?? lane.forcedBlockerUid
        } — tu dois assigner ce bloqueur ou aucun (lane ${i + 1}).`,
      };
    }
    if (
      hasKeyword(attackerUnit, "Elusive") &&
      !hasKeyword(unit, "Elusive") &&
      !hasKeyword(unit, "Sharpsight")
    ) {
      return {
        ok: false,
        error: `${attackerName} est Insaisissable — seul un bloqueur Insaisissable ou avec Précision peut le bloquer (${blockerName} n'a aucun des deux).`,
      };
    }
    if (hasKeyword(attackerUnit, "Fearsome") && unit.power < 3) {
      return {
        ok: false,
        error: `${attackerName} est Redoutable — bloqueur ${blockerName} a une puissance < 3.`,
      };
    }
  }

  // Compose les lanes finales (avec bloqueurs).
  const finalLanes: AttackLane[] = lanes.map((lane, i) => ({
    attackerUid: lane.attackerUid,
    blockerUid: blockerAssignments[i],
  }));

  return {
    ok: true,
    state: resolveCombat({ ...state, attackInProgress: { ...state.attackInProgress, lanes: finalLanes } }),
  };
}

/** Applique des dégâts à une unité en respectant Tough (-1) et Barrier
 *  (annule la 1re instance ce round). Mutate l'objet target en place.
 *  Retourne le nombre de dégâts effectivement infligés (utile pour
 *  Lifesteal). Phase 3.10 : trace damageTaken pour Braum level-up. */
function applyDamageToUnit(
  target: RuneterraBattleUnit,
  rawAmount: number,
): number {
  if (rawAmount <= 0) return 0;
  // Barrier annule la 1re instance entière (avant Tough).
  if (hasKeyword(target, "Barrier") && !target.barrierUsed) {
    target.barrierUsed = true;
    return 0;
  }
  let amount = rawAmount;
  if (hasKeyword(target, "Tough")) {
    amount = Math.max(0, amount - 1);
  }
  target.damage += amount;
  target.damageTaken += amount;
  return amount;
}

/** Résolution interne du combat. Pour chaque lane :
 *   • Si bloqueur : attaquant + bloqueur s'infligent leur puissance, en
 *     respectant Quick Strike (timing), Tough (-1), Barrier (annule 1re
 *     instance), Overwhelm (excès → nexus), Lifesteal (heal nexus du
 *     porteur)
 *   • Si pas de bloqueur, l'attaquant frappe le nexus ennemi (avec
 *     Lifesteal si applicable)
 *  Puis retire les unités mortes, clear attackInProgress, redonne la
 *  priorité à l'attaquant, vérifie game over.
 */
function resolveCombat(state: InternalState): InternalState {
  if (state.attackInProgress === null) return state;
  const attackerSeat = state.attackInProgress.attackerSeatIdx;
  const defenderSeat = otherSeat(attackerSeat);
  let attackerPlayer = state.players[attackerSeat];
  let defenderPlayer = state.players[defenderSeat];
  let nexusDamageTotal = 0;
  let attackerNexusHeal = 0; // Lifesteal de l'attaquant
  let teemoNexusStrikes = 0; // Phase 3.13 : compteur frappes Teemo (01PZ008)
  // Phase 3.75 : tracking par cardCode des nexus strikes pour fire les
  // RUNETERRA_NEXUS_STRIKE_EFFECTS après postCombatState.
  const nexusStrikersByCode = new Map<string, number>();
  const events: string[] = [];

  // Indexe les unités pour mutation locale.
  const attackerBench = attackerPlayer.bench.map((u) => ({ ...u }));
  const defenderBench = defenderPlayer.bench.map((u) => ({ ...u }));
  // Phase 3.10 : snapshot des dégâts pré-combat pour calculer
  // alliesSurvivedDamage (Vladimir) après résolution.
  const preCombatDamage = new Map<string, number>();
  for (const u of attackerBench) preCombatDamage.set(u.uid, u.damage);
  for (const u of defenderBench) preCombatDamage.set(u.uid, u.damage);

  for (const lane of state.attackInProgress.lanes) {
    const attacker = attackerBench.find((u) => u.uid === lane.attackerUid);
    if (!attacker) continue;
    attacker.strikes++; // Phase 3.5 : tracker pour Garen et autres
    const attackerName = getCard(attacker.cardCode)?.name ?? attacker.cardCode;
    if (lane.blockerUid !== null) {
      const blocker = defenderBench.find((u) => u.uid === lane.blockerUid);
      if (!blocker) {
        // Bloqueur disparu (cas pathologique) : nexus prend les dégâts.
        nexusDamageTotal += attacker.power;
        if (hasKeyword(attacker, "Lifesteal")) {
          attackerNexusHeal += attacker.power;
        }
        events.push(
          `${attackerName} frappe le nexus pour ${attacker.power} (bloqueur introuvable).`,
        );
        continue;
      }
      const blockerName = getCard(blocker.cardCode)?.name ?? blocker.cardCode;
      // Modèle de timing à 2 phases (QS = phase 1 only, DS = phase 1 + 2,
      // sinon = phase 2 only). Frappes phase 1 simultanées entre elles ;
      // unités mortes à la fin de phase 1 ne frappent pas en phase 2.
      const aDS = hasKeyword(attacker, "DoubleStrike");
      const bDS = hasKeyword(blocker, "DoubleStrike");
      const aPhases = strikePhases(attacker, aDS);
      const bPhases = strikePhases(blocker, bDS);
      const blockerHealthBefore = blocker.health - blocker.damage;
      let dealtToBlocker = 0;
      let dealtToAttacker = 0;

      // Phase 1 : simultanée
      const aPhase1 = aPhases.filter((p) => p === 1).length;
      const bPhase1 = bPhases.filter((p) => p === 1).length;
      for (let s = 0; s < aPhase1; s++) {
        dealtToBlocker += applyDamageToUnit(blocker, attacker.power);
      }
      for (let s = 0; s < bPhase1; s++) {
        dealtToAttacker += applyDamageToUnit(attacker, blocker.power);
      }
      const blockerDeadAfterP1 = blocker.damage >= blocker.health;
      const attackerDeadAfterP1 = attacker.damage >= attacker.health;

      // Phase 2 : simultanée, mais seules les unités vivantes frappent
      const aPhase2 = aPhases.filter((p) => p === 2).length;
      const bPhase2 = bPhases.filter((p) => p === 2).length;
      if (!attackerDeadAfterP1) {
        for (let s = 0; s < aPhase2; s++) {
          dealtToBlocker += applyDamageToUnit(blocker, attacker.power);
        }
      }
      if (!blockerDeadAfterP1) {
        for (let s = 0; s < bPhase2; s++) {
          dealtToAttacker += applyDamageToUnit(attacker, blocker.power);
        }
      }

      // Overwhelm : si bloqueur tué et attaquant a Overwhelm, l'excès
      // (puissance attaquant - PV restants du bloqueur AVANT le coup)
      // file au nexus.
      if (
        hasKeyword(attacker, "Overwhelm") &&
        blocker.damage >= blocker.health
      ) {
        const excess = Math.max(0, attacker.power - blockerHealthBefore);
        if (excess > 0) {
          nexusDamageTotal += excess;
          events.push(
            `${attackerName} (Surpuissance) overflow ${excess} dégâts au nexus.`,
          );
        }
      }

      // Lifesteal / Drain : l'attaquant heal son nexus pour les dégâts
      // effectivement infligés au bloqueur (et au nexus en cas d'Overwhelm).
      // Drain est un alias de Lifesteal pour les dégâts de combat.
      if (
        hasKeyword(attacker, "Lifesteal") ||
        hasKeyword(attacker, "Drain")
      ) {
        attackerNexusHeal += dealtToBlocker;
      }

      const dsTag = aDS ? " DS" : "";
      const aTag = (aPhase1 > 0 && aPhase2 === 0 ? " QS" : "") + dsTag;
      const bTag =
        (bPhase1 > 0 && bPhase2 === 0 ? " QS" : "") + (bDS ? " DS" : "");
      events.push(
        `${attackerName} (${attacker.power}|${attacker.health - attacker.damage})${aTag} ↔ ${blockerName} (${blocker.power}|${blocker.health - blocker.damage})${bTag}.`,
      );
      // dealtToAttacker conservé pour debug futur (Lifesteal sur bloqueurs).
      void dealtToAttacker;
    } else {
      // Aucun bloqueur : nexus.
      nexusDamageTotal += attacker.power;
      // Double Strike contre le nexus : 2 frappes (lecture stricte des règles).
      if (hasKeyword(attacker, "DoubleStrike")) {
        nexusDamageTotal += attacker.power;
      }
      if (
        hasKeyword(attacker, "Lifesteal") ||
        hasKeyword(attacker, "Drain")
      ) {
        attackerNexusHeal += attacker.power;
      }
      // Phase 3.12 : nexusStrikes per-unit (Zed level-up).
      const strikesThisLane = hasKeyword(attacker, "DoubleStrike") ? 2 : 1;
      attacker.nexusStrikes += strikesThisLane;
      // Phase 3.13 : Teemo (01PZ008) plante 5 Champignons vénéneux par
      // frappe au nexus (Frappe du Nexus). Crédit au joueur attaquant.
      if (attacker.cardCode === "01PZ008") {
        teemoNexusStrikes += strikesThisLane;
      }
      // Phase 3.75 : track les nexus strikers pour les triggers (Teemo,
      // Ezreal). Key par cardCode (un seul effet par cardCode).
      nexusStrikersByCode.set(
        attacker.cardCode,
        (nexusStrikersByCode.get(attacker.cardCode) ?? 0) + strikesThisLane,
      );
      events.push(`${attackerName} frappe le nexus pour ${attacker.power}.`);
    }
  }

  // Phase 3.5 : crédit kills aux attaquants/bloqueurs qui ont tué un ennemi.
  // Phase 3.8b : Fury — si killer a Fury, +1|+1 permanent (avant retrait
  // des morts ; si killer meurt aussi en mutual, le buff disparaît avec lui).
  for (const lane of state.attackInProgress.lanes) {
    if (lane.blockerUid === null) continue;
    const attacker = attackerBench.find((u) => u.uid === lane.attackerUid);
    const blocker = defenderBench.find((u) => u.uid === lane.blockerUid);
    if (!attacker || !blocker) continue;
    if (blocker.damage >= blocker.health) {
      attacker.kills++;
      if (hasKeyword(attacker, "Fury")) {
        attacker.power += 1;
        attacker.health += 1;
        events.push(
          `${getCard(attacker.cardCode)?.name ?? attacker.cardCode} (Fureur) gagne +1|+1.`,
        );
      }
    }
    if (attacker.damage >= attacker.health) {
      blocker.kills++;
      if (hasKeyword(blocker, "Fury")) {
        blocker.power += 1;
        blocker.health += 1;
        events.push(
          `${getCard(blocker.cardCode)?.name ?? blocker.cardCode} (Fureur) gagne +1|+1.`,
        );
      }
    }
  }

  // Phase 6.1 : Fiora L2 (01DE045T1) win condition — si Fiora L2 vient
  // de tuer son 4e ennemi ET est encore vivante, le contrôleur gagne
  // immédiatement la partie (« Lorsque j'ai tué 4 ennemis et survécu,
  // vous remportez la partie. »). Check sur les 2 bancs.
  for (const seat of [0, 1] as const) {
    const bench = seat === attackerSeat ? attackerBench : defenderBench;
    const fioraL2 = bench.find(
      (u) =>
        u.cardCode === "01DE045T1" &&
        u.kills >= 4 &&
        u.damage < u.health,
    );
    if (fioraL2) {
      events.push(
        `🏆 Fiora a vaincu 4 ennemis — ${state.players[seat].username} remporte la partie !`,
      );
      // Force le nexus de l'adversaire à 0 pour déclencher la fin de partie
      // dans le flow normal (sera détecté plus bas par le check nexus).
      const oppSeatIdx = otherSeat(seat);
      const opp = state.players[oppSeatIdx];
      const newPlayersFiora: [InternalPlayer, InternalPlayer] = [
        state.players[0],
        state.players[1],
      ] as [InternalPlayer, InternalPlayer];
      newPlayersFiora[oppSeatIdx] = { ...opp, nexusHealth: 0 };
      state = { ...state, players: newPlayersFiora };
      break;
    }
  }

  // Retire les unités mortes (damage >= health) et incrémente alliesDied
  // sur le joueur correspondant (Phase 3.5 : compteur Lucian etc.).
  // Phase 3.9b : collecte les morts pour Last Breath.
  // Phase 3.10 : Tryndamere special — ne meurt pas, gagne un niveau à la place.
  const attackerDied = { count: 0 };
  const defenderDied = { count: 0 };
  const attackerDeadUnits: RuneterraBattleUnit[] = [];
  const defenderDeadUnits: RuneterraBattleUnit[] = [];
  const newAttackerBench = attackerBench.filter((u) => {
    if (u.damage >= u.health) {
      if (tryReviveOnDeath(u)) {
        events.push(
          `${getCard(u.cardCode)?.name ?? u.cardCode} gagne un niveau au lieu de mourir !`,
        );
        return true; // reste sur le banc
      }
      events.push(
        `${getCard(u.cardCode)?.name ?? u.cardCode} (attaquant) meurt.`,
      );
      attackerDied.count++;
      attackerDeadUnits.push(u);
      return false;
    }
    return true;
  });
  const newDefenderBench = defenderBench.filter((u) => {
    if (u.damage >= u.health) {
      if (tryReviveOnDeath(u)) {
        events.push(
          `${getCard(u.cardCode)?.name ?? u.cardCode} gagne un niveau au lieu de mourir !`,
        );
        return true;
      }
      events.push(
        `${getCard(u.cardCode)?.name ?? u.cardCode} (défenseur) meurt.`,
      );
      defenderDied.count++;
      defenderDeadUnits.push(u);
      return false;
    }
    return true;
  });

  // Phase 3.10 : alliesSurvivedDamage compteur (Vladimir) — alliés qui
  // ont pris des dégâts ce combat MAIS ont survécu.
  let attackerSurvivedDmg = 0;
  for (const u of newAttackerBench) {
    const pre = preCombatDamage.get(u.uid) ?? 0;
    if (u.damage > pre) attackerSurvivedDmg++;
  }
  let defenderSurvivedDmg = 0;
  for (const u of newDefenderBench) {
    const pre = preCombatDamage.get(u.uid) ?? 0;
    if (u.damage > pre) defenderSurvivedDmg++;
  }

  // Applique les dégâts au nexus du défenseur + Lifesteal heal de
  // l'attaquant (capped à initialNexusHealth).
  const cfg = RUNETERRA_BATTLE_CONFIG;
  const newDefenderNexus = defenderPlayer.nexusHealth - nexusDamageTotal;
  const newAttackerNexus = Math.min(
    cfg.initialNexusHealth,
    attackerPlayer.nexusHealth + attackerNexusHeal,
  );
  if (attackerNexusHeal > 0) {
    events.push(
      `${attackerPlayer.username} regagne ${attackerNexusHeal} PV nexus (Vol de vie).`,
    );
  }
  // Phase 3.9c : unitsDied = toutes les morts (alliées + ennemies) — pour
  // Thresh. On crédite chaque joueur de la totalité (ils voient les mêmes
  // morts dans la partie).
  // Phase 3.10 : alliesSurvivedDamage par côté.
  const totalDied = attackerDied.count + defenderDied.count;
  attackerPlayer = {
    ...attackerPlayer,
    bench: newAttackerBench,
    nexusHealth: newAttackerNexus,
    alliesDiedThisRound:
      attackerPlayer.alliesDiedThisRound + attackerDied.count,
    championCounters: {
      ...attackerPlayer.championCounters,
      alliesDied:
        attackerPlayer.championCounters.alliesDied + attackerDied.count,
      unitsDied: attackerPlayer.championCounters.unitsDied + totalDied,
      alliesSurvivedDamage:
        attackerPlayer.championCounters.alliesSurvivedDamage +
        attackerSurvivedDmg,
      // Phase 3.13 : 5 Champignons par frappe Teemo au nexus.
      mushroomsPlanted:
        attackerPlayer.championCounters.mushroomsPlanted +
        teemoNexusStrikes * 5,
    },
  };
  defenderPlayer = {
    ...defenderPlayer,
    bench: newDefenderBench,
    nexusHealth: newDefenderNexus,
    alliesDiedThisRound:
      defenderPlayer.alliesDiedThisRound + defenderDied.count,
    championCounters: {
      ...defenderPlayer.championCounters,
      alliesDied:
        defenderPlayer.championCounters.alliesDied + defenderDied.count,
      unitsDied: defenderPlayer.championCounters.unitsDied + totalDied,
      alliesSurvivedDamage:
        defenderPlayer.championCounters.alliesSurvivedDamage +
        defenderSurvivedDmg,
    },
  };

  const newPlayers: [InternalPlayer, InternalPlayer] = [
    state.players[0],
    state.players[1],
  ] as [InternalPlayer, InternalPlayer];
  newPlayers[attackerSeat] = attackerPlayer;
  newPlayers[defenderSeat] = defenderPlayer;

  // Game over si nexus défenseur <= 0 (nexus attaquant ne peut pas mourir
  // pendant son propre tour d'attaque, mais on check par sécurité).
  const log = [...state.log, ...events];
  if (newDefenderNexus <= 0) {
    log.push(
      `${attackerPlayer.username} remporte la partie (nexus de ${defenderPlayer.username} à ${newDefenderNexus}).`,
    );
    return {
      ...state,
      players: newPlayers,
      attackInProgress: null,
      phase: "ended",
      winnerSeatIdx: attackerSeat,
      log,
    };
  }

  // État principal après combat.
  let postCombatState: InternalState = {
    ...state,
    players: newPlayers,
    attackInProgress: null,
    activeSeatIdx: attackerSeat, // priorité retourne à l'attaquant
    consecutivePasses: 0,
    log,
  };

  // Phase 3.9b : déclenche Last Breath pour chaque unité morte (attaquants
  // d'abord puis défenseurs, ordre arbitraire au sein d'un côté).
  for (const dead of attackerDeadUnits) {
    postCombatState = triggerLastBreath(postCombatState, dead, attackerSeat);
    if (postCombatState.phase === "ended") return postCombatState;
  }
  for (const dead of defenderDeadUnits) {
    postCombatState = triggerLastBreath(postCombatState, dead, defenderSeat);
    if (postCombatState.phase === "ended") return postCombatState;
  }

  // Phase 3.75 : déclenche on-nexus-strike pour chaque attaquant ayant
  // frappé le nexus (Teemo plante 5 Mushrooms par strike, Ezreal crée
  // un Tir mystique par strike). Une fois par strike (DoubleStrike =
  // 2 fires).
  for (const [cardCode, strikeCount] of nexusStrikersByCode) {
    for (let i = 0; i < strikeCount; i++) {
      // attackerUid not strictly needed (registry effects don't use
      // triggerSourceUid yet pour nexus strikes), pass empty string.
      postCombatState = triggerOnNexusStrike(
        postCombatState,
        cardCode,
        attackerSeat,
        "",
      );
      if (postCombatState.phase === "ended") return postCombatState;
    }
  }

  // Phase 3.75 + Phase 5.11 : Braum L1 (01FR009) « la 1re fois que je
  // survis à des dégâts » (survivedDamageOnce flag). Braum L2 (01FR009T1)
  // a aussi été ajouté ici — note technique : sans damageTakenThisRound
  // il fonctionne aussi en once-per-game (close enough du Riot actuel
  // pour cette session). Scan les 2 benches.
  for (const seat of [0, 1] as const) {
    const p = postCombatState.players[seat];
    const braums = p.bench.filter(
      (u) =>
        (u.cardCode === "01FR009" || u.cardCode === "01FR009T1") &&
        u.damageTaken > 0 &&
        !u.survivedDamageOnce,
    );
    if (braums.length === 0) continue;
    if (p.bench.length >= RUNETERRA_BATTLE_CONFIG.maxBench) {
      // Pas de slot, mais on flag quand même pour ne pas re-trigger.
      const newBench = p.bench.map((u) =>
        braums.includes(u) ? { ...u, survivedDamageOnce: true } : u,
      );
      const psA: [InternalPlayer, InternalPlayer] = [
        postCombatState.players[0],
        postCombatState.players[1],
      ] as [InternalPlayer, InternalPlayer];
      psA[seat] = { ...p, bench: newBench };
      postCombatState = { ...postCombatState, players: psA };
      continue;
    }
    let updatedBench = p.bench.map((u) =>
      braums.includes(u) ? { ...u, survivedDamageOnce: true } : u,
    );
    const slotsAvailable = RUNETERRA_BATTLE_CONFIG.maxBench - updatedBench.length;
    const toSummon = Math.min(braums.length, slotsAvailable);
    for (let i = 0; i < toSummon; i++) {
      const newUid = `${seat}-bp-${postCombatState.round}-${postCombatState.log.length}-${i}`;
      updatedBench = [...updatedBench, createUnit(newUid, "01FR053")];
    }
    const psB: [InternalPlayer, InternalPlayer] = [
      postCombatState.players[0],
      postCombatState.players[1],
    ] as [InternalPlayer, InternalPlayer];
    psB[seat] = { ...p, bench: updatedBench };
    postCombatState = {
      ...postCombatState,
      players: psB,
      log: [
        ...postCombatState.log,
        `${p.username} : Braum invoque ${toSummon} × Poro puissant (a survécu).`,
      ],
    };
  }

  return checkLevelUps(postCombatState);
}

// ────────────────────── Phase 3.5 : level-up champions ───────────────────

/** Phase 3.10 : Tryndamere special — au lieu de mourir, il gagne un niveau
 *  et reste sur le banc à pleine vie. Mutate l'unité en place et retourne
 *  true si le revive a été appliqué (skip le retrait du banc).
 *
 *  Pattern extensible si d'autres champions ajoutent un "death-replace"
 *  trigger (ex Anivia → Œuf d'Anivia est différent : revive AS DIFFERENT
 *  CARD plutôt que level-up — futur 3.10.x). */
function tryReviveOnDeath(u: RuneterraBattleUnit): boolean {
  // Tryndamere niveau 1
  if (u.cardCode === "01FR039" && u.level === 1) {
    const lvl2 = getCard("01FR039T2");
    if (lvl2 && lvl2.type === "Unit") {
      u.cardCode = "01FR039T2";
      u.power = lvl2.attack ?? u.power;
      u.health = lvl2.health ?? u.health;
      u.keywords = lvl2.keywordRefs ?? u.keywords;
      u.level = 2;
      u.damage = 0;
      return true;
    }
  }
  return false;
}


/** Registry des conditions de level-up. Chaque champion a une `check`
 *  pure-fonction qui regarde l'état et l'unité, et retourne true si la
 *  condition est remplie. `levelUpCardCode` est la cardCode de la forme
 *  niveau 2 (par convention Riot : suffixe T2 sur le cardCode niveau 1).
 *
 *  Phase 3.5 : 2 exemples implémentés (Garen, Fiora). Les autres champions
 *  sont à ajouter ici au fur et à mesure (voir `levelupDescriptionRaw` dans
 *  la data set 1 pour les conditions).
 */
const LEVEL_UP_REGISTRY: Record<
  string,
  {
    levelUpCardCode: string;
    check: (state: InternalState, unit: RuneterraBattleUnit, seatIdx: 0 | 1) => boolean;
  }
> = {
  // ── Demacia
  // Phase 4.0 : 14 mappings sur 24 pointaient vers le SPELL Champion
  // (T2) au lieu de la vraie forme niveau 2 Unit. Le check
  // `lvl2.type !== "Unit"` skippait silencieusement → champions ne
  // levelaient jamais. Convention LoR Set 1 inconsistente : pour
  // certains champions T1 = level 2 Unit, pour d'autres T2 ou T3.
  // Garen — « J'ai frappé deux fois. » (T1 = "Garen" Unit 6|6 + Reg + RoundStart Rally)
  "01DE012": {
    levelUpCardCode: "01DE012T1",
    check: (_s, u) => u.strikes >= 2,
  },
  // Fiora — « J'ai tué 2 ennemis. » (T1 = "Fiora" Unit 5|5 + Challenger)
  "01DE045": {
    levelUpCardCode: "01DE045T1",
    check: (_s, u) => u.kills >= 2,
  },
  // Lucian — « J'ai vu au moins 4 alliés ou 1 Senna alliée mourir. »
  // Senna trigger : si une Senna (01DE038) alliée meurt, set un flag qui
  // permet à Lucian de level-up immédiatement. (T1 = "Lucian" Unit 3|2 + DoubleStrike)
  "01DE022": {
    levelUpCardCode: "01DE022T1",
    check: (s, _u, seat) =>
      s.players[seat].championCounters.alliesDied >= 4 ||
      s.players[seat].championCounters.sennaAlliedDied >= 1,
  },
  // Lux — « Vous avez lancé au moins 6 mana en sorts. » (T2 = "Lux" Unit 4|6 + Barrier)
  "01DE042": {
    levelUpCardCode: "01DE042T2",
    check: (s, _u, seat) =>
      s.players[seat].championCounters.spellManaSpent >= 6,
  },

  // ── Freljord
  // Anivia — « Vous avez atteint l'Illumination. » (manaMax = 10)
  // (T3 = "Anivia" Unit 4|6 + LastBreath revive Egg, attack +1 dmg → 2)
  "01FR024": {
    levelUpCardCode: "01FR024T3",
    check: (s, _u, seat) => s.players[seat].manaMax >= 10,
  },

  // ── Ionia
  // Karma — « Vous avez atteint l'Illumination. »
  // (T1 = "Karma" Unit 5|4 + RoundEnd random spell + spell double-cast)
  "01IO041": {
    levelUpCardCode: "01IO041T1",
    check: (s, _u, seat) => s.players[seat].manaMax >= 10,
  },

  // ── Noxus
  // Katarina — « J'ai frappé une fois. » (skip recall bonus)
  "01NX042": {
    levelUpCardCode: "01NX042T2",
    check: (_s, u) => u.strikes >= 1,
  },
  // Darius — « Je vois que le Nexus ennemi a la moitié de ses PV de base
  // ou moins. » (initial = 20, donc <= 10).
  "01NX038": {
    levelUpCardCode: "01NX038T2",
    check: (s, _u, seat) => s.players[otherSeat(seat)].nexusHealth <= 10,
  },

  // ── Piltover & Zaun
  // Jinx — « Je vois que votre main est vide. »
  // (T1 = "Jinx" Unit 5|4 + Quick Attack, on cast spell create Get Excited)
  "01PZ040": {
    levelUpCardCode: "01PZ040T1",
    check: (s, _u, seat) => s.players[seat].hand.length === 0,
  },

  // ── Îles obscures
  // Kalista — « J'ai vu au moins 3 alliés mourir. » (T2 = Unit "Kalista")
  "01SI030": {
    levelUpCardCode: "01SI030T2",
    check: (s, _u, seat) => s.players[seat].championCounters.alliesDied >= 3,
  },
  // Thresh — « J'ai vu au moins 6 unités mourir. » (T1 = "Thresh" Unit)
  // unitsDied compte des deux côtés (toute mort observée).
  "01SI052": {
    levelUpCardCode: "01SI052T1",
    check: (s, _u, seat) => s.players[seat].championCounters.unitsDied >= 6,
  },

  // ── Ionia (Phase 3.9c)
  // Shen — « J'ai vu des alliés bénéficier de Barrière 5 fois. »
  // (T1 = "Shen" Unit 4|6, on barrier-grant +3|+0)
  "01IO032": {
    levelUpCardCode: "01IO032T1",
    check: (s, _u, seat) =>
      s.players[seat].championCounters.barriersGranted >= 5,
  },

  // ── Piltover & Zaun (Phase 3.9c)
  // Ezreal — « Vous avez ciblé des ennemis au moins 8 fois. »
  // (T1 = "Ezreal" Unit, on enemy-target deal 2 to enemy nexus)
  "01PZ036": {
    levelUpCardCode: "01PZ036T1",
    check: (s, _u, seat) =>
      s.players[seat].championCounters.enemyTargetCount >= 8,
  },

  // ── Freljord (Phase 3.9c)
  // Ashe — « Vous avez réduit à 0 la puissance d'au moins 5 ennemis. »
  // Approximation : enemiesFrostbitten count (autres sources de power=0
  // pourront s'ajouter en 3.9c.x — Stun, Silence, etc.).
  "01FR038": {
    levelUpCardCode: "01FR038T2",
    check: (s, _u, seat) =>
      s.players[seat].championCounters.enemiesFrostbitten >= 5,
  },

  // ── Phase 3.10
  // Braum (Freljord) — « J'ai survécu à au moins 10 pts de dégâts au total. »
  // (T1 = "Braum" Unit 1|7 + Tough, on survive damage summon Mighty Poro)
  "01FR009": {
    levelUpCardCode: "01FR009T1",
    check: (_s, u) => u.damageTaken >= 10,
  },
  // Vladimir (Noxus) — « Au moins 5 alliés ont survécu à des dégâts. »
  // (T1 = "Vladimir" Unit 6|6 + Skill drain ally for damage to enemy)
  "01NX006": {
    levelUpCardCode: "01NX006T1",
    check: (s, _u, seat) =>
      s.players[seat].championCounters.alliesSurvivedDamage >= 5,
  },
  // Hécarim (Îles obscures) — « Vous avez attaqué avec au moins 7 alliés
  // éphémères. » (T1 = "Hecarim" Unit, attack +3|+0 to ephemeral allies)
  "01SI042": {
    levelUpCardCode: "01SI042T1",
    check: (s, _u, seat) =>
      s.players[seat].championCounters.ephemeralAttackers >= 7,
  },
  // Elise (Îles obscures) — « Début du round : vous avez au moins 3 autres
  // araignées. » Simplifié : check à chaque state update (au moment où la
  // condition est remplie, level-up se déclenche — pas strictement « début
  // de round » mais effet équivalent).
  "01SI053": {
    levelUpCardCode: "01SI053T2",
    check: (s, u, seat) => {
      let spiders = 0;
      for (const other of s.players[seat].bench) {
        if (other.uid === u.uid) continue; // exclure Elise elle-même
        const card = getCard(other.cardCode);
        if (card?.subtypes?.includes("ARAIGNÉE")) spiders++;
      }
      return spiders >= 3;
    },
  },
  // Tryndamere (Freljord) : level-up déclenché par tryReviveOnDeath() dans
  // resolveCombat (special death-replace). Pas via cette registry — mais
  // on note ici pour clarté future. Si on veut le check générique aussi
  // (ex pour `checkLevelUps()` post-combat sur un Tryndamere déjà mort),
  // ajouter une condition false :
  "01FR039": {
    levelUpCardCode: "01FR039T2",
    check: () => false, // jamais via checkLevelUps — handle via tryReviveOnDeath
  },

  // ── Phase 3.11 : Yasuo
  // Yasuo (Ionia) — « Vous avez étourdi ou rappelé au moins 5 unités. »
  // Le compteur enemyStunned est incrémenté par : recall-ally, recall-any,
  // stun-enemy (cf applySpellEffect). (T1 = "Yasuo" Unit 5|5, stun/recall
  // trigger gives him a free strike)
  "01IO015": {
    levelUpCardCode: "01IO015T1",
    check: (s, _u, seat) =>
      s.players[seat].championCounters.enemyStunned >= 5,
  },

  // ── Phase 3.12 : Zed + Heimerdinger
  // Zed (Ionia) — « J'ai vu des Ombres vivantes alliées ou moi-même
  // frapper à 2 reprises le Nexus ennemi. » Somme des nexusStrikes
  // du Zed lui-même + toutes les Ombres vivantes (cardCode 01IO009T1)
  // sur son banc.
  "01IO009": {
    levelUpCardCode: "01IO009T2",
    check: (s, u, seat) => {
      let total = u.nexusStrikes;
      for (const ally of s.players[seat].bench) {
        if (ally.uid === u.uid) continue;
        if (ally.cardCode === "01IO009T1") total += ally.nexusStrikes;
      }
      return total >= 2;
    },
  },
  // Heimerdinger (Piltover & Zaun) — « La puissance totale des alliés
  // Technologie que je vous ai vu invoquer est d'au moins 12. »
  // techPowerSummoned cumule la puissance imprimée de chaque allié
  // TECHNOLOGIE joué (incrémenté dans playUnit).
  // (T10 = "Heimerdinger" Unit 3|5 — convention bizarre, T1-T9 = turrets)
  "01PZ056": {
    levelUpCardCode: "01PZ056T10",
    check: (s, _u, seat) =>
      s.players[seat].championCounters.techPowerSummoned >= 12,
  },

  // ── Phase 3.13 : Teemo + Draven (les 2 derniers Set 1)
  // Teemo (Piltover & Zaun) — « Vous avez planté au moins 15 Champignons
  // vénéneux. » Approximation : compte 5 Champignons par frappe Teemo
  // au nexus (cf resolveCombat). Donc 3 frappes Teemo nexus = 15.
  // Note : la version Riot inclut aussi des plants par d'autres Yordle
  // Mushroom planters — non implémentés ici.
  "01PZ008": {
    levelUpCardCode: "01PZ008T2",
    check: (s, _u, seat) =>
      s.players[seat].championCounters.mushroomsPlanted >= 15,
  },
  // Draven (Noxus) — « J'ai frappé avec au moins 2 Haches tournoyantes
  // au total. » Approximation : check u.strikes >= 2 (Draven génère une
  // Hache à chaque frappe ou ETB par sa description, on assume qu'il l'a
  // toujours équipée — fidélité partielle, pas le vrai item system).
  // (T3 = "Draven" Unit, T1 = Hache token, T2 = Volée Spell)
  "01NX020": {
    levelUpCardCode: "01NX020T3",
    check: (_s, u) => u.strikes >= 2,
  },

  // TODO Phase 3.8d.x — Yasuo (étourdis/rappelés), Zed (Ombre Living strike),
  // Tryndamere (on-death), Ashe (frostbites stack), Braum (damage survived),
  // Vladimir (allies survived damage), Ezreal (target count), Teemo (mushroom
  // tokens), Heimerdinger (Tech allies summoned), Shen (barriers granted),
  // Hecarim (ephemeral attackers), Elise (spider count at round start),
  // Thresh (units killed both sides), Vladimir (allies survived), Draven
  // (spinning axe attacks).
};

/** Scanne tous les champions niveau 1 sur les bancs et applique le
 *  level-up si la condition de leur registry est remplie. Conserve
 *  l'uid (continuité visuelle pour le client), les dégâts cumulés, et
 *  les compteurs (strikes/kills). Mets à jour power/health/keywords
 *  depuis la carte niveau 2.
 */
function checkLevelUps(state: InternalState): InternalState {
  let newPlayers = state.players;
  const events: string[] = [];
  // Phase 3.77 : track les level-ups de Lux pour fire create-card-in-hand.
  const luxLevelUpsBySeat: [number, number] = [0, 0];

  for (const seatIdx of [0, 1] as const) {
    const player = newPlayers[seatIdx];
    let benchChanged = false;
    const newBench = player.bench.map((u) => {
      if (u.level >= 2) return u; // déjà niveau 2
      const card = getCard(u.cardCode);
      if (!card || card.supertype !== "Champion") return u;
      const entry = LEVEL_UP_REGISTRY[u.cardCode];
      if (!entry) return u; // pas encore au registry
      if (!entry.check(state, u, seatIdx)) return u;
      const lvl2 = getCard(entry.levelUpCardCode);
      if (!lvl2 || lvl2.type !== "Unit") return u; // mapping foireux, skip
      benchChanged = true;
      events.push(`${card.name} passe au niveau supérieur !`);
      // Phase 3.77 : Lux level-up bumpe le compteur pour fire l'effet
      // create Éclat final après la mutation.
      if (u.cardCode === "01DE042") {
        luxLevelUpsBySeat[seatIdx]++;
      }
      return {
        ...u,
        cardCode: entry.levelUpCardCode,
        power: lvl2.attack ?? u.power,
        health: lvl2.health ?? u.health,
        keywords: lvl2.keywordRefs ?? u.keywords,
        level: 2,
      };
    });
    if (benchChanged) {
      const updated = { ...player, bench: newBench };
      newPlayers = [...newPlayers] as [InternalPlayer, InternalPlayer];
      newPlayers[seatIdx] = updated;
    }
  }

  let newState: InternalState =
    events.length === 0
      ? state
      : { ...state, players: newPlayers, log: [...state.log, ...events] };

  // Phase 3.77 : Lux level-up — créer 1 × Éclat final (01DE042T3) en
  // main par level-up.
  for (const seatIdx of [0, 1] as const) {
    for (let i = 0; i < luxLevelUpsBySeat[seatIdx]; i++) {
      newState = applySpellEffect(
        newState,
        seatIdx,
        { type: "create-card-in-hand", cardCode: "01DE042T3" },
        null,
      );
    }
  }
  return newState;
}

/** Prédicat UI : peut-on déclarer l'attaque maintenant ? */

/** Prédicat UI : peut-on déclarer l'attaque maintenant ? */
export function canDeclareAttack(
  state: InternalState,
  seatIdx: 0 | 1,
): { ok: boolean; reason?: string } {
  if (state.phase !== "round") return { ok: false, reason: "Hors round" };
  if (state.activeSeatIdx !== seatIdx)
    return { ok: false, reason: "Pas ton tour" };
  if (state.attackInProgress !== null)
    return { ok: false, reason: "Attaque déjà en cours" };
  const player = state.players[seatIdx];
  if (!player.attackToken)
    return { ok: false, reason: "Tu n'as pas le jeton d'attaque" };
  // Au moins 1 unité éligible sur le banc.
  const eligible = player.bench.some(
    (u) => !u.playedThisRound && u.power > 0,
  );
  if (!eligible)
    return { ok: false, reason: "Aucune unité prête à attaquer sur le banc" };
  return { ok: true };
}

// ────────────────────── Prédicats client (UI) ─────────────────────────────

/** Vérifie si une carte de la main peut être jouée maintenant. Utilisé
 *  côté client pour griser les cartes injouables sans envoyer un message
 *  serveur qui sera rejeté. */
export function canPlayCard(
  state: InternalState,
  seatIdx: 0 | 1,
  handIndex: number,
): { ok: boolean; reason?: string } {
  if (state.phase !== "round") return { ok: false, reason: "Hors round" };
  if (state.activeSeatIdx !== seatIdx)
    return { ok: false, reason: "Pas ton tour" };
  const player = state.players[seatIdx];
  if (handIndex < 0 || handIndex >= player.hand.length)
    return { ok: false, reason: "Index invalide" };
  const card = getCard(player.hand[handIndex].cardCode);
  if (!card) return { ok: false, reason: "Carte inconnue" };
  if (card.type === "Unit") {
    if (player.mana < card.cost)
      return { ok: false, reason: `Mana insuffisante (${player.mana}/${card.cost})` };
    if (player.bench.length >= RUNETERRA_BATTLE_CONFIG.maxBench)
      return { ok: false, reason: "Banc plein" };
    return { ok: true };
  }
  if (card.type === "Spell") {
    const total = player.mana + player.spellMana;
    if (total < card.cost)
      return { ok: false, reason: `Mana insuffisante (${total}/${card.cost})` };
    return { ok: true };
  }
  // Phase 3.2 : Landmark/Equipment/Trap pas encore implémentés.
  return { ok: false, reason: `Type ${card.type} pas encore implémenté` };
}
