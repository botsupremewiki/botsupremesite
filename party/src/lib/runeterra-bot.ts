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
    // Phase 3.40 : 2e cible pour sorts multi-target.
    let targetUid2: string | null = null;

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
        player.alliesDiedThisRound < (effect.minDeaths ?? 1)
      ) {
        continue; // condition non remplie (défaut 1, 01SI027 = 3)
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
      if (
        effect.type === "kill-power-zero-and-frostbite-all-enemies" &&
        opponent.bench.length === 0
      ) {
        continue; // pas d'ennemi à toucher
      }
      if (
        effect.type === "revive-random-dead-ally-this-round" &&
        (player.deadAlliesThisRound.length === 0 || player.bench.length >= 6)
      ) {
        continue; // rien à ranimer ou banc plein
      }
      if (
        effect.type === "grant-ephemeral-all-followers-in-combat" &&
        !state.attackInProgress
      ) {
        continue; // pas de combat → no-op
      }
      if (
        effect.type === "summon-tokens-and-buff-subtype-allies" &&
        player.bench.length >= 6
      ) {
        continue; // banc plein, sort gaspillé
      }
      if (effect.type === "kill-all-units-with-max-power-if-ally-min-power") {
        const hasMinAlly = player.bench.some(
          (u) => u.power >= effect.minAllyPower,
        );
        if (!hasMinAlly) continue;
        // Skip si aucune unité touchée (gaspillage de mana).
        const wouldKill =
          player.bench.filter((u) => u.power <= effect.maxPower).length +
          opponent.bench.filter((u) => u.power <= effect.maxPower).length;
        if (wouldKill === 0) continue;
      }
      // Phase 3.55 : sorts auto-discard. Skip si pas de carte à discarder.
      if (
        effect.type === "auto-discard-and-draw-up-to-n" &&
        player.hand.length === 0
      ) {
        continue; // rien à discard
      }
      if (effect.type === "buff-all-allies-permanent" && player.bench.length === 0) {
        continue; // pas d'allié à buff
      }
      // Phase 3.54 : sorts hand-buff. Skip si aucune carte cible en main.
      if (effect.type === "buff-allies-in-hand-permanent") {
        const hasUnitInHand = player.hand.some((c) => {
          const cd = getCard(c.cardCode);
          return cd?.type === "Unit";
        });
        if (!hasUnitInHand) continue;
      }
      if (effect.type === "reduce-cost-allies-in-hand") {
        if (player.hand.length === 0) continue;
      }
      if (effect.type === "grant-keyword-ally-in-hand-and-draw") {
        // Toujours utile (au moins le draw, même sans Unit en main).
      }
      if (
        effect.type === "summon-random-adept-from-region-cost" &&
        player.bench.length >= 6
      ) {
        continue; // banc plein
      }
      if (effect.type === "summon-token-if-unique-cards-played-min") {
        if (player.bench.length >= 6) continue;
        if (player.uniqueCardCodesPlayedThisGame.length < effect.minUnique) {
          continue;
        }
      }
      if (effect.type === "summon-token-or-add-to-deck-if-no-subtype-ally") {
        // Toujours utile (au moins ajout au deck), mais skip si on a
        // déjà un allié subtype + banc plein (ne summon pas).
        const hasSubtype = player.bench.some((u) => {
          const c = getCard(u.cardCode);
          return c?.subtypes?.includes(effect.subtype);
        });
        if (hasSubtype && player.bench.length >= 6) continue;
      }
      if (effect.type === "buff-allies-of-subtype-everywhere") {
        const hasAnySubtype = [
          ...player.bench,
          ...player.hand,
          ...player.deck,
        ].some((c) => {
          const cd = getCard(c.cardCode);
          return cd?.subtypes?.includes(effect.subtype);
        });
        if (!hasAnySubtype) continue;
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
      } else if (effect.type === "damage-ally-create-copy-in-hand-if-survives") {
        // Phase 3.56 : Sang pour sang. Pick adepte allié qui survit aux
        // dmg (pour bénéficier de la copie en main). Skip si aucun.
        const survivable = player.bench
          .filter((u) => {
            const c = getCard(u.cardCode);
            return c?.supertype !== "Champion";
          })
          .filter((u) => u.health - u.damage > effect.damage)
          .sort((a, b) => b.power + b.health - (a.power + a.health));
        if (survivable.length === 0) continue;
        targetUid = survivable[0].uid;
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
      } else if (effect.type === "heal-ally-and-draw") {
        // Phase 3.42 : Rituel du renouveau. Préfère le plus blessé,
        // sinon n'importe quel allié (le draw 1 reste utile).
        if (player.bench.length === 0) continue;
        const wounded = [...player.bench]
          .filter((u) => u.damage > 0)
          .sort((a, b) => b.damage - a.damage);
        const target = wounded[0] ?? player.bench[0];
        targetUid = target.uid;
      } else if (effect.type === "ally-strikes-all-enemies-in-combat") {
        // Phase 3.48 : Jugement. Skip si pas d'attaque + pas d'allié au
        // combat. Choisit l'allié au combat avec le plus de power.
        if (!state.attackInProgress) continue;
        const combatants = new Set<string>();
        for (const lane of state.attackInProgress.lanes) {
          combatants.add(lane.attackerUid);
          if (lane.blockerUid) combatants.add(lane.blockerUid);
        }
        const eligibleAllies = player.bench.filter(
          (u) => combatants.has(u.uid) && u.power > 0,
        );
        if (eligibleAllies.length === 0) continue;
        const enemiesInCombat = opponent.bench.filter((u) =>
          combatants.has(u.uid),
        );
        if (enemiesInCombat.length === 0) continue;
        // Pick allié dont la power tue le plus d'ennemis tout en survivant.
        const sorted = [...eligibleAllies].sort((a, b) => {
          const aSurvives =
            a.health - a.damage >
            enemiesInCombat.reduce((s, e) => s + e.power, 0);
          const bSurvives =
            b.health - b.damage >
            enemiesInCombat.reduce((s, e) => s + e.power, 0);
          if (aSurvives !== bSurvives) return aSurvives ? -1 : 1;
          return b.power - a.power;
        });
        targetUid = sorted[0].uid;
      } else if (effect.type === "recall-ally-and-summon-token") {
        // Phase 3.45 : Inversion spectrale. Recall l'allié le moins
        // intéressant (tap, faible) et summon Ombre vivante. Skip si
        // banc vide.
        if (player.bench.length === 0) continue;
        const target = [...player.bench].sort(
          (a, b) => a.power + a.health - (b.power + b.health),
        )[0];
        targetUid = target.uid;
      } else if (
        effect.type === "buff-2-allies-permanent" ||
        effect.type === "buff-2-allies-round" ||
        effect.type === "grant-keyword-2-allies-round"
      ) {
        // Phase 3.40 + 3.53 : 2 alliés distincts. Skip si <2 alliés.
        // Préfère les 2 plus gros (boost plus impactant).
        if (player.bench.length < 2) continue;
        const sorted = [...player.bench].sort(
          (a, b) => b.power + b.health - (a.power + a.health),
        );
        targetUid = sorted[0].uid;
        targetUid2 = sorted[1].uid;
      } else if (effect.type === "damage-ally-buff-other-ally-round") {
        // Phase 3.40 : Transfusion. Sacrifie l'allié le moins puissant
        // (ou un non-Champion à faible PV) puis buff le plus gros.
        if (player.bench.length < 2) continue;
        const nonChamps = player.bench.filter((u) => {
          const c = getCard(u.cardCode);
          return c?.supertype !== "Champion";
        });
        // Cible 1 (damage) : le plus faible non-Champion qui survit aux dmg.
        const target1 = nonChamps
          .filter((u) => u.health - u.damage > effect.damage)
          .sort((a, b) => a.power - b.power)[0];
        if (!target1) continue;
        // Cible 2 (buff) : le plus gros allié distinct de target1.
        const target2 = [...player.bench]
          .filter((u) => u.uid !== target1.uid)
          .sort((a, b) => b.power + b.health - (a.power + a.health))[0];
        if (!target2) continue;
        targetUid = target1.uid;
        targetUid2 = target2.uid;
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
      } else if (effect.type === "frostbite-2-enemies") {
        // Phase 3.40 : Vents mordants. 2 ennemis distincts non gelés.
        // Préfère les plus gros (impact maximal).
        const valid = opponent.bench
          .filter((u) => !u.frozen)
          .sort((a, b) => b.power - a.power);
        if (valid.length < 2) continue;
        targetUid = valid[0].uid;
        targetUid2 = valid[1].uid;
      } else if (effect.type === "stun-enemy-buff-all-allies-round") {
        // Phase 3.42 : Manœuvre décisive. Stun la plus grosse menace,
        // skip si pas d'allié à buff (ou ennemi à stun).
        if (opponent.bench.length === 0) continue;
        if (player.bench.length === 0) continue;
        const target = [...opponent.bench]
          .filter((u) => !u.stunned)
          .sort((a, b) => b.power - a.power)[0];
        if (!target) continue;
        targetUid = target.uid;
      } else if (effect.type === "stun-attacker-enemy") {
        // Phase 3.52 : Tempête d'acier. Skip si pas de combat ou pas
        // d'attaquant ennemi.
        if (!state.attackInProgress) continue;
        const enemyAttackers = state.attackInProgress.lanes
          .map((l) => l.attackerUid)
          .filter((uid) =>
            opponent.bench.some((u) => u.uid === uid && !u.stunned),
          );
        if (enemyAttackers.length === 0) continue;
        // Stun le plus gros attaquant.
        const target = opponent.bench
          .filter((u) => enemyAttackers.includes(u.uid))
          .sort((a, b) => b.power - a.power)[0];
        targetUid = target.uid;
      } else if (effect.type === "damage-or-frostbite-by-power-zero") {
        // Phase 3.45 : Acier glacial. Préfère un ennemi power=0 (kill),
        // sinon une grosse menace à freeze.
        const killable = opponent.bench
          .filter((u) => u.power === 0)
          .sort((a, b) => b.health + b.power - (a.health + a.power))[0];
        if (killable) {
          targetUid = killable.uid;
        } else {
          const fallback = [...opponent.bench]
            .filter((u) => !u.frozen)
            .sort((a, b) => b.power - a.power)[0];
          if (!fallback) continue;
          targetUid = fallback.uid;
        }
      } else if (effect.type === "damage-enemy-and-rally") {
        // Phase 3.44 : Shunpo. Préfère un ennemi tuable par dmg, sinon
        // la plus grosse menace pour réduire son power. Skip si banc
        // ennemi vide. Toujours utile (rally même si pas de kill).
        if (opponent.bench.length === 0) continue;
        const dmg = effect.amount;
        const killable = opponent.bench
          .filter((u) => u.health - u.damage <= dmg)
          .sort((a, b) => b.power + b.health - (a.power + a.health))[0];
        const fallback = [...opponent.bench].sort(
          (a, b) => b.power - a.power,
        )[0];
        targetUid = (killable ?? fallback).uid;
      } else if (opponent.bench.length > 0) {
        const target =
          opponent.bench.find((u) => !u.frozen) ?? opponent.bench[0];
        targetUid = target.uid;
      } else continue;
    } else if (side === "any") {
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
      } else if (effect.type === "kill-wounded-target-and-create-spell-in-hand") {
        // Phase 3.56 : Guillotine. Pick une unité ennemie blessée si
        // possible, sinon allié blessé sacrifiable, sinon skip.
        const woundedEnemy = [...opponent.bench]
          .filter((u) => u.damage > 0)
          .sort((a, b) => b.power + b.health - (a.power + a.health))[0];
        const woundedAlly = [...player.bench]
          .filter((u) => u.damage > 0)
          .filter((u) => {
            const c = getCard(u.cardCode);
            return c?.supertype !== "Champion";
          })
          .sort((a, b) => a.power + a.health - (b.power + b.health))[0];
        if (woundedEnemy) targetUid = woundedEnemy.uid;
        else if (woundedAlly) targetUid = woundedAlly.uid;
        else continue;
      } else if (effect.type === "create-ephemeral-copy-of-target-in-hand") {
        // Phase 3.56 : Vagues souvenirs. Préfère un adepte ennemi gros
        // (qu'on copie pour notre side), fallback ally adept gros.
        const enemyAdept = opponent.bench
          .filter((u) => {
            const c = getCard(u.cardCode);
            return c?.supertype !== "Champion";
          })
          .sort((a, b) => b.power + b.health - (a.power + a.health))[0];
        const allyAdept = player.bench
          .filter((u) => {
            const c = getCard(u.cardCode);
            return c?.supertype !== "Champion";
          })
          .sort((a, b) => b.power + b.health - (a.power + a.health))[0];
        if (enemyAdept) targetUid = enemyAdept.uid;
        else if (allyAdept) targetUid = allyAdept.uid;
        else continue;
      } else if (effect.type === "drain-target-summon-token") {
        // Phase 3.42 : Vil festin. Préfère un ennemi (heal nexus + summon)
        // sinon un allié faible. Skip si banc plein (token gaspillé).
        if (player.bench.length >= 6) continue;
        if (opponent.bench.length > 0) {
          targetUid = opponent.bench[0].uid;
        } else if (player.bench.length > 0) {
          const sacrificable = [...player.bench].sort(
            (a, b) => a.power - b.power,
          );
          targetUid = sacrificable[0].uid;
        } else continue;
      } else {
        // deal-damage-anywhere, recall-any : préfère ennemi puis ally.
        const target = opponent.bench[0] ?? player.bench[0];
        if (!target) continue;
        targetUid = target.uid;
      }
    } else if (side === "ally-and-enemy") {
      // Phase 3.46-3.47 : Combat singulier (unit-strike-unit) ou Volée
      // mortelle (unit-strike-unit-in-combat, combat-only).
      // Phase 3.49 : Marque de la mort (swap-ephemeral) — exige ally
      // avec Ephemeral. Choisit le plus fort ennemi à infliger.
      if (effect.type === "swap-ephemeral") {
        const ephemeralAlly = player.bench.find((u) =>
          u.keywords.includes("Ephemeral"),
        );
        if (!ephemeralAlly) continue;
        // Préfère le plus gros ennemi non-Ephemeral.
        const target = [...opponent.bench]
          .filter((u) => !u.keywords.includes("Ephemeral"))
          .sort((a, b) => b.power + b.health - (a.power + a.health))[0];
        if (!target) continue;
        targetUid = ephemeralAlly.uid;
        targetUid2 = target.uid;
        return playSpell(state, seatIdx, i, targetUid, targetUid2);
      }
      if (
        effect.type === "unit-strike-unit-in-combat" &&
        !state.attackInProgress
      ) {
        continue; // pas de combat, sort inutilisable
      }
      // Liste de candidats valides : tous les benchs si combat singulier,
      // sinon uniquement ceux au combat.
      let allyCandidates = player.bench;
      let enemyCandidates = opponent.bench;
      if (
        effect.type === "unit-strike-unit-in-combat" &&
        state.attackInProgress
      ) {
        const combatants = new Set<string>();
        for (const lane of state.attackInProgress.lanes) {
          combatants.add(lane.attackerUid);
          if (lane.blockerUid) combatants.add(lane.blockerUid);
        }
        allyCandidates = allyCandidates.filter((u) => combatants.has(u.uid));
        enemyCandidates = enemyCandidates.filter((u) => combatants.has(u.uid));
      }
      if (allyCandidates.length === 0 || enemyCandidates.length === 0) continue;
      // Cherche la meilleure paire (kill+survive > kill > survive > nothing).
      let bestPair: { allyUid: string; enemyUid: string } | null = null;
      let bestScore = -Infinity;
      for (const ally of allyCandidates) {
        if (ally.power <= 0) continue;
        for (const enemy of enemyCandidates) {
          if (enemy.power <= 0) continue;
          const allyHp = ally.health - ally.damage;
          const enemyHp = enemy.health - enemy.damage;
          const allySurvives = enemy.power < allyHp;
          const enemyDies = ally.power >= enemyHp;
          let score = 0;
          if (allySurvives && enemyDies) score = 100 + enemy.power;
          else if (enemyDies) score = 50 + enemy.power;
          else if (allySurvives) score = 10 + enemy.power;
          else score = -Math.abs(ally.power - enemy.power);
          if (score > bestScore) {
            bestScore = score;
            bestPair = { allyUid: ally.uid, enemyUid: enemy.uid };
          }
        }
      }
      if (!bestPair || bestScore < 0) continue;
      targetUid = bestPair.allyUid;
      targetUid2 = bestPair.enemyUid;
    } else if (side === "any-or-nexus") {
      // Phase 3.41 : Tir mystique. Préfère :
      // 1. Lethal au nexus ennemi si effect.amount >= nexusHealth
      // 2. Tuer un ennemi (dmg >= health restant)
      // 3. Toujours infliger au nexus ennemi (face damage)
      if (effect.type === "deal-damage-target-any-or-nexus") {
        const dmg = effect.amount;
        if (dmg >= opponent.nexusHealth) {
          targetUid = "nexus-enemy"; // lethal
        } else {
          const killable = opponent.bench
            .filter((u) => u.health - u.damage <= dmg)
            .sort((a, b) => b.power + b.health - (a.power + a.health))[0];
          if (killable) {
            targetUid = killable.uid;
          } else {
            // Default : face damage à l'ennemi.
            targetUid = "nexus-enemy";
          }
        }
      } else {
        targetUid = "nexus-enemy";
      }
    }
    return playSpell(state, seatIdx, i, targetUid, targetUid2);
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
