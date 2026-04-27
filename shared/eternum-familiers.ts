// Catalogue des familiers Eternum.
// 6 classes × (5 commun + 4 rare + 3 épique + 2 légendaire + 1 prismatique) = 90 familiers de base.
// À l'invocation : un familier obtient un élément aléatoire (4 base × 24%, 2 unlock × 2%).
// Donc 90 × 6 = 540 variants collectibles au total.

import type {
  EternumClassId,
  EternumElementId,
  EternumRarity,
} from "./types";

export type FamilierBase = {
  id: string;
  name: string;
  glyph: string;
  classId: EternumClassId;
  rarity: EternumRarity;
  // Stats de base au niveau 1, multipliées par la rareté lors de l'invocation.
  baseStats: { hp: number; atk: number; def: number; spd: number };
  passiveName: string;
  passiveText: string;
  spell1Name: string;
  spell2Name: string;
  ultimateName: string;
};

const RARITY_STAT_MULT: Record<EternumRarity, number> = {
  common: 1.0,
  rare: 1.25,
  epic: 1.55,
  legendary: 1.95,
  prismatic: 2.5,
};

export const RARITY_INVOCATION_PRICE: Record<EternumRarity, number> = {
  common: 500,
  rare: 5_000,
  epic: 50_000,
  legendary: 250_000,
  prismatic: 0, // non-invocable directement (besoin de pierre prismatique)
};

export const RARITY_LABEL: Record<EternumRarity, string> = {
  common: "Commun",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
  prismatic: "Prismatique",
};

export const RARITY_ACCENT: Record<EternumRarity, string> = {
  common: "text-zinc-200 border-zinc-500/40",
  rare: "text-emerald-200 border-emerald-400/50",
  epic: "text-sky-200 border-sky-400/60",
  legendary: "text-amber-200 border-amber-400/60",
  prismatic:
    "text-fuchsia-200 border-fuchsia-400/60 shadow-[0_0_24px_rgba(232,121,249,0.45)]",
};

// ─── Naming variants par élément ─────────────────────────────────────
// 90 noms de base × 6 éléments = 540 noms uniques en composant
// "{nom_de_base} {qualificatif_élément}".
export const ELEMENT_QUALIFIER: Record<EternumElementId, string> = {
  fire: "igné",
  water: "glacial",
  wind: "vif",
  earth: "tellurique",
  light: "rayonnant",
  dark: "ténébreux",
};

/**
 * Renvoie le nom complet d'un familier en composant le nom de base et
 * un qualificatif élémentaire. Ex : "Loup-Alpha igné", "Tigron glacial".
 *
 * Stratégie : féminisation simple — on n'essaie pas de gérer les genres
 * grammaticaux dans Eternum (ce sont des appellations magiques).
 */
export function familierDisplayName(
  base: FamilierBase,
  element: EternumElementId,
): string {
  return `${base.name} ${ELEMENT_QUALIFIER[element]}`;
}

// Lookup rapide par (familier_id, element_id) → nom affiché.
export function familierDisplayNameById(
  familierId: string,
  element: EternumElementId,
): string {
  const base = ETERNUM_FAMILIERS_BY_ID.get(familierId);
  if (!base) return familierId;
  return familierDisplayName(base, element);
}

// CSS hue-rotate à appliquer APRÈS sepia(0.7).
// Le sepia(0.7) part d'une teinte brun-jaune (~30°). Les valeurs ici sont
// les rotations relatives nécessaires pour atteindre la cible visuelle :
// - fire : rouge/orange chaud
// - water : bleu cyan
// - wind : vert clair
// - earth : ambre/brun (proche de la base sepia, peu de rotation)
// - light : jaune doré
// - dark : violet/magenta
export const ELEMENT_HUE_ROTATE: Record<EternumElementId, number> = {
  fire: 340,      // pousse vers rouge
  water: 180,     // pousse vers cyan/bleu
  wind: 75,       // pousse vers vert frais
  earth: 5,       // proche de la base sepia (brun/ambre)
  light: 25,      // jaune lumineux
  dark: 245,      // violet sombre
};

// Saturation à combiner avec hue-rotate. Plus haut = couleur plus marquée.
export const ELEMENT_SATURATE: Record<EternumElementId, number> = {
  fire: 1.4,
  water: 1.5,
  wind: 1.3,
  earth: 1.2,
  light: 1.6,
  dark: 1.4,
};

/**
 * CSS filter complet pour teindre un emoji selon l'élément.
 *
 * Trick : les emojis "neutres" (gris) ne réagissent pas bien à hue-rotate
 * seul (faible saturation native). On applique d'abord `sepia(0.7)` qui
 * force une teinte jaune-brun chaude, puis on déplace vers la couleur
 * cible avec hue-rotate. Résultat : l'emoji 🐺 (gris) devient un vrai
 * loup rouge / bleu / vert / violet selon l'élément.
 */
export function elementTintFilter(element: EternumElementId): string {
  const hue = ELEMENT_HUE_ROTATE[element];
  const sat = ELEMENT_SATURATE[element];
  return `sepia(0.7) hue-rotate(${hue}deg) saturate(${sat}) brightness(1.05)`;
}

// Templates de stats par classe (en base, niveau 1, rareté commune).
const CLASS_STAT_TEMPLATES: Record<
  EternumClassId,
  { hp: number; atk: number; def: number; spd: number }
> = {
  warrior: { hp: 180, atk: 22, def: 18, spd: 11 },
  paladin: { hp: 170, atk: 18, def: 20, spd: 12 },
  assassin: { hp: 120, atk: 28, def: 10, spd: 18 },
  mage: { hp: 110, atk: 30, def: 9, spd: 14 },
  priest: { hp: 130, atk: 14, def: 12, spd: 15 },
  vampire: { hp: 145, atk: 24, def: 12, spd: 14 },
};

// Pools de noms thématiques par classe.
const NAMES_BY_CLASS: Record<EternumClassId, string[]> = {
  warrior: [
    "Sanglier",
    "Loup-Alpha",
    "Ours-Roux",
    "Taureau",
    "Bélier",
    "Rhinos",
    "Tigron",
    "Léon",
    "Gorille",
    "Cerf-Cornu",
    "Mante-Lame",
    "Scorpion-Rouge",
    "Ouragan",
    "Tornade",
    "Drakkar",
  ],
  paladin: [
    "Faon-Sacré",
    "Cerf-Blanc",
    "Cygne",
    "Colombe",
    "Lion-Doré",
    "Manticore",
    "Pégase",
    "Licorne",
    "Sphinx",
    "Aigle-Argent",
    "Garde-Or",
    "Séraphin",
    "Archange",
    "Aurore",
    "Solaris",
  ],
  assassin: [
    "Chat-Noir",
    "Rat-Voile",
    "Belette",
    "Renard",
    "Corbeau",
    "Vipère",
    "Furet",
    "Lynx-Brume",
    "Panthère",
    "Chouette",
    "Mante-Furtive",
    "Frelon",
    "Kitsune",
    "Shinobi",
    "Penombre",
  ],
  mage: [
    "Lutin",
    "Salamandre",
    "Méduse",
    "Sprite",
    "Petit-Phénix",
    "Élémental-Feu",
    "Élémental-Eau",
    "Gargouille",
    "Basilic",
    "Chimère",
    "Ifrit",
    "Djinn",
    "Phénix",
    "Léviathan",
    "Astrelune",
  ],
  priest: [
    "Papillon",
    "Fée",
    "Petite-Aile",
    "Cristal",
    "Lapin-Sacré",
    "Pixie",
    "Esprit-Forêt",
    "Hibou-Sage",
    "Tigre-Blanc",
    "Loup-Lumière",
    "Kirin",
    "Qilin",
    "Ange-Gardien",
    "Devastrelle",
    "Astralys",
  ],
  vampire: [
    "Chauve-Souris",
    "Rat-Sang",
    "Araignée",
    "Corbeau-Noir",
    "Serpent-Cramoisi",
    "Loup-Crépuscule",
    "Goule",
    "Stryge",
    "Ferralis",
    "Croc-Noir",
    "Ombre-Liée",
    "Démon-Mineur",
    "Succube",
    "Liche",
    "Vampyre",
  ],
};

// Glyphs par index dans la liste (1 par familier — utilisé pour l'art).
const GLYPHS_BY_CLASS: Record<EternumClassId, string[]> = {
  warrior: ["🐗", "🐺", "🐻", "🐂", "🐏", "🦏", "🐅", "🦁", "🦍", "🦌", "🦗", "🦂", "🌪️", "💨", "🐉"],
  paladin: ["🦌", "🦌", "🦢", "🕊️", "🦁", "🐲", "🐎", "🦄", "🦅", "🦅", "🛡️", "👼", "😇", "☀️", "✨"],
  assassin: ["🐈‍⬛", "🐀", "🦡", "🦊", "🐦‍⬛", "🐍", "🦦", "🐱", "🐆", "🦉", "🦗", "🐝", "🦊", "🥷", "🌑"],
  mage: ["🧚", "🦎", "🪼", "🧚‍♀️", "🐦‍🔥", "🔥", "🌊", "🗿", "🐍", "🐲", "🪔", "🧞", "🐦‍🔥", "🐉", "🌌"],
  priest: ["🦋", "🧚", "🕊️", "💎", "🐇", "🧚‍♂️", "🌳", "🦉", "🐅", "🐺", "🦄", "🐲", "👼", "🦋", "✨"],
  vampire: ["🦇", "🐀", "🕷️", "🐦‍⬛", "🐍", "🐺", "🧟", "👻", "🦇", "🦷", "🌑", "👹", "👺", "💀", "🩸"],
};

/** Construit le catalogue complet des 90 familiers (15 par classe). */
function buildFamilierCatalog(): FamilierBase[] {
  const out: FamilierBase[] = [];
  const distribution: { rarity: EternumRarity; count: number }[] = [
    { rarity: "common", count: 5 },
    { rarity: "rare", count: 4 },
    { rarity: "epic", count: 3 },
    { rarity: "legendary", count: 2 },
    { rarity: "prismatic", count: 1 },
  ];

  for (const classId of [
    "warrior",
    "paladin",
    "assassin",
    "mage",
    "priest",
    "vampire",
  ] as EternumClassId[]) {
    const names = NAMES_BY_CLASS[classId];
    const glyphs = GLYPHS_BY_CLASS[classId];
    const tpl = CLASS_STAT_TEMPLATES[classId];
    let idx = 0;
    for (const { rarity, count } of distribution) {
      for (let i = 0; i < count; i++) {
        const mult = RARITY_STAT_MULT[rarity];
        out.push({
          id: `${classId}-${rarity}-${i + 1}`,
          name: names[idx] ?? `${classId.toUpperCase()}-${idx + 1}`,
          glyph: glyphs[idx] ?? "❓",
          classId,
          rarity,
          baseStats: {
            hp: Math.round(tpl.hp * mult),
            atk: Math.round(tpl.atk * mult),
            def: Math.round(tpl.def * mult),
            spd: Math.round(tpl.spd * mult),
          },
          passiveName: passiveByClass(classId, rarity),
          passiveText: passiveTextByClass(classId, rarity),
          spell1Name: "Frappe basique",
          spell2Name: "Sort élémentaire",
          ultimateName: ultimateByRarity(rarity),
        });
        idx++;
      }
    }
  }
  return out;
}

function passiveByClass(c: EternumClassId, r: EternumRarity): string {
  const map: Record<EternumClassId, string> = {
    warrior: "Garde solide",
    paladin: "Bouclier sacré",
    assassin: "Œil affûté",
    mage: "Maîtrise arcanique",
    priest: "Faveur divine",
    vampire: "Soif insatiable",
  };
  const prefix = r === "prismatic" ? "✨ " : "";
  return prefix + map[c];
}

function passiveTextByClass(c: EternumClassId, r: EternumRarity): string {
  const bonus =
    r === "prismatic" ? 30 : r === "legendary" ? 20 : r === "epic" ? 15 : r === "rare" ? 10 : 5;
  const map: Record<EternumClassId, string> = {
    warrior: `+${bonus}% défense quand HP < 50%`,
    paladin: `Heal de ${bonus / 5}% HP max à un allié au hasard / tour`,
    assassin: `+${bonus}% chance critique`,
    mage: `+${bonus}% dégâts contre cibles affaiblies`,
    priest: `+${bonus / 2}% atk à toute l'équipe`,
    vampire: `${bonus}% lifesteal sur tous les sorts`,
  };
  return map[c];
}

function ultimateByRarity(r: EternumRarity): string {
  switch (r) {
    case "prismatic":
      return "Apocalypse Prismatique";
    case "legendary":
      return "Furie Légendaire";
    case "epic":
      return "Déchaînement Épique";
    case "rare":
      return "Frappe Rare";
    default:
      return "Coup Spécial";
  }
}

export const ETERNUM_FAMILIERS: FamilierBase[] = buildFamilierCatalog();

export const ETERNUM_FAMILIERS_BY_ID: Map<string, FamilierBase> = new Map(
  ETERNUM_FAMILIERS.map((f) => [f.id, f]),
);

export function familiersOfRarity(r: EternumRarity): FamilierBase[] {
  return ETERNUM_FAMILIERS.filter((f) => f.rarity === r);
}

/** Élément aléatoire pondéré : ~24% chacun pour les 4 base, ~2% pour Lumière/Ombre. */
export function rollFamilierElement(): EternumElementId {
  const r = Math.random();
  // 96% pour les 4 base (24% chacun) — 4% pour Lumière/Ombre (2% chacun)
  if (r < 0.24) return "fire";
  if (r < 0.48) return "water";
  if (r < 0.72) return "wind";
  if (r < 0.96) return "earth";
  if (r < 0.98) return "light";
  return "dark";
}
