// Catalogue des contenus de combat Eternum :
// - Donjons (5)
// - World Boss (1 — Bot Suprême)
// - Raids (3)
// - PvP (matchmaking ELO)
// - Tour Infinie (endless)
// - Mode Rêve (drop shards)
// - Défis hebdo (4)

import type { EternumClassId, EternumElementId } from "./types";

export type DungeonConfig = {
  id: string;
  name: string;
  glyph: string;
  description: string;
  recommendedLevel: number;
  energyCost: number;
  // Stats des ennemis (mob1, mob2, mob3, boss).
  enemies: {
    name: string;
    classId: EternumClassId;
    element: EternumElementId;
    level: number;
    hp: number;
    atk: number;
    def: number;
    spd: number;
    isBoss?: boolean;
  }[];
  rewards: {
    osMin: number;
    osMax: number;
    xpMin: number;
    xpMax: number;
    resources: { id: string; chance: number; min: number; max: number }[];
  };
};

export const ETERNUM_DUNGEONS: DungeonConfig[] = [
  {
    id: "rat-cellar",
    name: "Cave aux rats",
    glyph: "🐀",
    description: "Donjon d'entraînement. Rats faibles, idéal niveau 1-10.",
    recommendedLevel: 1,
    energyCost: 10,
    enemies: [
      { name: "Rat", classId: "warrior", element: "earth", level: 2, hp: 80,  atk: 12, def: 4, spd: 8 },
      { name: "Rat", classId: "warrior", element: "earth", level: 3, hp: 90,  atk: 14, def: 5, spd: 9 },
      { name: "Roi-Rat", classId: "warrior", element: "earth", level: 5, hp: 200, atk: 22, def: 12, spd: 10, isBoss: true },
    ],
    rewards: { osMin: 100, osMax: 200, xpMin: 30, xpMax: 60, resources: [
      { id: "iron-ore", chance: 0.6, min: 1, max: 3 },
      { id: "leather", chance: 0.5, min: 1, max: 2 },
      { id: "wheat", chance: 0.4, min: 1, max: 2 },
    ]},
  },
  {
    id: "goblin-camp",
    name: "Camp gobelin",
    glyph: "👺",
    description: "Donjon niveau intermédiaire (10-25). Bonnes ressources rares.",
    recommendedLevel: 10,
    energyCost: 15,
    enemies: [
      { name: "Gobelin", classId: "assassin", element: "wind", level: 12, hp: 130, atk: 22, def: 8, spd: 18 },
      { name: "Gobelin shaman", classId: "mage", element: "fire", level: 14, hp: 110, atk: 28, def: 6, spd: 14 },
      { name: "Gobelin lourd", classId: "warrior", element: "earth", level: 15, hp: 220, atk: 24, def: 18, spd: 10 },
      { name: "Roi gobelin", classId: "paladin", element: "fire", level: 18, hp: 380, atk: 32, def: 22, spd: 14, isBoss: true },
    ],
    rewards: { osMin: 400, osMax: 700, xpMin: 100, xpMax: 200, resources: [
      { id: "iron-ore", chance: 0.7, min: 2, max: 5 },
      { id: "silver-ore", chance: 0.4, min: 1, max: 2 },
      { id: "fine-leather", chance: 0.3, min: 1, max: 2 },
      { id: "thread", chance: 0.5, min: 2, max: 4 },
    ]},
  },
  {
    id: "frost-cavern",
    name: "Caverne gelée",
    glyph: "❄️",
    description: "Niveau 25-45. Drops fréquents de gemmes.",
    recommendedLevel: 25,
    energyCost: 20,
    enemies: [
      { name: "Loup glacé", classId: "assassin", element: "water", level: 26, hp: 220, atk: 36, def: 14, spd: 22 },
      { name: "Yéti mineur", classId: "warrior", element: "water", level: 28, hp: 380, atk: 42, def: 22, spd: 12 },
      { name: "Yéti majeur", classId: "warrior", element: "water", level: 32, hp: 520, atk: 50, def: 28, spd: 14 },
      { name: "Reine glace", classId: "mage", element: "water", level: 38, hp: 700, atk: 65, def: 30, spd: 18, isBoss: true },
    ],
    rewards: { osMin: 1200, osMax: 2000, xpMin: 300, xpMax: 500, resources: [
      { id: "silver-ore", chance: 0.7, min: 2, max: 5 },
      { id: "gem-rough", chance: 0.6, min: 1, max: 3 },
      { id: "mithril-ore", chance: 0.3, min: 1, max: 2 },
      { id: "silk", chance: 0.4, min: 2, max: 4 },
    ]},
  },
  {
    id: "lava-pit",
    name: "Fosse de lave",
    glyph: "🌋",
    description: "Niveau 45-70. Drops de cuir de dragon + ruby.",
    recommendedLevel: 45,
    energyCost: 25,
    enemies: [
      { name: "Salamandre", classId: "mage", element: "fire", level: 48, hp: 450, atk: 70, def: 20, spd: 24 },
      { name: "Démon mineur", classId: "vampire", element: "fire", level: 52, hp: 600, atk: 80, def: 28, spd: 22 },
      { name: "Drake juvénile", classId: "warrior", element: "fire", level: 58, hp: 900, atk: 95, def: 40, spd: 18 },
      { name: "Seigneur de feu", classId: "vampire", element: "fire", level: 65, hp: 1400, atk: 120, def: 48, spd: 22, isBoss: true },
    ],
    rewards: { osMin: 3000, osMax: 5000, xpMin: 700, xpMax: 1100, resources: [
      { id: "mithril-ore", chance: 0.7, min: 2, max: 4 },
      { id: "dragon-hide", chance: 0.6, min: 1, max: 3 },
      { id: "ruby", chance: 0.5, min: 1, max: 2 },
      { id: "moon-silk", chance: 0.4, min: 1, max: 3 },
    ]},
  },
  {
    id: "void-temple",
    name: "Temple du Néant",
    glyph: "🌌",
    description: "Niveau 70+. Drops d'éther et plumes de phénix.",
    recommendedLevel: 70,
    energyCost: 30,
    enemies: [
      { name: "Sentinelle néant", classId: "paladin", element: "dark", level: 72, hp: 1000, atk: 120, def: 60, spd: 22 },
      { name: "Liche", classId: "vampire", element: "dark", level: 78, hp: 1300, atk: 150, def: 55, spd: 24 },
      { name: "Avatar lumière", classId: "priest", element: "light", level: 82, hp: 1500, atk: 140, def: 65, spd: 26 },
      { name: "Avatar du Néant", classId: "mage", element: "dark", level: 90, hp: 2500, atk: 200, def: 80, spd: 28, isBoss: true },
    ],
    rewards: { osMin: 8000, osMax: 12000, xpMin: 2000, xpMax: 3500, resources: [
      { id: "ether-ore", chance: 0.7, min: 2, max: 4 },
      { id: "phoenix-hide", chance: 0.5, min: 1, max: 2 },
      { id: "void-silk", chance: 0.5, min: 1, max: 2 },
      { id: "diamond", chance: 0.4, min: 1, max: 2 },
      { id: "prism-shard", chance: 0.05, min: 1, max: 1 },
    ]},
  },
];

// World Boss — Bot Suprême quotidien (un seul boss, scale par jour).
export type WorldBossConfig = {
  name: string;
  glyph: string;
  // Stats énormes — l'objectif est de faire un max de dmg, pas de le tuer.
  hp: number;
  atk: number;
  def: number;
  spd: number;
  element: EternumElementId;
};

export const ETERNUM_WORLD_BOSS: WorldBossConfig = {
  name: "Bot Suprême",
  glyph: "🤖",
  hp: 999_999_999, // pratiquement infini
  atk: 250,
  def: 100,
  spd: 25,
  element: "dark",
};

// Raids — boss multi (héros only). 3 raids initiaux.
export type RaidConfig = {
  id: string;
  name: string;
  glyph: string;
  bossName: string;
  bossElement: EternumElementId;
  bossHp: number;
  bossAtk: number;
  bossDef: number;
  bossSpd: number;
  energyCost: number;
  recommendedLevel: number;
  rewardOs: number;
  rewardXp: number;
};

export const ETERNUM_RAIDS: RaidConfig[] = [
  {
    id: "kraken",
    name: "Le Kraken",
    glyph: "🐙",
    bossName: "Kraken Abyssal",
    bossElement: "water",
    bossHp: 50_000,
    bossAtk: 180,
    bossDef: 70,
    bossSpd: 18,
    energyCost: 50,
    recommendedLevel: 30,
    rewardOs: 5_000,
    rewardXp: 1500,
  },
  {
    id: "dragon-rouge",
    name: "Dragon Rouge",
    glyph: "🐉",
    bossName: "Ignéus le Brûlant",
    bossElement: "fire",
    bossHp: 120_000,
    bossAtk: 280,
    bossDef: 100,
    bossSpd: 24,
    energyCost: 50,
    recommendedLevel: 55,
    rewardOs: 15_000,
    rewardXp: 4000,
  },
  {
    id: "titan-stone",
    name: "Titan de pierre",
    glyph: "🗿",
    bossName: "Pétragon",
    bossElement: "earth",
    bossHp: 250_000,
    bossAtk: 350,
    bossDef: 200,
    bossSpd: 14,
    energyCost: 50,
    recommendedLevel: 80,
    rewardOs: 35_000,
    rewardXp: 9000,
  },
];

// Mode Rêve — donjon hardcore qui drop des shards.
export type DreamConfig = {
  id: string;
  name: string;
  glyph: string;
  description: string;
  recommendedLevel: number;
  energyCost: number;
  shardsByRarity: Record<string, number>; // chance de drop par rareté
};

export const ETERNUM_DREAMS: DreamConfig[] = [
  {
    id: "dream-1",
    name: "Songe initial",
    glyph: "🌙",
    description: "Drop de shards commun + rare (chance faible).",
    recommendedLevel: 20,
    energyCost: 30,
    shardsByRarity: { common: 0.8, rare: 0.3, epic: 0.05 },
  },
  {
    id: "dream-2",
    name: "Cauchemar",
    glyph: "🌑",
    description: "Drop de shards rare + épique (chance modérée).",
    recommendedLevel: 50,
    energyCost: 40,
    shardsByRarity: { rare: 0.7, epic: 0.4, legendary: 0.1 },
  },
  {
    id: "dream-3",
    name: "Abîme onirique",
    glyph: "🪐",
    description: "Drop d'éclats prismatiques rares.",
    recommendedLevel: 80,
    energyCost: 60,
    shardsByRarity: { epic: 0.6, legendary: 0.4, prismatic: 0.05 },
  },
];

// Défis hebdo — restrictions imposées + reward grosse.
export type ChallengeConfig = {
  id: string;
  name: string;
  glyph: string;
  description: string;
  rule: string;
  rewardOs: number;
  rewardResources: { id: string; count: number }[];
};

export const ETERNUM_WEEKLY_CHALLENGES: ChallengeConfig[] = [
  {
    id: "no-heal",
    name: "Sans soin",
    glyph: "🩹",
    description: "Bat le boss sans aucun soin (ni Vampire, ni Paladin).",
    rule: "Aucun heal autorisé.",
    rewardOs: 5_000,
    rewardResources: [{ id: "ruby", count: 3 }],
  },
  {
    id: "solo-element",
    name: "Élément unique",
    glyph: "🎯",
    description: "Compose une équipe d'un seul élément.",
    rule: "Tous tes familiers doivent partager le même élément.",
    rewardOs: 8_000,
    rewardResources: [{ id: "moon-silk", count: 5 }],
  },
  {
    id: "no-ult",
    name: "Sans ultime",
    glyph: "🚫",
    description: "Pas d'ultime autorisé.",
    rule: "Désactive les ultimes pour ce combat.",
    rewardOs: 6_000,
    rewardResources: [{ id: "mithril-ore", count: 4 }],
  },
  {
    id: "speed-run",
    name: "Speed run",
    glyph: "⚡",
    description: "Bat le boss en moins de 8 tours.",
    rule: "Combat capé à 8 tours — sinon défaite.",
    rewardOs: 7_000,
    rewardResources: [{ id: "ether-ore", count: 2 }],
  },
];
