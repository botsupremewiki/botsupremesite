// Catalogue items + recettes Eternum.
// 8 slots d'équipement, 5 raretés, panoplies.
// Items équipables sur héros et familiers (selon classe + niveau requis).

import type {
  EternumClassId,
  EternumJobId,
  EternumRarity,
} from "./types";

export type ItemSlot =
  | "helmet"
  | "chest"
  | "pants"
  | "boots"
  | "weapon"
  | "ring1"
  | "ring2"
  | "amulet";

export const ITEM_SLOTS: ItemSlot[] = [
  "helmet",
  "chest",
  "pants",
  "boots",
  "weapon",
  "ring1",
  "ring2",
  "amulet",
];

export const ITEM_SLOT_LABEL: Record<ItemSlot, string> = {
  helmet: "Casque",
  chest: "Plastron",
  pants: "Pantalon",
  boots: "Chaussures",
  weapon: "Arme",
  ring1: "Anneau",
  ring2: "Anneau",
  amulet: "Amulette",
};

export const ITEM_SLOT_GLYPH: Record<ItemSlot, string> = {
  helmet: "⛑️",
  chest: "🎽",
  pants: "👖",
  boots: "🥾",
  weapon: "⚔️",
  ring1: "💍",
  ring2: "💍",
  amulet: "📿",
};

export type ItemTemplate = {
  id: string;
  name: string;
  slot: ItemSlot;
  rarity: EternumRarity;
  // Classes autorisées à l'équiper (vide = toutes).
  classes: EternumClassId[];
  levelRequired: number;
  setId: string | null; // panoplie
  // Stats accordées par l'item (additives).
  bonusStats: { hp: number; atk: number; def: number; spd: number };
  craftedBy: EternumJobId | null;
  // Ressources requises au craft (idÉtape par étape côté SQL/RPC).
  craftCost?: { resourceId: string; count: number }[];
};

// 6 panoplies — bonus à 2/4/6 pièces (calculé au combat — Phase 4).
export type SetBonusConfig = {
  id: string;
  name: string;
  classes: EternumClassId[];
};

export const ETERNUM_SETS: Record<string, SetBonusConfig> = {
  "warrior-iron":   { id: "warrior-iron",   name: "Acier du Guerrier", classes: ["warrior"] },
  "paladin-light":  { id: "paladin-light",  name: "Lumière du Paladin", classes: ["paladin"] },
  "assassin-shade": { id: "assassin-shade", name: "Ombre de l'Assassin", classes: ["assassin"] },
  "mage-arcane":    { id: "mage-arcane",    name: "Arcane du Mage", classes: ["mage"] },
  "priest-divine":  { id: "priest-divine",  name: "Divin du Prêtre", classes: ["priest"] },
  "vampire-blood":  { id: "vampire-blood",  name: "Sang du Vampire", classes: ["vampire"] },
};

// Multiplicateurs de stats par rareté.
const RARITY_BONUS_MULT: Record<EternumRarity, number> = {
  common: 1.0,
  rare: 1.4,
  epic: 1.9,
  legendary: 2.6,
  prismatic: 3.6,
};

// Bonus de base par slot (rareté commune).
const SLOT_BASE_BONUS: Record<
  ItemSlot,
  { hp: number; atk: number; def: number; spd: number }
> = {
  helmet:  { hp: 30, atk: 0,  def: 6, spd: 0 },
  chest:   { hp: 50, atk: 0,  def: 10, spd: 0 },
  pants:   { hp: 30, atk: 0,  def: 6, spd: 1 },
  boots:   { hp: 20, atk: 0,  def: 4, spd: 3 },
  weapon:  { hp: 0,  atk: 12, def: 0, spd: 1 },
  ring1:   { hp: 10, atk: 3,  def: 2, spd: 1 },
  ring2:   { hp: 10, atk: 3,  def: 2, spd: 1 },
  amulet:  { hp: 15, atk: 4,  def: 3, spd: 1 },
};

// Liste classes par groupe d'armure.
const ARMOR_GROUPS: { jobId: EternumJobId; classes: EternumClassId[]; setSuffix: string }[] = [
  { jobId: "blacksmith", classes: ["warrior", "paladin"], setSuffix: "iron" },
  { jobId: "tanner",     classes: ["assassin", "vampire"], setSuffix: "leather" },
  { jobId: "weaver",     classes: ["mage", "priest"], setSuffix: "cloth" },
];

const ARMOR_SLOTS: ItemSlot[] = ["helmet", "chest", "pants", "boots"];

/** Génère le catalogue d'items : pour chaque rareté, 1 set par groupe
 *  d'armure + 1 set commun (anneaux/amulette/arme). */
function buildItemCatalog(): ItemTemplate[] {
  const out: ItemTemplate[] = [];
  const rarities: EternumRarity[] = [
    "common",
    "rare",
    "epic",
    "legendary",
    "prismatic",
  ];

  for (const rarity of rarities) {
    const mult = RARITY_BONUS_MULT[rarity];

    // 1) Armures par groupe (Forgeron, Tanneur, Tisserand)
    for (const group of ARMOR_GROUPS) {
      // Le set par classe : ex. "warrior-iron" pour Forgeron + Guerrier
      for (const cls of group.classes) {
        const setId = `${cls}-${group.setSuffix}`;
        for (const slot of ARMOR_SLOTS) {
          out.push({
            id: `${cls}-${rarity}-${slot}`,
            name: `${capitalize(rarity)} ${slotLabelFr(slot)} de ${cls}`,
            slot,
            rarity,
            classes: [cls],
            levelRequired: rarityLevelReq(rarity),
            setId,
            bonusStats: scaleStats(SLOT_BASE_BONUS[slot], mult),
            craftedBy: group.jobId,
          });
        }
      }
    }

    // 2) Armes (par classe) — Maître d'armes
    for (const cls of [
      "warrior",
      "paladin",
      "assassin",
      "mage",
      "priest",
      "vampire",
    ] as EternumClassId[]) {
      out.push({
        id: `${cls}-${rarity}-weapon`,
        name: `Arme ${rarity} de ${cls}`,
        slot: "weapon",
        rarity,
        classes: [cls],
        levelRequired: rarityLevelReq(rarity),
        setId: null,
        bonusStats: scaleStats(SLOT_BASE_BONUS.weapon, mult),
        craftedBy: "armorer",
      });
    }

    // 3) Bijoux universels — Bijoutier
    for (const slot of ["ring1", "ring2", "amulet"] as ItemSlot[]) {
      out.push({
        id: `universal-${rarity}-${slot}`,
        name: `${slotLabelFr(slot)} ${rarity}`,
        slot,
        rarity,
        classes: [],
        levelRequired: rarityLevelReq(rarity),
        setId: null,
        bonusStats: scaleStats(SLOT_BASE_BONUS[slot], mult),
        craftedBy: "jeweler",
      });
    }
  }

  return out;
}

function rarityLevelReq(r: EternumRarity): number {
  switch (r) {
    case "common": return 1;
    case "rare": return 15;
    case "epic": return 35;
    case "legendary": return 60;
    case "prismatic": return 90;
  }
}

function scaleStats(
  s: { hp: number; atk: number; def: number; spd: number },
  m: number,
) {
  return {
    hp: Math.round(s.hp * m),
    atk: Math.round(s.atk * m),
    def: Math.round(s.def * m),
    spd: Math.round(s.spd * m),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function slotLabelFr(s: ItemSlot): string {
  return ITEM_SLOT_LABEL[s];
}

export const ETERNUM_ITEMS: ItemTemplate[] = buildItemCatalog();
export const ETERNUM_ITEMS_BY_ID: Map<string, ItemTemplate> = new Map(
  ETERNUM_ITEMS.map((i) => [i.id, i]),
);

/** Resources : drops divers, utilisés pour craft. */
export type EternumResource = {
  id: string;
  name: string;
  glyph: string;
  rarity: EternumRarity;
};

export const ETERNUM_RESOURCES: EternumResource[] = [
  { id: "iron-ore",     name: "Minerai de fer",     glyph: "🪨", rarity: "common" },
  { id: "leather",      name: "Cuir",                glyph: "🟫", rarity: "common" },
  { id: "thread",       name: "Fil",                 glyph: "🧵", rarity: "common" },
  { id: "wheat",        name: "Blé",                 glyph: "🌾", rarity: "common" },
  { id: "silver-ore",   name: "Minerai d'argent",    glyph: "🥈", rarity: "rare" },
  { id: "fine-leather", name: "Cuir fin",            glyph: "🦬", rarity: "rare" },
  { id: "silk",         name: "Soie",                glyph: "✨", rarity: "rare" },
  { id: "gem-rough",    name: "Gemme brute",         glyph: "💎", rarity: "rare" },
  { id: "mithril-ore",  name: "Minerai de mithril",  glyph: "🌀", rarity: "epic" },
  { id: "dragon-hide",  name: "Cuir de dragon",      glyph: "🐉", rarity: "epic" },
  { id: "moon-silk",    name: "Soie lunaire",        glyph: "🌙", rarity: "epic" },
  { id: "ruby",         name: "Rubis",               glyph: "❤️", rarity: "epic" },
  { id: "ether-ore",    name: "Éther solidifié",     glyph: "💠", rarity: "legendary" },
  { id: "phoenix-hide", name: "Plumes de phénix",    glyph: "🔥", rarity: "legendary" },
  { id: "void-silk",    name: "Soie du néant",       glyph: "🌌", rarity: "legendary" },
  { id: "diamond",      name: "Diamant",             glyph: "💎", rarity: "legendary" },
  { id: "prism-shard",  name: "Éclat prismatique",   glyph: "🔮", rarity: "prismatic" },
];

export const ETERNUM_RESOURCES_BY_ID: Map<string, EternumResource> = new Map(
  ETERNUM_RESOURCES.map((r) => [r.id, r]),
);

/** Recette de craft pour un item donné — déterminée par son slot/rareté/job. */
export function craftCostFor(item: ItemTemplate): { resourceId: string; count: number }[] {
  const baseRes: Record<EternumJobId, string[]> = {
    blacksmith: ["iron-ore"],
    tanner: ["leather"],
    weaver: ["thread"],
    jeweler: ["gem-rough", "iron-ore"],
    armorer: ["iron-ore"],
    baker: ["wheat"],
  };
  if (!item.craftedBy) return [];
  const tierBoost: Record<EternumRarity, number> = {
    common: 5, rare: 12, epic: 25, legendary: 50, prismatic: 100,
  };
  const baseList = baseRes[item.craftedBy];
  const cost = baseList.map((r) => ({
    resourceId: r,
    count: tierBoost[item.rarity],
  }));
  // Raretés sup ont besoin d'un upgrade material aussi.
  if (item.rarity === "rare") cost.push({ resourceId: "silver-ore", count: 5 });
  if (item.rarity === "epic") cost.push({ resourceId: "mithril-ore", count: 3 });
  if (item.rarity === "legendary") cost.push({ resourceId: "ether-ore", count: 2 });
  if (item.rarity === "prismatic") cost.push({ resourceId: "prism-shard", count: 1 });
  return cost;
}
