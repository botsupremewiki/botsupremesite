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
  RuneterraBattleUnit,
  RuneterraCardData,
} from "../../../shared/types";
import { RUNETERRA_BATTLE_CONFIG } from "../../../shared/types";
import { RUNETERRA_BASE_SET_BY_CODE } from "../../../shared/tcg-runeterra-base";

/** Une carte de deck encapsulée (uid unique pour l'instance, cardCode pour
 *  remonter aux données riches via le set). */
export type DeckCard = {
  uid: string;
  cardCode: string;
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
  };
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
  // Reset playedThisRound (les unités déjà sur le banc peuvent maintenant attaquer).
  const newBench = player.bench.map((u) => ({ ...u, playedThisRound: false }));
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
  const updatedPlayers: [InternalPlayer, InternalPlayer] = [
    bankSpellMana(state.players[0]),
    bankSpellMana(state.players[1]),
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

/** Joue un sort depuis la main.
 *   • Vérifie phase=round, c'est ton tour, hand index valide, carte est Spell
 *   • Vérifie mana + spellMana >= cost (mana utilisée d'abord, puis spellMana)
 *   • Déduit le coût, retire de la main
 *   • Reset consecutivePasses, switch priorité à l'adversaire
 *
 *  NOTE Phase 3.2 : pas de spell stack ni de résolution d'effets. Le sort
 *  est juste retiré de la main + mana déduite. La résolution effective des
 *  effets viendra en Phase 3.4 avec les keywords.
 */
export function playSpell(
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
        `${player.username} lance ${card.name} (coût ${card.cost}).`,
      ],
    },
  };
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
