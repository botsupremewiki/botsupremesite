// Helper centralisé pour construire l'équipe de combat d'un joueur en
// agrégeant héros + familiers actifs + items équipés.
//
// Utilisé par toutes les pages combat (donjons, raids, tower, pvp, dream,
// challenges, world boss, guild boss, adventure) pour appliquer les
// bonusStats des items équipés aux unités combat.

import {
  ETERNUM_CLASSES,
  type EternumClassId,
  type EternumElementId,
  type EternumHero,
  type EternumRarity,
} from "./types";
import {
  buildFamilierUnit,
  buildHeroUnit,
  type CombatUnit,
} from "./eternum-combat";
import {
  ETERNUM_FAMILIERS_BY_ID,
  familierDisplayName,
} from "./eternum-familiers";
import { ETERNUM_ITEMS_BY_ID } from "./eternum-items";

/** Item équipé tel que retourné par eternum_items_owned. */
export type OwnedEquippedItem = {
  id: string;
  item_id: string;
  equipped_on_hero: boolean;
  equipped_on_familier: string | null; // ref vers eternum_familiers_owned.id
};

/** Familier actif tel que retourné par eternum_familiers_owned avec team_slot. */
export type OwnedTeamFamilier = {
  id: string;
  familier_id: string;
  element_id: string;
  level: number;
};

/** Bonus stats agrégés (somme des items équipés sur un porteur). */
export type BonusStats = { hp: number; atk: number; def: number; spd: number };

const ZERO_BONUS: BonusStats = { hp: 0, atk: 0, def: 0, spd: 0 };

/** Agrège les bonusStats d'une liste d'items. */
export function aggregateBonusStats(itemIds: string[]): BonusStats {
  const acc: BonusStats = { hp: 0, atk: 0, def: 0, spd: 0 };
  for (const id of itemIds) {
    const tpl = ETERNUM_ITEMS_BY_ID.get(id);
    if (!tpl) continue;
    acc.hp += tpl.bonusStats.hp;
    acc.atk += tpl.bonusStats.atk;
    acc.def += tpl.bonusStats.def;
    acc.spd += tpl.bonusStats.spd;
  }
  return acc;
}

/** Index : porteur (hero ou familier id) → bonusStats agrégés. */
export type LoadoutBonuses = {
  hero: BonusStats;
  /** key = OwnedTeamFamilier.id, value = bonus. */
  familiers: Record<string, BonusStats>;
};

/** Construit l'index des bonus à partir des items équipés. */
export function computeLoadoutBonuses(
  items: OwnedEquippedItem[],
): LoadoutBonuses {
  const heroItems: string[] = [];
  const famItems: Record<string, string[]> = {};
  for (const item of items) {
    if (item.equipped_on_hero) {
      heroItems.push(item.item_id);
    } else if (item.equipped_on_familier) {
      const k = item.equipped_on_familier;
      (famItems[k] ??= []).push(item.item_id);
    }
  }
  const familiers: Record<string, BonusStats> = {};
  for (const [famId, ids] of Object.entries(famItems)) {
    familiers[famId] = aggregateBonusStats(ids);
  }
  return {
    hero: aggregateBonusStats(heroItems),
    familiers,
  };
}

/** Résultat consolidé : units prêts pour combat + maps pour UI. */
export type CombatLoadout = {
  units: CombatUnit[];
  /** id unit → rareté du familier (legendary pour héros). */
  rarities: Record<string, EternumRarity>;
  /** id unit → glyph custom du familier (cls.glyph pour héros). */
  glyphs: Record<string, string>;
  /** id unit → bonusStats agrégés (pour affichage). */
  bonuses: Record<string, BonusStats>;
};

/**
 * Construit team A (héros + familiers actifs) avec bonusStats appliqués.
 * Le résultat peut être passé directement à `<AtbBattleModal teamA={...} />`.
 */
export function buildPlayerCombatLoadout(
  hero: EternumHero,
  team: OwnedTeamFamilier[],
  items: OwnedEquippedItem[],
): CombatLoadout {
  const bonuses = computeLoadoutBonuses(items);
  const cls = ETERNUM_CLASSES[hero.classId];

  const units: CombatUnit[] = [];
  const rarities: Record<string, EternumRarity> = {};
  const glyphs: Record<string, string> = {};
  const bonusMap: Record<string, BonusStats> = {};

  // Héros
  units.push(
    buildHeroUnit(
      "hero",
      cls.name + " (Toi)",
      hero.classId,
      hero.elementId,
      hero.level,
      "A",
      bonuses.hero,
    ),
  );
  rarities["hero"] = "legendary";
  bonusMap["hero"] = bonuses.hero;

  // Familiers
  for (const f of team) {
    const base = ETERNUM_FAMILIERS_BY_ID.get(f.familier_id);
    if (!base) continue;
    const elt = f.element_id as EternumElementId;
    const id = `fam-${f.id}`;
    const famBonus = bonuses.familiers[f.id] ?? ZERO_BONUS;
    units.push(
      buildFamilierUnit(
        id,
        familierDisplayName(base, elt),
        base.classId,
        elt,
        f.level,
        base.baseStats,
        "A",
        famBonus,
      ),
    );
    rarities[id] = base.rarity;
    glyphs[id] = base.glyph;
    bonusMap[id] = famBonus;
  }

  return { units, rarities, glyphs, bonuses: bonusMap };
}

// Re-export utiles pour les pages combat.
export type { CombatUnit, EternumClassId, EternumElementId };
