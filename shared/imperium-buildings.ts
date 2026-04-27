// Imperium — labels, icônes et metadata des bâtiments (côté client).
// Les coûts/temps/courbes vivent dans supabase/imperium.sql (autorité serveur).

export type ImperiumBuildingKind =
  | "town_hall"
  | "barracks"
  | "stable"
  | "workshop"
  | "academy"
  | "forge"
  | "market"
  | "embassy"
  | "wall"
  | "warehouse"
  | "granary"
  | "hideout"
  | "wonder"
  | "wood_field"
  | "clay_field"
  | "iron_field"
  | "wheat_field";

export const IMPERIUM_CENTER_BUILDINGS: ImperiumBuildingKind[] = [
  "town_hall",
  "barracks",
  "stable",
  "workshop",
  "academy",
  "forge",
  "market",
  "embassy",
  "wall",
  "warehouse",
  "granary",
  "hideout",
];

export const IMPERIUM_FIELD_BUILDINGS: ImperiumBuildingKind[] = [
  "wood_field",
  "clay_field",
  "iron_field",
  "wheat_field",
];

export const IMPERIUM_BUILDINGS: Record<
  ImperiumBuildingKind,
  {
    id: ImperiumBuildingKind;
    name: string;
    glyph: string;
    description: string;
    isCenter: boolean;
    isField: boolean;
    capStrategy: "town_hall" | "fixed_20" | "fixed_100";
    stackable?: number; // pour entrepôt/grenier
  }
> = {
  town_hall: {
    id: "town_hall",
    name: "Hôtel de ville",
    glyph: "🏛️",
    description: "Cap les autres bâtiments. Niveau 15 = condition 2ème village.",
    isCenter: true,
    isField: false,
    capStrategy: "town_hall",
  },
  barracks: {
    id: "barracks",
    name: "Caserne",
    glyph: "⚔️",
    description: "Recrute l'infanterie. Vitesse +5%/niveau.",
    isCenter: true,
    isField: false,
    capStrategy: "town_hall",
  },
  stable: {
    id: "stable",
    name: "Écurie",
    glyph: "🐎",
    description: "Recrute la cavalerie. Prérequis caserne 5.",
    isCenter: true,
    isField: false,
    capStrategy: "town_hall",
  },
  workshop: {
    id: "workshop",
    name: "Atelier",
    glyph: "🔨",
    description: "Construit les sièges. Prérequis caserne 10 + académie 10.",
    isCenter: true,
    isField: false,
    capStrategy: "town_hall",
  },
  academy: {
    id: "academy",
    name: "Académie",
    glyph: "📜",
    description: "Recherche les unités avancées avant recrutement.",
    isCenter: true,
    isField: false,
    capStrategy: "town_hall",
  },
  forge: {
    id: "forge",
    name: "Forge",
    glyph: "⚒️",
    description: "Améliore attaque/défense des unités (max +20% par axe).",
    isCenter: true,
    isField: false,
    capStrategy: "town_hall",
  },
  market: {
    id: "market",
    name: "Marché",
    glyph: "💰",
    description: "Échanges entre joueurs (taux libres).",
    isCenter: true,
    isField: false,
    capStrategy: "town_hall",
  },
  embassy: {
    id: "embassy",
    name: "Ambassade",
    glyph: "🤝",
    description: "Niveau 1 = rejoindre alliance, niveau 3 = créer.",
    isCenter: true,
    isField: false,
    capStrategy: "town_hall",
  },
  wall: {
    id: "wall",
    name: "Murailles",
    glyph: "🏰",
    description: "Bonus défense passif (skin selon faction).",
    isCenter: true,
    isField: false,
    capStrategy: "fixed_20",
  },
  warehouse: {
    id: "warehouse",
    name: "Entrepôt",
    glyph: "📦",
    description: "Cap stockage bois/argile/fer. Empilable ×3.",
    isCenter: true,
    isField: false,
    capStrategy: "fixed_20",
    stackable: 3,
  },
  granary: {
    id: "granary",
    name: "Grenier",
    glyph: "🥖",
    description: "Cap stockage blé. Empilable ×3.",
    isCenter: true,
    isField: false,
    capStrategy: "fixed_20",
    stackable: 3,
  },
  hideout: {
    id: "hideout",
    name: "Caché",
    glyph: "🕳️",
    description: "Stocke des ressources protégées du loot.",
    isCenter: true,
    isField: false,
    capStrategy: "fixed_20",
  },
  wonder: {
    id: "wonder",
    name: "Merveille",
    glyph: "✨",
    description: "Bâtiment endgame. Niveau 100 = victoire (cosmétique).",
    isCenter: true,
    isField: false,
    capStrategy: "fixed_100",
  },
  wood_field: {
    id: "wood_field",
    name: "Bûcheron",
    glyph: "🪓",
    description: "Produit du bois.",
    isCenter: false,
    isField: true,
    capStrategy: "fixed_20",
  },
  clay_field: {
    id: "clay_field",
    name: "Glaisière",
    glyph: "⛏️",
    description: "Produit de l'argile.",
    isCenter: false,
    isField: true,
    capStrategy: "fixed_20",
  },
  iron_field: {
    id: "iron_field",
    name: "Mine",
    glyph: "⚒️",
    description: "Produit du fer.",
    isCenter: false,
    isField: true,
    capStrategy: "fixed_20",
  },
  wheat_field: {
    id: "wheat_field",
    name: "Ferme",
    glyph: "🌾",
    description: "Produit du blé. Nourrit les troupes.",
    isCenter: false,
    isField: true,
    capStrategy: "fixed_20",
  },
};

// Slots fixes des champs (négatifs, hors centre 4×4).
export const FIELD_SLOTS: Record<-1 | -2 | -3 | -4, ImperiumBuildingKind> = {
  [-1]: "wood_field",
  [-2]: "clay_field",
  [-3]: "iron_field",
  [-4]: "wheat_field",
};
