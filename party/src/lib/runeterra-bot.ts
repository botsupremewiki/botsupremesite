// Bot AI Runeterra — Phase 3.8e (amélioré : joue sorts + défense basique).
//
// Stratégie :
//  • Mulligan : garde toute la main (pas de tri intelligent)
//  • Round : développe le board d'abord (unité la moins chère), puis joue
//    un sort si une cible valide existe, puis attaque si jeton + unités
//    prêtes, sinon passe.
//  • Bloqueurs : assigne en mode greedy — préfère bloqueur qui survit
//    + tue ; sinon survit ; sinon chump block ; respecte Elusive/Fearsome.
//
// À améliorer en 3.8e.x : tri main par mana curve, valeur trade dans
// l'attaque, threat prioritization, jouer le jeton attaque au bon moment.

import {
  applyMulligan,
  assignBlockers,
  declareAttack,
  type EngineResult,
  getCard,
  hasKeyword,
  type InternalState,
  passPriority,
  playSpell,
  playUnit,
} from "./runeterra-engine";
import {
  getSpellTargetSide,
  RUNETERRA_SPELL_EFFECTS,
  type RuneterraBattleUnit,
} from "../../../shared/types";

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
    const attackerSeat = state.attackInProgress.attackerSeatIdx;
    const attackerBench = state.players[attackerSeat].bench;
    const defenderBench = state.players[seatIdx].bench;
    const blockers = chooseBlockers(
      state.attackInProgress.lanes,
      attackerBench,
      defenderBench,
    );
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

  // Phase 3.8e : essaie de jouer un sort avec une cible valide
  const opponent = state.players[otherSeat(seatIdx)];
  for (let i = 0; i < player.hand.length; i++) {
    const card = getCard(player.hand[i].cardCode);
    if (card?.type !== "Spell") continue;
    if (card.cost > player.mana + player.spellMana) continue;
    const effect = RUNETERRA_SPELL_EFFECTS[player.hand[i].cardCode];
    if (!effect) continue;
    const side = getSpellTargetSide(effect);
    let targetUid: string | null = null;

    if (side === "none") {
      targetUid = null;
    } else if (side === "ally") {
      if (effect.type === "buff-ally-permanent" && effect.requireWounded) {
        const wounded = player.bench.find((u) => u.damage > 0);
        if (!wounded) continue;
        targetUid = wounded.uid;
      } else if (player.bench.length > 0) {
        // Préfère un allié non-frozen pour ne pas gaspiller un buff
        const target = player.bench.find((u) => !u.frozen) ?? player.bench[0];
        targetUid = target.uid;
      } else continue;
    } else if (side === "enemy") {
      if (effect.type === "frostbite-enemy" && effect.maxHealth !== undefined) {
        const max = effect.maxHealth;
        const valid = opponent.bench.find(
          (u) => u.health - u.damage <= max && !u.frozen,
        );
        if (!valid) continue;
        targetUid = valid.uid;
      } else if (opponent.bench.length > 0) {
        const target =
          opponent.bench.find((u) => !u.frozen) ?? opponent.bench[0];
        targetUid = target.uid;
      } else continue;
    } else {
      // any
      const target =
        player.bench[0] ?? opponent.bench[0];
      if (!target) continue;
      targetUid = target.uid;
    }
    return playSpell(state, seatIdx, i, targetUid);
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

function otherSeat(seat: 0 | 1): 0 | 1 {
  return (1 - seat) as 0 | 1;
}

/** Bloqueurs greedy : pour chaque lane, choisit le meilleur bloqueur
 *  disponible (kill+survive > survive seul > chump > pas de bloqueur).
 *  Respecte Elusive (besoin Elusive ou Sharpsight) et Fearsome (power ≥ 3).
 */
function chooseBlockers(
  lanes: { attackerUid: string; blockerUid: string | null }[],
  attackerBench: RuneterraBattleUnit[],
  defenderBench: RuneterraBattleUnit[],
): (string | null)[] {
  const used = new Set<string>();
  return lanes.map((lane) => {
    const attacker = attackerBench.find((u) => u.uid === lane.attackerUid);
    if (!attacker || attacker.power <= 0) return null;
    const candidates = defenderBench.filter((b) => {
      if (used.has(b.uid)) return false;
      if (b.power <= 0 && b.health - b.damage <= 0) return false;
      if (
        hasKeyword(attacker, "Elusive") &&
        !hasKeyword(b, "Elusive") &&
        !hasKeyword(b, "Sharpsight")
      )
        return false;
      if (hasKeyword(attacker, "Fearsome") && b.power < 3) return false;
      return true;
    });
    if (candidates.length === 0) return null;

    // Best : kill + survive
    const aHealth = attacker.health - attacker.damage;
    const goodTrade = candidates.find((b) => {
      const bHealth = b.health - b.damage;
      return bHealth > attacker.power && b.power >= aHealth;
    });
    if (goodTrade) {
      used.add(goodTrade.uid);
      return goodTrade.uid;
    }
    // Survive only
    const survives = candidates.find(
      (b) => b.health - b.damage > attacker.power,
    );
    if (survives) {
      used.add(survives.uid);
      return survives.uid;
    }
    // Chump block si attaque significative (>= 3 dégâts au nexus)
    if (attacker.power >= 3) {
      const cheap = candidates[0];
      used.add(cheap.uid);
      return cheap.uid;
    }
    return null;
  });
}
