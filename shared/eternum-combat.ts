// Moteur de combat tour-par-tour Eternum.
// Pure-fonction : prend 2 équipes en entrée, retourne result + log.
// Utilisé en solo (donjon/world boss) côté Next.js et en multi
// (raids/PvP) côté PartyKit. Server-authoritative dans tous les cas.

import {
  ETERNUM_CLASSES,
  type EternumClassId,
  type EternumElementId,
  eternumElementMultiplier,
} from "./types";

export type CombatUnit = {
  id: string;          // unique au combat
  name: string;
  isHero: boolean;     // true = héros, false = familier (pour split raids/world boss)
  team: "A" | "B";
  classId: EternumClassId;
  element: EternumElementId;
  level: number;
  hp: number;
  hpMax: number;
  atk: number;
  def: number;
  spd: number;
  alive: boolean;
  ultimateReady: boolean;   // débloqué après tour 3
  // Buffs/débuffs simples (durée en tours).
  atkBuffTurns: number;
  defDownTurns: number;
};

export type CombatLog = {
  turn: number;
  actor: string;
  target?: string;
  action: string;
  damage?: number;
  isCrit?: boolean;
  elementMult?: number;
  msg: string;
};

export type CombatResult = {
  winner: "A" | "B" | "draw";
  turns: number;
  log: CombatLog[];
  survivors: { A: number; B: number };
};

export function simulateBattle(
  teamA: CombatUnit[],
  teamB: CombatUnit[],
  maxTurns = 50,
): CombatResult {
  // Reset et copie défensive.
  const all = [...teamA.map(deepClone), ...teamB.map(deepClone)];
  for (const u of all) {
    u.alive = u.hp > 0;
    u.ultimateReady = false;
    u.atkBuffTurns = 0;
    u.defDownTurns = 0;
  }
  const log: CombatLog[] = [];
  let turn = 0;
  // Initiative initiale (par SPD décroissante avec tiebreak aléatoire stable).
  const order = [...all].sort((a, b) => {
    if (b.spd !== a.spd) return b.spd - a.spd;
    return a.id.localeCompare(b.id);
  });

  while (turn < maxTurns) {
    turn++;
    if (turn === 4) {
      // Ultime débloqué pour tous.
      for (const u of all) u.ultimateReady = true;
    }

    for (const actor of order) {
      if (!actor.alive) continue;
      // Vérifie victoire.
      if (countAlive(all, "A") === 0 || countAlive(all, "B") === 0) break;

      // Choix de la cible : ennemi vivant avec le moins de HP %
      const enemies = all.filter((u) => u.alive && u.team !== actor.team);
      if (enemies.length === 0) break;
      enemies.sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax);
      const target = enemies[0];

      // Décide ultime ou skill normal.
      const useUlt = actor.ultimateReady && Math.random() < 0.4;
      if (useUlt) actor.ultimateReady = false;

      // Calcul dégâts.
      const cls = ETERNUM_CLASSES[actor.classId];
      const mult = eternumElementMultiplier(actor.element, target.element);
      const isCrit = Math.random() < (actor.classId === "assassin" ? 0.35 : 0.15);
      const baseAtk = actor.atk * (actor.atkBuffTurns > 0 ? 1.3 : 1.0);
      const baseDef = target.def * (target.defDownTurns > 0 ? 0.7 : 1.0);
      const ultMult = useUlt ? 2.5 : 1.0;
      const critMult = isCrit ? 1.6 : 1.0;
      let dmg = Math.max(
        1,
        Math.round((baseAtk * 2 - baseDef) * mult * critMult * ultMult),
      );

      // Vampire lifesteal.
      if (actor.classId === "vampire") {
        const heal = Math.round(dmg * 0.25);
        actor.hp = Math.min(actor.hpMax, actor.hp + heal);
      }
      // Paladin heal allié (simple).
      if (actor.classId === "paladin" && Math.random() < 0.4) {
        const allies = all.filter((u) => u.alive && u.team === actor.team);
        const ally = allies.sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0];
        if (ally) {
          const heal = Math.round(actor.hpMax * 0.05);
          ally.hp = Math.min(ally.hpMax, ally.hp + heal);
          log.push({
            turn,
            actor: actor.name,
            target: ally.name,
            action: "heal",
            damage: -heal,
            msg: `${actor.name} soigne ${ally.name} (+${heal} HP)`,
          });
        }
      }
      // Prêtre buff allié atk.
      if (actor.classId === "priest" && Math.random() < 0.5) {
        const allies = all.filter((u) => u.alive && u.team === actor.team && u.id !== actor.id);
        const ally = allies[Math.floor(Math.random() * Math.max(1, allies.length))];
        if (ally) {
          ally.atkBuffTurns = 2;
          log.push({
            turn,
            actor: actor.name,
            target: ally.name,
            action: "buff",
            msg: `${actor.name} buff ${ally.name} (+30% atk 2 tours)`,
          });
        }
      }

      target.hp = Math.max(0, target.hp - dmg);
      log.push({
        turn,
        actor: actor.name,
        target: target.name,
        action: useUlt ? cls.ultimateName : "attaque",
        damage: dmg,
        isCrit,
        elementMult: mult,
        msg: `${actor.name} ${useUlt ? "ULTIME → " : ""}${cls.ultimateName && useUlt ? cls.ultimateName + " sur " : "frappe "}${target.name} pour ${dmg} dmg${isCrit ? " (CRIT)" : ""}${mult !== 1 ? ` ×${mult}` : ""}`,
      });

      if (target.hp <= 0) {
        target.alive = false;
        log.push({
          turn,
          actor: target.name,
          action: "ko",
          msg: `💀 ${target.name} est K.O.`,
        });
      }

      // Décrémente buffs/débuffs en fin de tour pour cet acteur.
      if (actor.atkBuffTurns > 0) actor.atkBuffTurns--;
      if (actor.defDownTurns > 0) actor.defDownTurns--;
    }

    if (countAlive(all, "A") === 0 || countAlive(all, "B") === 0) break;
  }

  const aliveA = countAlive(all, "A");
  const aliveB = countAlive(all, "B");
  let winner: "A" | "B" | "draw";
  if (aliveA === 0 && aliveB === 0) winner = "draw";
  else if (aliveA === 0) winner = "B";
  else if (aliveB === 0) winner = "A";
  else winner = aliveA >= aliveB ? "A" : "B"; // timeout : équipe avec + de survivants

  return {
    winner,
    turns: turn,
    log,
    survivors: { A: aliveA, B: aliveB },
  };
}

function countAlive(units: CombatUnit[], team: "A" | "B"): number {
  return units.filter((u) => u.team === team && u.alive).length;
}

function deepClone(u: CombatUnit): CombatUnit {
  return { ...u };
}

/** Construit une CombatUnit depuis une classe + élément + niveau (pour héros). */
export function buildHeroUnit(
  id: string,
  name: string,
  classId: EternumClassId,
  element: EternumElementId,
  level: number,
  team: "A" | "B",
  bonusStats?: { hp: number; atk: number; def: number; spd: number },
): CombatUnit {
  const cls = ETERNUM_CLASSES[classId];
  const lv = Math.max(1, Math.min(1000, level));
  const base = {
    hp: Math.round(cls.baseStats.hp + cls.growth.hp * (lv - 1)),
    atk: Math.round(cls.baseStats.atk + cls.growth.atk * (lv - 1)),
    def: Math.round(cls.baseStats.def + cls.growth.def * (lv - 1)),
    spd: Math.round(cls.baseStats.spd + cls.growth.spd * (lv - 1)),
  };
  const total = {
    hp: base.hp + (bonusStats?.hp ?? 0),
    atk: base.atk + (bonusStats?.atk ?? 0),
    def: base.def + (bonusStats?.def ?? 0),
    spd: base.spd + (bonusStats?.spd ?? 0),
  };
  return {
    id,
    name,
    isHero: true,
    team,
    classId,
    element,
    level: lv,
    hp: total.hp,
    hpMax: total.hp,
    atk: total.atk,
    def: total.def,
    spd: total.spd,
    alive: true,
    ultimateReady: false,
    atkBuffTurns: 0,
    defDownTurns: 0,
  };
}

export function buildFamilierUnit(
  id: string,
  name: string,
  classId: EternumClassId,
  element: EternumElementId,
  level: number,
  baseStats: { hp: number; atk: number; def: number; spd: number },
  team: "A" | "B",
  bonusStats?: { hp: number; atk: number; def: number; spd: number },
): CombatUnit {
  const lv = Math.max(1, Math.min(1000, level));
  // Croissance familier = 80% de la croissance classe.
  const cls = ETERNUM_CLASSES[classId];
  const grown = {
    hp: Math.round(baseStats.hp + cls.growth.hp * 0.8 * (lv - 1)),
    atk: Math.round(baseStats.atk + cls.growth.atk * 0.8 * (lv - 1)),
    def: Math.round(baseStats.def + cls.growth.def * 0.8 * (lv - 1)),
    spd: Math.round(baseStats.spd + cls.growth.spd * 0.8 * (lv - 1)),
  };
  const total = {
    hp: grown.hp + (bonusStats?.hp ?? 0),
    atk: grown.atk + (bonusStats?.atk ?? 0),
    def: grown.def + (bonusStats?.def ?? 0),
    spd: grown.spd + (bonusStats?.spd ?? 0),
  };
  return {
    id,
    name,
    isHero: false,
    team,
    classId,
    element,
    level: lv,
    hp: total.hp,
    hpMax: total.hp,
    atk: total.atk,
    def: total.def,
    spd: total.spd,
    alive: true,
    ultimateReady: false,
    atkBuffTurns: 0,
    defDownTurns: 0,
  };
}
