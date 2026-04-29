// Bot AI Runeterra — Phase 3.8a (naïve mais fonctionnelle).
//
// Stratégie minimale pour fournir un adversaire de test :
//  • Mulligan : garde toute la main (pas de tri intelligent)
//  • Round : joue l'unité la moins chère qui rentre dans la mana
//  • Si pas d'unité jouable et a le jeton + unités prêtes : déclare l'attaque
//    avec tous les attaquants éligibles
//  • Sinon : passe la priorité
//  • Bloqueurs : laisse tout passer au nexus (pas de défense)
//
// À améliorer en 3.8b+ : tri intelligent, jouer des sorts, bloqueurs
// défensifs, sortir le jeton au bon moment, etc.

import {
  applyMulligan,
  assignBlockers,
  declareAttack,
  type EngineResult,
  getCard,
  type InternalState,
  passPriority,
  playUnit,
} from "./runeterra-engine";

/** Calcule la prochaine action du bot. Retourne null si le bot n'a rien
 *  à faire (ce n'est pas son tour, ou il a déjà mulligané, ou la partie
 *  est terminée). */
export function botAct(
  state: InternalState,
  seatIdx: 0 | 1,
): EngineResult | null {
  // Mulligan auto : garde toute la main
  if (state.phase === "mulligan") {
    if (!state.players[seatIdx].hasMulliganed) {
      return { ok: true, state: applyMulligan(state, seatIdx, []) };
    }
    return null;
  }
  if (state.phase !== "round") return null;

  // Bot doit assigner des bloqueurs si l'humain l'attaque
  if (
    state.attackInProgress &&
    state.attackInProgress.attackerSeatIdx !== seatIdx &&
    state.activeSeatIdx === seatIdx
  ) {
    // Naïf : laisse tout passer au nexus (pas de défense)
    const blockers = state.attackInProgress.lanes.map(() => null);
    return assignBlockers(state, seatIdx, blockers);
  }

  // Pas la priorité du bot
  if (state.activeSeatIdx !== seatIdx) return null;

  const player = state.players[seatIdx];

  // Joue l'unité la moins chère qui rentre dans la mana
  const playableUnits: { handIndex: number; cost: number }[] = [];
  for (let i = 0; i < player.hand.length; i++) {
    const card = getCard(player.hand[i].cardCode);
    if (
      card?.type === "Unit" &&
      card.cost <= player.mana &&
      player.bench.length < 6
    ) {
      playableUnits.push({ handIndex: i, cost: card.cost });
    }
  }
  if (playableUnits.length > 0) {
    playableUnits.sort((a, b) => a.cost - b.cost);
    return playUnit(state, seatIdx, playableUnits[0].handIndex);
  }

  // Attaque si jeton + unités prêtes
  const readyUnits = player.bench.filter(
    (u) => !u.playedThisRound && u.power > 0,
  );
  if (player.attackToken && readyUnits.length > 0) {
    return declareAttack(
      state,
      seatIdx,
      readyUnits.map((u) => u.uid),
    );
  }

  return passPriority(state, seatIdx);
}
