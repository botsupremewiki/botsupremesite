// Moteur de combat Legends of Runeterra — Phase 3.1 (skeleton).
//
// Pure-fonctionnel : pas de state, retourne toujours un nouvel état.
// Réutilisable côté serveur PartyKit ET côté client pour validation locale.
//
// Phase 3.1 (ce fichier) : types internes, deck building, mulligan,
// transitions de round, pioche, ressources (mana / spell mana / attack
// token). PAS encore : combat, spells, keywords, level-up champions.

import type {
  RuneterraBattlePhase,
  RuneterraBattleState,
  RuneterraBattleUnit,
  RuneterraCardData,
  RuneterraPlayerPublicState,
  RuneterraSelfState,
  SpellEffect,
} from "../../../shared/types";
import {
  RUNETERRA_BATTLE_CONFIG,
  RUNETERRA_SPELL_EFFECTS,
  getSpellTargetSide,
} from "../../../shared/types";
import { RUNETERRA_BASE_SET_BY_CODE } from "../../../shared/tcg-runeterra-base";

/** Une carte de deck encapsulée (uid unique pour l'instance, cardCode pour
 *  remonter aux données riches via le set). */
export type DeckCard = {
  uid: string;
  cardCode: string;
};

/** Une lane d'attaque : 1 attaquant + 0 ou 1 bloqueur. */
export type AttackLane = {
  attackerUid: string;
  blockerUid: string | null;
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
  // Phase 3.5 : compteurs globaux pour conditions de level-up champion.
  championCounters: {
    alliesDied: number; // pour Lucian, Hécarim, etc.
    spellsCast: number; // pour Karma, Ezreal, etc.
    spellManaSpent: number; // pour Lux ("au moins 6 mana en sorts")
    enemyStunned: number; // pour Yasuo (étourdis/rappelés)
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
    endOfRoundPowerBuff: 0,
    endOfRoundHealthBuff: 0,
    frozen: false,
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
    championCounters: {
      alliesDied: 0,
      spellsCast: 0,
      spellManaSpent: 0,
      enemyStunned: 0,
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
  const newManaMax = Math.min(newRound, cfg.maxMana);
  const isFirstRound = state.round === 0; // mulligan terminé, on entre dans round 1

  // Swap attack token : l'inverse du round précédent. Au tout premier
  // round, on garde celui choisi à createInitialState.
  const newAttackTokenSeat: 0 | 1 = isFirstRound
    ? state.attackTokenSeatIdx
    : ((1 - state.attackTokenSeatIdx) as 0 | 1);

  const updatedPlayers: [InternalPlayer, InternalPlayer] = [
    refreshPlayerForRound(state.players[0], newManaMax, newAttackTokenSeat === 0, isFirstRound),
    refreshPlayerForRound(state.players[1], newManaMax, newAttackTokenSeat === 1, isFirstRound),
  ];

  const log = [
    ...state.log,
    `─── Round ${newRound} (${newManaMax} mana max). ${updatedPlayers[newAttackTokenSeat].username} a le jeton d'attaque.`,
  ];

  return {
    ...state,
    phase: "round",
    players: updatedPlayers,
    activeSeatIdx: newAttackTokenSeat,
    attackTokenSeatIdx: newAttackTokenSeat,
    round: newRound,
    consecutivePasses: 0,
    log,
  };
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
  const updatedPlayers: [InternalPlayer, InternalPlayer] = [
    applyRegeneration(expireRoundBuffs(bankSpellMana(state.players[0]))),
    applyRegeneration(expireRoundBuffs(bankSpellMana(state.players[1]))),
  ];

  // Vérifier game over.
  const p0Dead = updatedPlayers[0].nexusHealth <= 0;
  const p1Dead = updatedPlayers[1].nexusHealth <= 0;
  if (p0Dead || p1Dead) {
    const winner: 0 | 1 | null =
      p0Dead && p1Dead ? null : p0Dead ? 1 : 0;
    return {
      ...state,
      phase: "ended",
      players: updatedPlayers,
      winnerSeatIdx: winner,
      log: [
        ...state.log,
        winner === null
          ? "Égalité — les 2 nexus sont à 0."
          : `${updatedPlayers[winner].username} remporte la partie.`,
      ],
    };
  }

  // Sinon, on démarre le round suivant.
  return startRound({
    ...state,
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

/** Phase 3.7+3.8c : annule les buffs round-only à la fin du round. Soustrait
 *  endOfRoundPowerBuff/HealthBuff de power/health, puis reset les deltas.
 *  Reset aussi frozen = false (le Gel expire en fin de round). */
function expireRoundBuffs(player: InternalPlayer): InternalPlayer {
  const newBench = player.bench.map((u) => {
    if (
      u.endOfRoundPowerBuff === 0 &&
      u.endOfRoundHealthBuff === 0 &&
      !u.frozen
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

  // Sépare ce qui rentre en main vs ce qui dépasse maxHand.
  const room = Math.max(0, cfg.maxHand - player.hand.length);
  const drawn = drawnRaw.slice(0, room);
  const discarded = drawnRaw.slice(room);

  const updatedPlayer: InternalPlayer = {
    ...player,
    deck: newDeck,
    hand: [...player.hand, ...drawn],
  };
  const newPlayers: [InternalPlayer, InternalPlayer] = [...state.players] as [
    InternalPlayer,
    InternalPlayer,
  ];
  newPlayers[seatIdx] = updatedPlayer;

  return {
    state: { ...state, players: newPlayers },
    drawn,
    discarded,
  };
}

/** Mappe seat-id (0/1) → "p1"/"p2" pour l'envoi client. */
export function seatToId(seatIdx: 0 | 1): "p1" | "p2" {
  return seatIdx === 0 ? "p1" : "p2";
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
  return {
    ...projectPublic(p),
    hand: p.hand.map((c) => c.cardCode),
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
  if (player.mana < card.cost) {
    return {
      ok: false,
      error: `Mana insuffisante (${player.mana}/${card.cost}).`,
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
  const newUnit = createUnit(handCard.uid, handCard.cardCode);
  const newBench = [...player.bench, newUnit];
  const updatedPlayer: InternalPlayer = {
    ...player,
    hand: newHand,
    bench: newBench,
    mana: player.mana - card.cost,
  };

  const newPlayers: [InternalPlayer, InternalPlayer] = [...state.players] as [
    InternalPlayer,
    InternalPlayer,
  ];
  newPlayers[seatIdx] = updatedPlayer;

  return {
    ok: true,
    state: {
      ...state,
      players: newPlayers,
      activeSeatIdx: otherSeat(seatIdx),
      consecutivePasses: 0,
      log: [
        ...state.log,
        `${player.username} joue ${card.name} (coût ${card.cost}).`,
      ],
    },
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
  const totalAvailable = player.mana + player.spellMana;
  if (totalAvailable < card.cost) {
    return {
      ok: false,
      error: `Mana insuffisante (${totalAvailable}/${card.cost}, dont spell mana ${player.spellMana}).`,
    };
  }

  // Phase 3.7 : valide le ciblage si le sort en a besoin.
  const effect = RUNETERRA_SPELL_EFFECTS[handCard.cardCode];
  if (effect) {
    const validation = validateSpellTarget(state, seatIdx, effect, targetUid);
    if (!validation.ok) return { ok: false, error: validation.error };
  }

  // Mana standard d'abord, spellMana en complément.
  const fromMana = Math.min(card.cost, player.mana);
  const fromSpellMana = card.cost - fromMana;
  const newHand = [
    ...player.hand.slice(0, handIndex),
    ...player.hand.slice(handIndex + 1),
  ];
  const updatedPlayer: InternalPlayer = {
    ...player,
    hand: newHand,
    mana: player.mana - fromMana,
    spellMana: player.spellMana - fromSpellMana,
    championCounters: {
      ...player.championCounters,
      spellsCast: player.championCounters.spellsCast + 1,
      spellManaSpent: player.championCounters.spellManaSpent + card.cost,
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
    );
    newPlayers = intermediateState.players;
  }

  return {
    ok: true,
    state: checkLevelUps({
      ...intermediateState,
      activeSeatIdx: otherSeat(seatIdx),
      consecutivePasses: 0,
      log: [
        ...intermediateState.log,
        `${player.username} lance ${card.name} (coût ${card.cost}).`,
      ],
    }),
  };
}

// ────────────────────── Phase 3.7 : résolution des sorts ────────────────

/** Validation serveur : la cible passée par le client est-elle légale pour
 *  cet effet ? (le client utilise getSpellTargetSide pour piloter l'UI). */
function validateSpellTarget(
  state: InternalState,
  casterSeat: 0 | 1,
  effect: SpellEffect,
  targetUid: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  const side = getSpellTargetSide(effect);
  if (side === "none") return { ok: true };
  if (!targetUid) return { ok: false, error: "Ce sort nécessite une cible." };
  const caster = state.players[casterSeat];
  const opponent = state.players[otherSeat(casterSeat)];
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
    return { ok: true };
  }
  // any
  const found =
    caster.bench.find((u) => u.uid === targetUid) ??
    opponent.bench.find((u) => u.uid === targetUid);
  if (!found) {
    return { ok: false, error: "La cible doit être une unité." };
  }
  return { ok: true };
}

function applySpellEffect(
  state: InternalState,
  casterSeat: 0 | 1,
  effect: SpellEffect,
  targetUid: string | null,
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
      newPlayers[casterSeat] = { ...player, bench: newBench };
      return { ...state, players: newPlayers };
    }
    case "frostbite-enemy": {
      // Cherche l'ennemi (côté opposé de caster).
      const player = newPlayers[oppSeat];
      const newBench = player.bench.map((u) => {
        if (u.uid !== targetUid) return u;
        if (u.frozen) return u; // déjà gelé, no-op
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
      return { ...state, players: newPlayers };
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
      // alliesDied au joueur du côté correspondant.
      for (const seat of [casterSeat, oppSeat] as const) {
        const player = newPlayers[seat];
        const idx = player.bench.findIndex((u) => u.uid === targetUid);
        if (idx === -1) continue;
        newPlayers[seat] = {
          ...player,
          bench: [...player.bench.slice(0, idx), ...player.bench.slice(idx + 1)],
          championCounters: {
            ...player.championCounters,
            alliesDied: player.championCounters.alliesDied + 1,
          },
        };
        break;
      }
      return { ...state, players: newPlayers };
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
  }

  // Construit les lanes (sans bloqueurs).
  const lanes: AttackLane[] = attackerUids.map((uid) => ({
    attackerUid: uid,
    blockerUid: null,
  }));

  // Consomme le jeton d'attaque.
  const updatedPlayer: InternalPlayer = { ...player, attackToken: false };
  const newPlayers: [InternalPlayer, InternalPlayer] = [...state.players] as [
    InternalPlayer,
    InternalPlayer,
  ];
  newPlayers[seatIdx] = updatedPlayer;

  return {
    ok: true,
    state: {
      ...state,
      players: newPlayers,
      activeSeatIdx: otherSeat(seatIdx),
      consecutivePasses: 0,
      attackInProgress: { attackerSeatIdx: seatIdx, lanes },
      log: [
        ...state.log,
        `${player.username} déclare une attaque (${lanes.length} unité${lanes.length > 1 ? "s" : ""}).`,
      ],
    },
  };
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
 *  Lifesteal). */
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
  const events: string[] = [];

  // Indexe les unités pour mutation locale.
  const attackerBench = attackerPlayer.bench.map((u) => ({ ...u }));
  const defenderBench = defenderPlayer.bench.map((u) => ({ ...u }));

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

  // Retire les unités mortes (damage >= health) et incrémente alliesDied
  // sur le joueur correspondant (Phase 3.5 : compteur Lucian etc.).
  const attackerDied = { count: 0 };
  const defenderDied = { count: 0 };
  const newAttackerBench = attackerBench.filter((u) => {
    if (u.damage >= u.health) {
      events.push(
        `${getCard(u.cardCode)?.name ?? u.cardCode} (attaquant) meurt.`,
      );
      attackerDied.count++;
      return false;
    }
    return true;
  });
  const newDefenderBench = defenderBench.filter((u) => {
    if (u.damage >= u.health) {
      events.push(
        `${getCard(u.cardCode)?.name ?? u.cardCode} (défenseur) meurt.`,
      );
      defenderDied.count++;
      return false;
    }
    return true;
  });

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
  attackerPlayer = {
    ...attackerPlayer,
    bench: newAttackerBench,
    nexusHealth: newAttackerNexus,
    championCounters: {
      ...attackerPlayer.championCounters,
      alliesDied:
        attackerPlayer.championCounters.alliesDied + attackerDied.count,
    },
  };
  defenderPlayer = {
    ...defenderPlayer,
    bench: newDefenderBench,
    nexusHealth: newDefenderNexus,
    championCounters: {
      ...defenderPlayer.championCounters,
      alliesDied:
        defenderPlayer.championCounters.alliesDied + defenderDied.count,
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

  return checkLevelUps({
    ...state,
    players: newPlayers,
    attackInProgress: null,
    activeSeatIdx: attackerSeat, // priorité retourne à l'attaquant
    consecutivePasses: 0,
    log,
  });
}

// ────────────────────── Phase 3.5 : level-up champions ───────────────────

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
  // Garen — « J'ai frappé deux fois. »
  "01DE012": {
    levelUpCardCode: "01DE012T2",
    check: (_s, u) => u.strikes >= 2,
  },
  // Fiora — « J'ai tué 2 ennemis. »
  "01DE045": {
    levelUpCardCode: "01DE045T2",
    check: (_s, u) => u.kills >= 2,
  },
  // Lucian — « J'ai vu au moins 4 alliés ou 1 Senna alliée mourir. »
  // Simplification 3.8d : on track uniquement les 4 alliés morts (Senna
  // check requiert vérif de carte spécifique — futur 3.8d.x).
  "01DE022": {
    levelUpCardCode: "01DE022T2",
    check: (s, _u, seat) => s.players[seat].championCounters.alliesDied >= 4,
  },
  // Lux — « Vous avez lancé au moins 6 mana en sorts. »
  "01DE042": {
    levelUpCardCode: "01DE042T2",
    check: (s, _u, seat) =>
      s.players[seat].championCounters.spellManaSpent >= 6,
  },

  // ── Freljord
  // Anivia — « Vous avez atteint l'Illumination. » (manaMax = 10)
  "01FR024": {
    levelUpCardCode: "01FR024T2",
    check: (s, _u, seat) => s.players[seat].manaMax >= 10,
  },

  // ── Ionia
  // Karma — « Vous avez atteint l'Illumination. »
  "01IO041": {
    levelUpCardCode: "01IO041T2",
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
  "01PZ040": {
    levelUpCardCode: "01PZ040T2",
    check: (s, _u, seat) => s.players[seat].hand.length === 0,
  },

  // ── Îles obscures
  // Kalista — « J'ai vu au moins 3 alliés mourir. »
  "01SI030": {
    levelUpCardCode: "01SI030T2",
    check: (s, _u, seat) => s.players[seat].championCounters.alliesDied >= 3,
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

  if (events.length === 0) return state;
  return { ...state, players: newPlayers, log: [...state.log, ...events] };
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
