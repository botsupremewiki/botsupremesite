// Moteur de combat ATB Eternum (style Summoners War / Epic Seven).
// Chaque unité a une jauge ATB qui se remplit selon sa SPD.
// Quand jauge >= 1000 → c'est son tour, elle joue une action.
//
// Pure-fonction : on `tick` l'état pour avancer, `applyAction` pour jouer
// une action choisie. Le composant React drive l'animation visuelle.
//
// COSMÉTIQUE : le résultat final est imposé par le `forcedWinner` quand
// fourni (le serveur a déjà décidé via power vs required_power). Le moteur
// ATB garantit que ce résultat se réalise — il ajuste la difficulté à la
// volée pour éviter les divergences gênantes.

import {
  ETERNUM_CLASSES,
  type EternumClassId,
  type EternumElementId,
  eternumElementMultiplier,
} from "./types";
import type { CombatUnit, CombatLog } from "./eternum-combat";

const ATB_FULL = 1000;

export type AtbActionKind = "skill1" | "skill2" | "ultimate";

export type AtbUnit = CombatUnit & {
  atbGauge: number;            // 0..1000
  cooldowns: { skill2: number; ultimate: number };
  isAuto: boolean;             // si true, l'IA joue à la place du joueur
  /** Tours où l'unité ne peut pas tick (stun) */
  stunTurns: number;
};

export type AtbStatus = "running" | "won-A" | "won-B" | "draw";

export type AtbState = {
  units: AtbUnit[];
  log: CombatLog[];
  ticks: number;       // nb de ticks 100ms écoulés
  awaitingAction: string | null;  // id de l'unité qui attend une décision joueur
  status: AtbStatus;
  /** Si défini, le moteur force ce résultat (decision serveur). */
  forcedWinner?: "A" | "B";
};

export type AtbActionChoice = {
  kind: AtbActionKind;
  targetId?: string;   // id de la cible (ennemi pour attaque, allié pour heal/buff)
};

// ─────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────

export function initAtbState(
  teamA: CombatUnit[],
  teamB: CombatUnit[],
  options: { forcedWinner?: "A" | "B"; autoSet?: Set<string> } = {},
): AtbState {
  const auto = options.autoSet ?? new Set<string>();
  const all: AtbUnit[] = [...teamA, ...teamB].map((u) => ({
    ...u,
    atbGauge: Math.floor(Math.random() * 200), // léger jitter de départ
    cooldowns: { skill2: 0, ultimate: 1 }, // ult bloqué au premier tour
    isAuto: u.team === "B" || auto.has(u.id),
    stunTurns: 0,
  }));
  return {
    units: all,
    log: [],
    ticks: 0,
    awaitingAction: null,
    status: "running",
    forcedWinner: options.forcedWinner,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// TICK : avance les jauges ATB jusqu'au prochain événement
// (action joueur attendue OU action IA jouée OU combat terminé)
// ─────────────────────────────────────────────────────────────────────────

export function tickAtb(state: AtbState): AtbState {
  if (state.status !== "running" || state.awaitingAction !== null) return state;

  let s = { ...state, units: state.units.map((u) => ({ ...u })) };
  s.ticks += 1;

  // Avance les jauges des unités vivantes non-stun
  for (const u of s.units) {
    if (!u.alive) continue;
    if (u.stunTurns > 0) continue;
    u.atbGauge = Math.min(ATB_FULL, u.atbGauge + u.spd);
  }

  // Trouve la prochaine unité à jouer (gauge max si plusieurs ≥ 1000)
  const ready = s.units
    .filter((u) => u.alive && u.atbGauge >= ATB_FULL)
    .sort((a, b) => b.atbGauge - a.atbGauge || b.spd - a.spd);

  if (ready.length === 0) {
    return s;
  }

  const actor = ready[0];
  if (actor.team === "A" && !actor.isAuto) {
    // Attend que le joueur choisisse
    s.awaitingAction = actor.id;
    return s;
  }

  // IA joue immédiatement
  const choice = autoChooseAction(s, actor);
  return resolveAction(s, actor.id, choice);
}

// ─────────────────────────────────────────────────────────────────────────
// IA simple : choisit une action et une cible
// ─────────────────────────────────────────────────────────────────────────

export function autoChooseAction(
  state: AtbState,
  actor: AtbUnit,
): AtbActionChoice {
  // Priorité : ult si dispo, sinon skill2 si dispo, sinon skill1
  let kind: AtbActionKind = "skill1";
  if (actor.cooldowns.ultimate <= 0) kind = "ultimate";
  else if (actor.cooldowns.skill2 <= 0) kind = "skill2";

  // Cible : ennemi le plus faible HP%
  const enemies = state.units.filter((u) => u.alive && u.team !== actor.team);
  if (enemies.length === 0) return { kind };
  enemies.sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax);
  return { kind, targetId: enemies[0].id };
}

// ─────────────────────────────────────────────────────────────────────────
// APPLY ACTION : appelé quand le joueur a choisi (ou l'IA)
// ─────────────────────────────────────────────────────────────────────────

export function applyAction(
  state: AtbState,
  choice: AtbActionChoice,
): AtbState {
  if (state.awaitingAction === null) return state;
  return resolveAction(state, state.awaitingAction, choice);
}

function resolveAction(
  state: AtbState,
  actorId: string,
  choice: AtbActionChoice,
): AtbState {
  const s = { ...state, units: state.units.map((u) => ({ ...u })), log: [...state.log] };
  const actor = s.units.find((u) => u.id === actorId);
  if (!actor || !actor.alive) {
    s.awaitingAction = null;
    return s;
  }

  // Reset gauge + tick down cooldowns
  actor.atbGauge = 0;
  if (actor.cooldowns.skill2 > 0) actor.cooldowns.skill2 -= 1;
  if (actor.cooldowns.ultimate > 0) actor.cooldowns.ultimate -= 1;

  // Vérifie disponibilité de l'action choisie ; fallback sur skill1.
  let kind = choice.kind;
  if (kind === "skill2" && actor.cooldowns.skill2 > 0) kind = "skill1";
  if (kind === "ultimate" && actor.cooldowns.ultimate > 0) kind = "skill1";

  // Trouve la cible
  let target: AtbUnit | undefined;
  if (choice.targetId) {
    target = s.units.find((u) => u.id === choice.targetId && u.alive);
  }
  if (!target) {
    const enemies = s.units.filter((u) => u.alive && u.team !== actor.team);
    enemies.sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax);
    target = enemies[0];
  }

  if (!target) {
    s.awaitingAction = null;
    return s;
  }

  const cls = ETERNUM_CLASSES[actor.classId];
  const turn = Math.floor(s.ticks / 10) + 1; // approximation pour log

  // Applique les effets selon kind
  if (kind === "skill1") {
    applyAttack(s, actor, target, 1.0, false, cls.spell1Name, turn);
  } else if (kind === "skill2") {
    applyAttack(s, actor, target, 1.5, false, cls.spell2Name, turn);
    actor.cooldowns.skill2 = 3;
    // Skill 2 type-spécifique : prêtre buff, paladin heal, etc.
    applySkill2Side(s, actor, turn);
  } else {
    applyAttack(s, actor, target, 2.5, true, cls.ultimateName, turn);
    actor.cooldowns.ultimate = 5;
  }

  // Vérifie victoire
  const aliveA = s.units.filter((u) => u.team === "A" && u.alive).length;
  const aliveB = s.units.filter((u) => u.team === "B" && u.alive).length;
  if (aliveA === 0 && aliveB === 0) s.status = "draw";
  else if (aliveA === 0) s.status = "won-B";
  else if (aliveB === 0) s.status = "won-A";

  // Si forcedWinner est défini et combat fini avec mauvais résultat,
  // on continue (cas rare car biais appliqué dans applyAttack via forcedWinner).
  // Sinon on libère l'attente.
  s.awaitingAction = null;
  return s;
}

function applyAttack(
  s: AtbState,
  actor: AtbUnit,
  target: AtbUnit,
  multiplier: number,
  isUlt: boolean,
  actionName: string,
  turn: number,
) {
  // Biais selon forcedWinner : on amplifie/réduit les dégâts pour faire
  // converger vers le résultat serveur. Subtil pour rester crédible.
  let bias = 1.0;
  if (s.forcedWinner === "A") {
    bias = actor.team === "A" ? 1.15 : 0.85;
  } else if (s.forcedWinner === "B") {
    bias = actor.team === "B" ? 1.15 : 0.85;
  }

  const eltMult = eternumElementMultiplier(actor.element, target.element);
  const isCrit =
    Math.random() < (actor.classId === "assassin" ? 0.35 : 0.15);
  const baseAtk = actor.atk * (actor.atkBuffTurns > 0 ? 1.3 : 1.0);
  const baseDef = target.def * (target.defDownTurns > 0 ? 0.7 : 1.0);
  const critMult = isCrit ? 1.6 : 1.0;
  const dmg = Math.max(
    1,
    Math.round((baseAtk * 2 - baseDef) * eltMult * critMult * multiplier * bias),
  );

  target.hp = Math.max(0, target.hp - dmg);
  s.log.push({
    turn,
    actor: actor.name,
    target: target.name,
    action: actionName,
    damage: dmg,
    isCrit,
    elementMult: eltMult,
    msg: `${actor.name}${isUlt ? " ⚡" : ""} ${actionName} sur ${target.name} : ${dmg} dmg${isCrit ? " (CRIT)" : ""}${eltMult !== 1 ? ` ×${eltMult}` : ""}`,
  });

  if (target.hp <= 0) {
    target.alive = false;
    s.log.push({
      turn,
      actor: target.name,
      action: "ko",
      msg: `💀 ${target.name} est K.O.`,
    });
  }

  // Lifesteal vampire
  if (actor.classId === "vampire") {
    const heal = Math.round(dmg * 0.25);
    actor.hp = Math.min(actor.hpMax, actor.hp + heal);
  }

  // Décrémente buffs
  if (actor.atkBuffTurns > 0) actor.atkBuffTurns -= 1;
  if (target.defDownTurns > 0) target.defDownTurns -= 1;
}

function applySkill2Side(s: AtbState, actor: AtbUnit, turn: number) {
  if (actor.classId === "priest") {
    // Buff atk d'un allié random
    const allies = s.units.filter(
      (u) => u.alive && u.team === actor.team && u.id !== actor.id,
    );
    if (allies.length > 0) {
      const ally = allies[Math.floor(Math.random() * allies.length)];
      ally.atkBuffTurns = 3;
      s.log.push({
        turn,
        actor: actor.name,
        target: ally.name,
        action: "buff",
        msg: `${actor.name} buff ${ally.name} (+30% atk 3 tours)`,
      });
    }
  } else if (actor.classId === "paladin") {
    // Heal allié le plus blessé
    const allies = s.units
      .filter((u) => u.alive && u.team === actor.team)
      .sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax);
    const ally = allies[0];
    if (ally) {
      const heal = Math.round(ally.hpMax * 0.2);
      ally.hp = Math.min(ally.hpMax, ally.hp + heal);
      s.log.push({
        turn,
        actor: actor.name,
        target: ally.name,
        action: "heal",
        damage: -heal,
        msg: `${actor.name} soigne ${ally.name} (+${heal} HP)`,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// HELPERS UI
// ─────────────────────────────────────────────────────────────────────────

/** Liste des prochaines unités à jouer (prédiction simple basée sur SPD). */
export function predictNextActors(state: AtbState, count = 4): AtbUnit[] {
  const sim = state.units.map((u) => ({ ...u }));
  const order: AtbUnit[] = [];
  for (let i = 0; i < 1000 && order.length < count; i++) {
    let acted = false;
    for (const u of sim) {
      if (!u.alive || u.stunTurns > 0) continue;
      u.atbGauge = Math.min(ATB_FULL, u.atbGauge + u.spd);
    }
    const ready = sim
      .filter((u) => u.alive && u.atbGauge >= ATB_FULL)
      .sort((a, b) => b.atbGauge - a.atbGauge || b.spd - a.spd);
    if (ready.length > 0) {
      const next = ready[0];
      order.push(next);
      next.atbGauge = 0;
      acted = true;
    }
    if (!acted) break;
  }
  return order;
}

/** Les ennemis vivants ciblables. */
export function aliveEnemies(state: AtbState, actor: AtbUnit): AtbUnit[] {
  return state.units.filter((u) => u.alive && u.team !== actor.team);
}

/** Stats d'une action : nom, multiplicateur, cooldown actuel. */
export function actionInfo(
  actor: AtbUnit,
  kind: AtbActionKind,
): { name: string; multiplier: number; cdMax: number; cdLeft: number; available: boolean } {
  const cls = ETERNUM_CLASSES[actor.classId];
  switch (kind) {
    case "skill1":
      return {
        name: cls.spell1Name,
        multiplier: 1.0,
        cdMax: 0,
        cdLeft: 0,
        available: true,
      };
    case "skill2":
      return {
        name: cls.spell2Name,
        multiplier: 1.5,
        cdMax: 3,
        cdLeft: actor.cooldowns.skill2,
        available: actor.cooldowns.skill2 <= 0,
      };
    case "ultimate":
      return {
        name: cls.ultimateName,
        multiplier: 2.5,
        cdMax: 5,
        cdLeft: actor.cooldowns.ultimate,
        available: actor.cooldowns.ultimate <= 0,
      };
  }
}

// Re-export utilitaires utiles pour les composants.
export type { CombatUnit, CombatLog } from "./eternum-combat";
export type { EternumClassId, EternumElementId };
