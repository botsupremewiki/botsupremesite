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

  // Phase 3.8e + 3.28 : essaie de jouer un sort avec une cible valide.
  // On itère sur toute la main et on tente le 1er sort dont l'effet est
  // applicable. Validation explicite par type d'effet pour éviter d'envoyer
  // au serveur une combinaison sort+cible qui retournera une erreur (ce qui
  // bloquerait le bot — le scheduleBotAct s'arrête sur ok:false).
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
      // Phase 3.35 : skip les sorts qui ne servent à rien dans l'état
      // courant (sinon mana gaspillée).
      if (
        effect.type === "damage-all-combatants" &&
        !state.attackInProgress
      ) {
        continue; // pas de combat → no-op
      }
      if (
        effect.type === "summon-tokens-if-ally-died" &&
        player.alliesDiedThisRound <= 0
      ) {
        continue; // condition non remplie
      }
      if (
        effect.type === "summon-tokens" &&
        player.bench.length >= 6
      ) {
        continue; // banc plein → no-op
      }
      if (effect.type === "draw-champion") {
        const hasChampInDeck = player.deck.some((c) => {
          const card = getCard(c.cardCode);
          return card?.supertype === "Champion";
        });
        if (!hasChampInDeck) continue;
      }
      if (effect.type === "buff-all-allies-round" && player.bench.length === 0) {
        continue; // pas d'unités → buff gaspillé
      }
      if (
        effect.type === "combo-buff-keyword-all-allies-round" &&
        player.bench.length === 0
      ) {
        continue;
      }
      if (
        effect.type === "grant-keyword-all-allies-round" &&
        player.bench.length === 0
      ) {
        continue;
      }
      if (
        effect.type === "stun-all-enemies-max-power" &&
        opponent.bench.every((u) => u.power > effect.maxPower)
      ) {
        continue; // aucun ennemi dans la fenêtre maxPower
      }
      targetUid = null;
    } else if (side === "ally") {
      if (effect.type === "buff-ally-permanent" && effect.requireWounded) {
        const wounded = player.bench.find((u) => u.damage > 0);
        if (!wounded) continue;
        targetUid = wounded.uid;
      } else if (
        effect.type === "buff-ally-permanent" &&
        effect.requireExactBenchSize !== undefined
      ) {
        if (player.bench.length !== effect.requireExactBenchSize) continue;
        targetUid = player.bench[0].uid;
      } else if (effect.type === "kill-ally-for-draw") {
        // Phase 3.27 : sacrifie l'allié le moins puissant. Saute si le banc
        // est vide ou ne contient qu'un champion (mauvais trade).
        if (player.bench.length === 0) continue;
        const sortedByPower = [...player.bench].sort((a, b) => a.power - b.power);
        targetUid = sortedByPower[0].uid;
      } else if (effect.type === "heal-ally-full") {
        // Phase 3.23 : Regain de courage. Cible l'allié le plus blessé,
        // skip si aucun allié n'est blessé (sort gaspillé).
        const wounded = player.bench
          .filter((u) => u.damage > 0)
          .sort((a, b) => b.damage - a.damage);
        if (wounded.length === 0) continue;
        targetUid = wounded[0].uid;
      } else if (effect.type === "drain-ally") {
        // Phase 3.24 : Absorbe-âme. Préfère un allié dont la mort serait
        // OK (low health restant) ou skip si banc vide / champion only.
        if (player.bench.length === 0) continue;
        const sacrificable = [...player.bench]
          .filter((u) => {
            const c = getCard(u.cardCode);
            return c?.supertype !== "Champion";
          })
          .sort((a, b) => a.power - b.power);
        if (sacrificable.length === 0) continue;
        targetUid = sacrificable[0].uid;
      } else if (effect.type === "summon-ally-copies") {
        // Phase 3.33 : clone un allié. Préfère cloner la plus grosse
        // menace alliée. Skip si banc vide ou banc plein (max 6).
        if (player.bench.length === 0) continue;
        if (player.bench.length >= 6) continue;
        const target = [...player.bench].sort(
          (a, b) => b.power + b.health - (a.power + a.health),
        )[0];
        targetUid = target.uid;
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
      } else if (effect.type === "silence-follower-target") {
        // Phase 3.20 : Purification. Skip Champions.
        const valid = opponent.bench.find((u) => {
          const c = getCard(u.cardCode);
          return c?.supertype !== "Champion";
        });
        if (!valid) continue;
        targetUid = valid.uid;
      } else if (opponent.bench.length > 0) {
        const target =
          opponent.bench.find((u) => !u.frozen) ?? opponent.bench[0];
        targetUid = target.uid;
      } else continue;
    } else {
      // any
      if (effect.type === "kill-target-any" && effect.maxPower !== undefined) {
        // Phase 3.16 : Abattage. Cherche enemy ≤ maxPower (préféré),
        // sinon ally ≤ maxPower (last resort), sinon skip.
        const enemyValid = opponent.bench
          .filter((u) => u.power <= (effect.maxPower ?? Infinity))
          .sort((a, b) => b.power - a.power);
        const allyValid = player.bench
          .filter((u) => u.power <= (effect.maxPower ?? Infinity))
          .sort((a, b) => a.power - b.power);
        if (enemyValid.length > 0) targetUid = enemyValid[0].uid;
        else if (allyValid.length > 0) targetUid = allyValid[0].uid;
        else continue;
      } else if (effect.type === "kill-target-any") {
        // Cible la plus grosse menace ennemie, sinon skip.
        if (opponent.bench.length === 0) continue;
        const target = [...opponent.bench].sort(
          (a, b) => b.power + b.health - (a.power + a.health),
        )[0];
        targetUid = target.uid;
      } else if (effect.type === "drain-target-any") {
        // Phase 3.24 : Poigne de l'immortel. Préfère ennemi (heal +
        // damage) sinon cible ally faible.
        if (opponent.bench.length > 0) {
          targetUid = opponent.bench[0].uid;
        } else if (player.bench.length > 0) {
          const sacrificable = [...player.bench].sort(
            (a, b) => a.power - b.power,
          );
          targetUid = sacrificable[0].uid;
        } else continue;
      } else if (effect.type === "deal-damage-anywhere-if-ally-died") {
        // Phase 3.34 : conditional damage. Skip si condition non remplie
        // (alliesDiedThisRound = 0) ou pas de cible.
        if (player.alliesDiedThisRound <= 0) continue;
        if (opponent.bench.length > 0) {
          targetUid = opponent.bench[0].uid;
        } else if (player.bench.length > 0) {
          targetUid = player.bench[0].uid;
        } else continue;
      } else {
        // deal-damage-anywhere, recall-any : préfère ennemi puis ally.
        const target = opponent.bench[0] ?? player.bench[0];
        if (!target) continue;
        targetUid = target.uid;
      }
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
