// Catalogue d'achievements cross-jeux du Site Ultime.
// Chaque achievement a une condition trackée via RPC `achievement_progress`.
// Récompense en Or Suprême globale + notification automatique.

export type AchievementCategory =
  | "global"
  | "casino"
  | "eternum"
  | "imperium"
  | "skyline";

export type Achievement = {
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  glyph: string;
  required: number;
  osReward: number;
};

export const ACHIEVEMENTS: Achievement[] = [
  // ─── Global ─────────────────────────────────────────────────────────
  {
    id: "global.first-login",
    category: "global",
    name: "Bienvenue !",
    description: "Première connexion sur le Site Ultime.",
    glyph: "👋",
    required: 1,
    osReward: 100,
  },
  {
    id: "global.gold-1k",
    category: "global",
    name: "Premier mille",
    description: "Atteindre 1 000 OS cumulés.",
    glyph: "💰",
    required: 1000,
    osReward: 200,
  },
  {
    id: "global.gold-100k",
    category: "global",
    name: "Riche",
    description: "Atteindre 100 000 OS cumulés.",
    glyph: "💎",
    required: 100_000,
    osReward: 5_000,
  },
  {
    id: "global.gold-1m",
    category: "global",
    name: "Magnat",
    description: "Atteindre 1 000 000 OS cumulés.",
    glyph: "🏦",
    required: 1_000_000,
    osReward: 50_000,
  },
  {
    id: "global.all-games",
    category: "global",
    name: "Tour de l'arène",
    description: "Jouer au moins 1 partie dans 4 jeux différents.",
    glyph: "🎲",
    required: 4,
    osReward: 1_000,
  },

  // ─── Casino ─────────────────────────────────────────────────────────
  {
    id: "casino.first-win",
    category: "casino",
    name: "Chanceux",
    description: "Première victoire au casino.",
    glyph: "🍀",
    required: 1,
    osReward: 100,
  },
  {
    id: "casino.blackjack-21",
    category: "casino",
    name: "Vingt-et-un",
    description: "Faire un blackjack naturel.",
    glyph: "🃏",
    required: 1,
    osReward: 250,
  },
  {
    id: "casino.slots-jackpot",
    category: "casino",
    name: "Jackpot !",
    description: "Décrocher un jackpot aux slots.",
    glyph: "🎰",
    required: 1,
    osReward: 1_000,
  },
  {
    id: "casino.roulette-100",
    category: "casino",
    name: "Habitué de la roulette",
    description: "Jouer 100 mises à la roulette.",
    glyph: "🎡",
    required: 100,
    osReward: 500,
  },

  // ─── Eternum (RPG) ──────────────────────────────────────────────────
  {
    id: "eternum.hero-created",
    category: "eternum",
    name: "Apprenti",
    description: "Créer ton premier héros Eternum.",
    glyph: "🗡️",
    required: 1,
    osReward: 100,
  },
  {
    id: "eternum.level-50",
    category: "eternum",
    name: "Vétéran",
    description: "Atteindre niveau 50 dans Eternum.",
    glyph: "⚔️",
    required: 50,
    osReward: 1_000,
  },
  {
    id: "eternum.level-100",
    category: "eternum",
    name: "Légende",
    description: "Atteindre niveau 100 dans Eternum.",
    glyph: "🌟",
    required: 100,
    osReward: 5_000,
  },
  {
    id: "eternum.first-prestige",
    category: "eternum",
    name: "Prestige initial",
    description: "Faire ton premier prestige.",
    glyph: "✨",
    required: 1,
    osReward: 10_000,
  },
  {
    id: "eternum.familiers-10",
    category: "eternum",
    name: "Apprivoiseur",
    description: "Posséder 10 familiers différents.",
    glyph: "🐾",
    required: 10,
    osReward: 500,
  },
  {
    id: "eternum.familiers-50",
    category: "eternum",
    name: "Domesticateur",
    description: "Posséder 50 familiers différents.",
    glyph: "🦁",
    required: 50,
    osReward: 5_000,
  },
  {
    id: "eternum.legendary-familier",
    category: "eternum",
    name: "Invocateur d'élite",
    description: "Invoquer un familier légendaire.",
    glyph: "🌠",
    required: 1,
    osReward: 2_000,
  },
  {
    id: "eternum.prismatic-familier",
    category: "eternum",
    name: "Prismatique !",
    description: "Obtenir un familier prismatique.",
    glyph: "💠",
    required: 1,
    osReward: 25_000,
  },
  {
    id: "eternum.dungeons-10",
    category: "eternum",
    name: "Explorateur",
    description: "Compléter 10 donjons.",
    glyph: "🏰",
    required: 10,
    osReward: 1_000,
  },
  {
    id: "eternum.world-boss",
    category: "eternum",
    name: "Tueur de Boss",
    description: "Vaincre 1 boss du monde.",
    glyph: "🐉",
    required: 1,
    osReward: 2_000,
  },
  {
    id: "eternum.pvp-wins-10",
    category: "eternum",
    name: "Combattant",
    description: "Gagner 10 combats PvP.",
    glyph: "🗡️",
    required: 10,
    osReward: 1_000,
  },
  {
    id: "eternum.tower-floor-50",
    category: "eternum",
    name: "Grimpeur",
    description: "Atteindre l'étage 50 de la Tour.",
    glyph: "🗼",
    required: 50,
    osReward: 3_000,
  },

  // ─── Imperium (gestion) ─────────────────────────────────────────────
  {
    id: "imperium.first-village",
    category: "imperium",
    name: "Fondateur",
    description: "Fonder ton premier village.",
    glyph: "🏘️",
    required: 1,
    osReward: 200,
  },
  {
    id: "imperium.population-100",
    category: "imperium",
    name: "Hameau prospère",
    description: "Atteindre 100 habitants.",
    glyph: "👥",
    required: 100,
    osReward: 500,
  },
  {
    id: "imperium.alliance",
    category: "imperium",
    name: "Allié",
    description: "Rejoindre ou créer une alliance.",
    glyph: "🤝",
    required: 1,
    osReward: 500,
  },
  {
    id: "imperium.merveille",
    category: "imperium",
    name: "Bâtisseur",
    description: "Contribuer à une merveille.",
    glyph: "🗿",
    required: 1,
    osReward: 5_000,
  },

  // ─── Skyline (build) ────────────────────────────────────────────────
  {
    id: "skyline.first-build",
    category: "skyline",
    name: "Premier étage",
    description: "Construire ton premier bâtiment.",
    glyph: "🏗️",
    required: 1,
    osReward: 100,
  },
  {
    id: "skyline.skyscraper",
    category: "skyline",
    name: "Gratte-ciel",
    description: "Construire un bâtiment de 50+ étages.",
    glyph: "🏢",
    required: 50,
    osReward: 2_000,
  },
];

export const ACHIEVEMENTS_BY_ID: Map<string, Achievement> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

export const ACHIEVEMENTS_BY_CATEGORY: Record<
  AchievementCategory,
  Achievement[]
> = {
  global: ACHIEVEMENTS.filter((a) => a.category === "global"),
  casino: ACHIEVEMENTS.filter((a) => a.category === "casino"),
  eternum: ACHIEVEMENTS.filter((a) => a.category === "eternum"),
  imperium: ACHIEVEMENTS.filter((a) => a.category === "imperium"),
  skyline: ACHIEVEMENTS.filter((a) => a.category === "skyline"),
};

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  global: "🌐 Global",
  casino: "🎰 Casino",
  eternum: "⚔️ Eternum",
  imperium: "🏰 Imperium",
  skyline: "🏙️ Skyline",
};
