// Catalogue des quêtes Eternum.

export type QuestConfig = {
  id: string;
  name: string;
  description: string;
  category: "daily" | "weekly" | "main";
  required: number;
  osReward: number;
  xpReward: number;
};

// Daily : nerf −50% OS pour rester cohérent avec l'économie rare.
export const ETERNUM_DAILY_QUESTS: QuestConfig[] = [
  { id: "daily-idle", name: "Récolter en idle", description: "Récolte 3× tes gains AFK aujourd'hui.", category: "daily", required: 3, osReward: 250, xpReward: 100 },
  { id: "daily-dungeon", name: "Compléter 1 donjon", description: "Termine 1 donjon n'importe lequel.", category: "daily", required: 1, osReward: 400, xpReward: 200 },
  { id: "daily-wb", name: "Frapper le Bot Suprême", description: "Utilise au moins 1 attaque sur le World Boss.", category: "daily", required: 1, osReward: 300, xpReward: 150 },
];

// Weekly : nerf −40% OS.
export const ETERNUM_WEEKLY_QUESTS: QuestConfig[] = [
  { id: "weekly-pvp", name: "5 victoires PvP", description: "Gagne 5 matches PvP cette semaine.", category: "weekly", required: 5, osReward: 3000, xpReward: 1500 },
  { id: "weekly-tower", name: "Tour étage 20", description: "Atteins l'étage 20 de la Tour Infinie.", category: "weekly", required: 20, osReward: 1800, xpReward: 1000 },
  { id: "weekly-craft", name: "Crafte 10 items", description: "Crafte 10 items de n'importe quelle rareté.", category: "weekly", required: 10, osReward: 2400, xpReward: 1200 },
];

export const ETERNUM_MAIN_QUESTS: QuestConfig[] = [
  { id: "main-1-create-hero", name: "Créer ton héros", description: "Crée ton héros (classe + élément).", category: "main", required: 1, osReward: 1000, xpReward: 100 },
  { id: "main-2-first-familier", name: "Premier familier", description: "Invoque ton premier familier.", category: "main", required: 1, osReward: 1500, xpReward: 200 },
  { id: "main-3-team", name: "Équipe complète", description: "Constitue une équipe de 5 familiers.", category: "main", required: 5, osReward: 3000, xpReward: 500 },
  { id: "main-4-job", name: "Choisir un métier", description: "Sélectionne un métier de craft.", category: "main", required: 1, osReward: 2000, xpReward: 300 },
  { id: "main-5-first-craft", name: "Premier craft", description: "Crafte ton premier item.", category: "main", required: 1, osReward: 2500, xpReward: 400 },
  { id: "main-6-first-dungeon", name: "Premier donjon", description: "Termine la Cave aux rats.", category: "main", required: 1, osReward: 3000, xpReward: 500 },
  { id: "main-7-evolution", name: "Évolution familier", description: "Évolue 1 familier d'un cran (+1 étoile).", category: "main", required: 1, osReward: 5000, xpReward: 800 },
  { id: "main-8-prestige", name: "Premier Prestige", description: "Effectue ton premier Prestige.", category: "main", required: 1, osReward: 10000, xpReward: 0 },
];

export const ALL_QUESTS = [
  ...ETERNUM_MAIN_QUESTS,
  ...ETERNUM_DAILY_QUESTS,
  ...ETERNUM_WEEKLY_QUESTS,
];

export const ETERNUM_PASS_TIERS = 30;
export const ETERNUM_PASS_XP_PER_TIER = 1000;

export type PassReward = {
  tier: number;
  free?: { os?: number; resource?: { id: string; count: number } };
  premium?: { os?: number; resource?: { id: string; count: number } };
};

export const ETERNUM_PASS_REWARDS: PassReward[] = Array.from(
  { length: ETERNUM_PASS_TIERS },
  (_, i) => {
    const tier = i + 1;
    return {
      tier,
      free: { os: 200 + tier * 50 },
      premium: {
        os: 500 + tier * 100,
        resource: tier % 5 === 0 ? { id: "ruby", count: 1 } : undefined,
      },
    };
  },
);
