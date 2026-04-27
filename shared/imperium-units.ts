// Imperium — labels et metadata des unités (côté client).
// Stats détaillées dans supabase/imperium.sql (imperium_unit_base).

import type { ImperiumFaction } from "./imperium";

export type ImperiumUnitCategory =
  | "inf"
  | "cav_scout"
  | "cav"
  | "siege"
  | "special";

export type ImperiumUnitMeta = {
  id: string;
  name: string;
  glyph: string;
  faction: ImperiumFaction;
  category: ImperiumUnitCategory;
  // Pour la lookup serveur côté SQL.
  kind: string;
  // Stats locales pour affichage rapide (synchro à conserver avec imperium_unit_base).
  cost: { wood: number; clay: number; iron: number; wheat: number };
  time: number; // secondes
  att: number;
  di: number;
  dc: number;
  vit: number;
  loot: number;
  wheatH: number;
};

// Helper : génère une ligne d'unité depuis ses stats SQL.
function unit(
  faction: ImperiumFaction,
  kind: string,
  name: string,
  glyph: string,
  category: ImperiumUnitCategory,
  cost: [number, number, number, number],
  time: number,
  att: number,
  di: number,
  dc: number,
  vit: number,
  loot: number,
  wheatH: number,
): ImperiumUnitMeta {
  return {
    id: `${faction}/${kind}`,
    name,
    glyph,
    faction,
    category,
    kind,
    cost: { wood: cost[0], clay: cost[1], iron: cost[2], wheat: cost[3] },
    time,
    att,
    di,
    dc,
    vit,
    loot,
    wheatH,
  };
}

export const IMPERIUM_UNITS: ImperiumUnitMeta[] = [
  // Légion
  unit("legion", "legionnaire", "Légionnaire", "🛡️", "inf", [120, 100, 150, 30], 1500, 40, 35, 50, 6, 50, 1),
  unit("legion", "pretorien", "Prétorien", "🛡️", "inf", [100, 130, 160, 70], 1920, 30, 65, 35, 5, 20, 1),
  unit("legion", "imperator", "Imperator", "⚔️", "inf", [150, 160, 210, 80], 2400, 70, 40, 25, 7, 50, 1),
  unit("legion", "equite_imperatoris", "Equite Imperatoris", "🐎", "cav_scout", [140, 160, 20, 40], 1800, 0, 20, 10, 16, 0, 2),
  unit("legion", "equite_cesaris", "Equite Cesaris", "🐎", "cav", [550, 440, 320, 100], 3600, 120, 65, 50, 14, 100, 3),
  unit("legion", "equite_legati", "Equite Legati", "🐎", "cav", [200, 440, 520, 130], 4500, 180, 80, 105, 10, 70, 4),
  unit("legion", "ram", "Bélier", "🪵", "siege", [900, 360, 500, 70], 5400, 60, 30, 75, 4, 0, 3),
  unit("legion", "catapult", "Catapulte", "🎯", "siege", [950, 1350, 600, 90], 6600, 75, 60, 10, 3, 0, 6),
  unit("legion", "senator", "Sénateur", "👑", "special", [30750, 27200, 45000, 37500], 28800, 50, 40, 30, 4, 0, 5),
  unit("legion", "settler", "Colon", "🚩", "special", [5800, 5300, 7200, 5500], 18000, 0, 80, 80, 5, 3000, 1),

  // Horde
  unit("horde", "marauder", "Maraudeur", "🪓", "inf", [95, 75, 40, 40], 1080, 10, 25, 20, 7, 60, 1),
  unit("horde", "spearman", "Lancier", "🔱", "inf", [145, 70, 85, 40], 1320, 15, 35, 60, 7, 40, 1),
  unit("horde", "berserker", "Berserker", "🪓", "inf", [130, 120, 170, 40], 1800, 60, 30, 30, 6, 60, 1),
  unit("horde", "scout", "Éclaireur", "🐎", "cav_scout", [160, 100, 50, 50], 1500, 0, 10, 5, 18, 0, 2),
  unit("horde", "nomad", "Cavalier nomade", "🐎", "cav", [370, 270, 290, 75], 2700, 100, 50, 75, 17, 80, 3),
  unit("horde", "iron_rider", "Cavalier de fer", "🐎", "cav", [450, 515, 480, 80], 3600, 150, 50, 75, 13, 50, 3),
  unit("horde", "ram", "Bélier", "🪵", "siege", [1000, 300, 350, 70], 4800, 65, 30, 80, 4, 0, 3),
  unit("horde", "trebuchet", "Trébuchet", "🎯", "siege", [900, 1200, 600, 60], 6300, 50, 60, 10, 3, 0, 6),
  unit("horde", "khan", "Khan", "👑", "special", [35500, 26000, 25000, 27200], 28800, 40, 60, 40, 5, 0, 6),
  unit("horde", "pioneer", "Pionnier", "🚩", "special", [7200, 5500, 5800, 6500], 18000, 10, 80, 80, 5, 3500, 2),

  // Ordre
  unit("ordre", "templar", "Templier", "✝️", "inf", [100, 130, 160, 70], 1560, 35, 45, 40, 7, 60, 1),
  unit("ordre", "hospitaller", "Hospitalier", "✝️", "inf", [120, 110, 200, 40], 1800, 40, 60, 50, 6, 40, 1),
  unit("ordre", "brother", "Frère d'armes", "⚔️", "inf", [140, 175, 270, 80], 2400, 60, 35, 60, 6, 50, 1),
  unit("ordre", "scout", "Éclaireur", "🐎", "cav_scout", [100, 180, 100, 65], 2100, 0, 20, 10, 9, 0, 2),
  unit("ordre", "crusader", "Croisé", "🐎", "cav", [350, 320, 330, 75], 3000, 110, 55, 45, 9, 110, 4),
  unit("ordre", "sergeant", "Sergent à cheval", "🐎", "cav", [270, 310, 440, 80], 3600, 150, 60, 130, 10, 80, 3),
  unit("ordre", "ram", "Bélier", "🪵", "siege", [1000, 450, 535, 70], 5400, 65, 30, 80, 4, 0, 3),
  unit("ordre", "catapult", "Catapulte", "🎯", "siege", [950, 1450, 630, 90], 6000, 50, 60, 10, 3, 0, 6),
  unit("ordre", "grand_master", "Grand Maître", "👑", "special", [30750, 45400, 31000, 37500], 36000, 70, 40, 50, 4, 0, 4),
  unit("ordre", "settler", "Colon", "🚩", "special", [5500, 7000, 5300, 4900], 18000, 10, 80, 80, 5, 3000, 1),
];

export function imperiumUnitsByFaction(
  faction: ImperiumFaction,
): ImperiumUnitMeta[] {
  return IMPERIUM_UNITS.filter((u) => u.faction === faction);
}

export function imperiumUnit(
  faction: ImperiumFaction,
  kind: string,
): ImperiumUnitMeta | null {
  return IMPERIUM_UNITS.find((u) => u.faction === faction && u.kind === kind) ?? null;
}

export const UNIT_BASIC_INFANTRY: Record<ImperiumFaction, string> = {
  legion: "legionnaire",
  horde: "marauder",
  ordre: "templar",
};

// Prérequis recherche par catégorie (déclaratif).
export const RESEARCH_PREREQUISITES: Record<
  ImperiumUnitCategory,
  { academy: number; recruiter: number }
> = {
  inf: { academy: 1, recruiter: 3 }, // pour inf défensive (basic skip)
  cav_scout: { academy: 5, recruiter: 1 },
  cav: { academy: 10, recruiter: 5 },
  siege: { academy: 10, recruiter: 1 },
  special: { academy: 20, recruiter: 20 }, // hôtel 20
};
