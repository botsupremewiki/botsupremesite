// Imperium — types et constants core partagés client/server.
// Les chiffres précis (coûts, courbes, stats) vivent côté SQL pour anti-triche.

export type ImperiumFaction = "legion" | "horde" | "ordre";

export const IMPERIUM_FACTIONS: Record<
  ImperiumFaction,
  {
    id: ImperiumFaction;
    name: string;
    glyph: string;
    short: string;
    role: string;
    accent: string;
    border: string;
    gradient: string;
    wallSkin: string;
    wallBonusPerLevel: number;
    wallBonusCap: number;
  }
> = {
  legion: {
    id: "legion",
    name: "Légion",
    glyph: "🦅",
    short: "Romaine, équilibrée",
    role: "Discipline, économie solide, infanterie polyvalente, cavalerie lourde. L'allrounder.",
    accent: "text-amber-200",
    border: "border-amber-400/50",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.10),transparent_70%)]",
    wallSkin: "Muraille de pierre",
    wallBonusPerLevel: 0.03,
    wallBonusCap: 0.6,
  },
  horde: {
    id: "horde",
    name: "Horde",
    glyph: "🐺",
    short: "Steppes, offensive",
    role: "Vitesse de marche, loot capacity élevée, raids rapides. Défense fragile.",
    accent: "text-rose-200",
    border: "border-rose-400/50",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.10),transparent_70%)]",
    wallSkin: "Palissade",
    wallBonusPerLevel: 0.02,
    wallBonusCap: 0.4,
  },
  ordre: {
    id: "ordre",
    name: "Ordre",
    glyph: "✝️",
    short: "Templiers, défensive",
    role: "Bunker. Infanterie lourde, économie auto-suffisante. Faible mobilité offensive.",
    accent: "text-sky-200",
    border: "border-sky-400/50",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(125,211,252,0.10),transparent_70%)]",
    wallSkin: "Rempart fortifié",
    wallBonusPerLevel: 0.04,
    wallBonusCap: 0.8,
  },
};

export type ImperiumResource = "wood" | "clay" | "iron" | "wheat";

export const IMPERIUM_RESOURCES: Record<
  ImperiumResource,
  { id: ImperiumResource; name: string; glyph: string; accent: string }
> = {
  wood: { id: "wood", name: "Bois", glyph: "🪵", accent: "text-emerald-200" },
  clay: { id: "clay", name: "Argile", glyph: "🧱", accent: "text-orange-200" },
  iron: { id: "iron", name: "Fer", glyph: "⛓️", accent: "text-zinc-200" },
  wheat: { id: "wheat", name: "Blé", glyph: "🌾", accent: "text-amber-200" },
};

// Skip de timer — tarif OS selon durée restante.
export function imperiumSkipCost(secondsRemaining: number): number | null {
  if (secondsRemaining <= 3600) return 5_000;
  if (secondsRemaining <= 14_400) return 15_000;
  if (secondsRemaining <= 43_200) return 35_000;
  if (secondsRemaining <= 86_400) return 50_000;
  return null; // > 24h, skip impossible
}

// Distance Chebyshev (diagonales = 1 case).
export function imperiumDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

// Production / cap : formules dupliquées côté client pour affichage temps réel.
// (Le SQL reste autoritaire pour les débits/créditss.)

export function imperiumFieldRate(level: number): number {
  if (level <= 0) return 5;
  return 5 + 30 * Math.pow(1.165, level - 1);
}

export function imperiumStorageCap(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(400 * Math.pow(1.3, level - 1)) + 800;
}

export function imperiumHideoutCap(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(200 * Math.pow(1.25, level - 1));
}

export function imperiumWallBonus(
  faction: ImperiumFaction,
  level: number,
): number {
  const f = IMPERIUM_FACTIONS[faction];
  return Math.min(f.wallBonusCap, level * f.wallBonusPerLevel);
}

// Format helpers
export function formatNumber(n: number): string {
  return Math.floor(n).toLocaleString("fr-FR");
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm > 0 ? `${h}h${rm.toString().padStart(2, "0")}` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}j ${rh}h` : `${d}j`;
}

// Types DB rows (correspondent au SQL).

export type ImperiumVillageRow = {
  id: string;
  user_id: string;
  name: string;
  faction: ImperiumFaction;
  x: number;
  y: number;
  is_secondary: boolean;
  last_tick: string;
  last_login: string;
  wood: number;
  clay: number;
  iron: number;
  wheat: number;
  shield_until: string | null;
  created_at: string;
};

export type ImperiumBuildingRow = {
  id: string;
  village_id: string;
  slot: number;
  kind: string;
  level: number;
};

export type ImperiumQueueRow = {
  id: string;
  village_id: string;
  kind: "building" | "research" | "forge";
  target_kind: string;
  target_slot: number | null;
  target_level: number;
  started_at: string;
  finishes_at: string;
};

export type ImperiumUnitRow = {
  village_id: string;
  unit_kind: string;
  count: number;
  recruiting_count: number;
  recruiting_finishes_at: string | null;
  per_unit_seconds: number | null;
};

export type ImperiumResearchRow = {
  village_id: string;
  unit_kind: string;
  researched: boolean;
};

export type ImperiumForgeRow = {
  village_id: string;
  unit_kind: string;
  attack_level: number;
  defense_level: number;
};

export type ImperiumMarchRow = {
  id: string;
  from_village_id: string;
  to_x: number;
  to_y: number;
  kind: "raid" | "attack" | "support" | "spy" | "conquest" | "settle";
  units: Record<string, number>;
  target_building: string | null;
  arrives_at: string;
  returns_at: string | null;
  state: "outbound" | "arrived" | "returning" | "completed" | "cancelled";
  loot: Record<string, number> | null;
  created_at: string;
};

export type ImperiumReportRow = {
  id: string;
  attacker_user_id: string | null;
  defender_user_id: string | null;
  march_id: string | null;
  kind: string;
  data: Record<string, unknown>;
  created_at: string;
  read_by_attacker: boolean;
  read_by_defender: boolean;
};

export type ImperiumMapCellRow = {
  x: number;
  y: number;
  kind: "player_village" | "oasis" | "barbarian" | "wonder" | "empty";
  village_id: string | null;
  data: Record<string, unknown> | null;
};

export type ImperiumAllianceRow = {
  id: string;
  name: string;
  tag: string;
  color: string;
  chief_id: string;
  created_at: string;
};

export type ImperiumAllianceMemberRow = {
  alliance_id: string;
  user_id: string;
  role: "chief" | "deputy" | "diplomat" | "member";
  joined_at: string;
};
