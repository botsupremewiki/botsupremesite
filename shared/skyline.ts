// Skyline — types et constants core partagés client/server.
// Les chiffres précis (prix de référence, taxes, prêts) vivent côté SQL pour anti-triche.
// Ce fichier expose : types DB rows, constants visuels, formules duplicate côté client pour UX.

// ──────────────────────────────────────────────────────────────────────────
// 1. ENUMS DE BASE
// ──────────────────────────────────────────────────────────────────────────

export type SkylineDistrict =
  | "centre"
  | "affaires"
  | "residentiel"
  | "peripherie"
  | "populaire";

export type SkylineLocalSize = "xs" | "s" | "m" | "l" | "xl";

export type SkylineCategory = "commerce" | "factory" | "raw" | "service";

// Les 6 profils démographiques.
export type SkylineDemographic =
  | "students"
  | "workers"
  | "families"
  | "wealthy"
  | "retirees"
  | "tourists";

// ──────────────────────────────────────────────────────────────────────────
// 2. CONSTANTS VISUELS
// ──────────────────────────────────────────────────────────────────────────

export const SKYLINE_BRAND = {
  name: "Skyline",
  glyph: "🏙️",
  short: "Tycoon multijoueur",
  accent: "text-pink-200",
  border: "border-pink-400/50",
  gradient:
    "bg-[radial-gradient(ellipse_at_center,rgba(236,72,153,0.10),transparent_70%)]",
};

export const SKYLINE_DISTRICTS: Record<
  SkylineDistrict,
  {
    id: SkylineDistrict;
    name: string;
    glyph: string;
    rentPerSqm: number; // $/m²/mois
    accent: string;
    border: string;
    description: string;
  }
> = {
  centre: {
    id: "centre",
    name: "Centre-ville",
    glyph: "🏙️",
    rentPerSqm: 50,
    accent: "text-amber-200",
    border: "border-amber-400/40",
    description: "Touristes + hauts revenus + salariés. Très cher mais flux énorme.",
  },
  affaires: {
    id: "affaires",
    name: "Quartier d'affaires",
    glyph: "🌆",
    rentPerSqm: 40,
    accent: "text-sky-200",
    border: "border-sky-400/40",
    description: "Salariés actifs + hauts revenus. Pause déj + after-work.",
  },
  residentiel: {
    id: "residentiel",
    name: "Quartier résidentiel",
    glyph: "🏘️",
    rentPerSqm: 25,
    accent: "text-emerald-200",
    border: "border-emerald-400/40",
    description: "Familles + retraités. Stable, achats récurrents.",
  },
  peripherie: {
    id: "peripherie",
    name: "Périphérie",
    glyph: "🌳",
    rentPerSqm: 10,
    accent: "text-lime-200",
    border: "border-lime-400/40",
    description: "Familles + retraités + étudiants. Loyer bas, flux moyen.",
  },
  populaire: {
    id: "populaire",
    name: "Quartier populaire",
    glyph: "🏚️",
    rentPerSqm: 8,
    accent: "text-zinc-200",
    border: "border-zinc-400/40",
    description: "Étudiants + familles + retraités. Petit budget mais volume.",
  },
};

export const SKYLINE_LOCAL_SIZES: Record<
  SkylineLocalSize,
  { id: SkylineLocalSize; name: string; sqm: number; gridW: number; gridH: number }
> = {
  xs: { id: "xs", name: "XS", sqm: 50, gridW: 10, gridH: 5 },
  s: { id: "s", name: "S", sqm: 80, gridW: 10, gridH: 8 },
  m: { id: "m", name: "M", sqm: 140, gridW: 14, gridH: 10 },
  l: { id: "l", name: "L", sqm: 250, gridW: 18, gridH: 14 },
  xl: { id: "xl", name: "XL", sqm: 480, gridW: 24, gridH: 20 },
};

export const SKYLINE_DEMOGRAPHICS: Record<
  SkylineDemographic,
  {
    id: SkylineDemographic;
    name: string;
    glyph: string;
    avgBasket: number; // facteur (1 = moyen)
    priceSensitivity: number; // 0-1 (1 = très sensible)
  }
> = {
  students: {
    id: "students",
    name: "Étudiants",
    glyph: "👶",
    avgBasket: 0.5,
    priceSensitivity: 0.9,
  },
  workers: {
    id: "workers",
    name: "Salariés",
    glyph: "👨‍💼",
    avgBasket: 1.0,
    priceSensitivity: 0.5,
  },
  families: {
    id: "families",
    name: "Familles",
    glyph: "👨‍👩‍👧",
    avgBasket: 1.6,
    priceSensitivity: 0.5,
  },
  wealthy: {
    id: "wealthy",
    name: "Hauts revenus",
    glyph: "💎",
    avgBasket: 3.0,
    priceSensitivity: 0.15,
  },
  retirees: {
    id: "retirees",
    name: "Retraités",
    glyph: "👴",
    avgBasket: 0.9,
    priceSensitivity: 0.7,
  },
  tourists: {
    id: "tourists",
    name: "Touristes",
    glyph: "🛒",
    avgBasket: 1.8,
    priceSensitivity: 0.2,
  },
};

// ──────────────────────────────────────────────────────────────────────────
// 3. SECTEURS — COMMERCES (P1)
// ──────────────────────────────────────────────────────────────────────────

export type SkylineCommerceSector =
  | "boulangerie"
  | "cave_alcool"
  | "boucherie"
  | "pizzeria"
  | "fast_food"
  | "cafe_bar"
  | "fleuriste"
  | "epicerie_fine"
  | "supplette" // Garde la typo de la spec interne (pas critique)
  | "boutique_vetements"
  | "joaillerie"
  | "pharmacie"
  | "parfumerie"
  | "magasin_meubles"
  | "magasin_electronique"
  | "bricolage"
  | "restaurant_gastro"
  | "concessionnaire_auto"
  | "station_service"
  | "hotel"
  | "animalerie";

export const SKYLINE_COMMERCE_SECTORS: Record<
  SkylineCommerceSector,
  {
    id: SkylineCommerceSector;
    name: string;
    glyph: string;
    description: string;
    minStartCash: number; // estimation capital total nécessaire
    targetDemographics: SkylineDemographic[]; // démographies prioritaires
  }
> = {
  fleuriste: {
    id: "fleuriste",
    name: "Fleuriste",
    glyph: "🌸",
    description: "Bouquets, plantes, déco. Stock frais (péremption).",
    minStartCash: 5000,
    targetDemographics: ["wealthy", "retirees", "tourists"],
  },
  boulangerie: {
    id: "boulangerie",
    name: "Boulangerie-pâtisserie",
    glyph: "🥖",
    description: "Pain, viennoiseries, pâtisseries, sandwichs.",
    minStartCash: 8000,
    targetDemographics: ["workers", "families", "retirees"],
  },
  cafe_bar: {
    id: "cafe_bar",
    name: "Café / Bar",
    glyph: "☕",
    description: "Café, bières, snacks. Mix vente + service.",
    minStartCash: 9000,
    targetDemographics: ["workers", "students", "tourists"],
  },
  pizzeria: {
    id: "pizzeria",
    name: "Pizzeria",
    glyph: "🍕",
    description: "Pizzas, entrées, desserts, boissons.",
    minStartCash: 10000,
    targetDemographics: ["families", "students", "workers"],
  },
  fast_food: {
    id: "fast_food",
    name: "Fast-food",
    glyph: "🍔",
    description: "Menus standardisés, gros volumes.",
    minStartCash: 12000,
    targetDemographics: ["students", "workers", "families"],
  },
  animalerie: {
    id: "animalerie",
    name: "Animalerie",
    glyph: "🐾",
    description: "Croquettes, accessoires, animaux vivants.",
    minStartCash: 10000,
    targetDemographics: ["families", "retirees"],
  },
  cave_alcool: {
    id: "cave_alcool",
    name: "Cave à alcool",
    glyph: "🍷",
    description: "Vin, bière, champagne, spiritueux.",
    minStartCash: 15000,
    targetDemographics: ["wealthy", "workers", "tourists"],
  },
  boucherie: {
    id: "boucherie",
    name: "Boucherie-charcuterie",
    glyph: "🥩",
    description: "Viandes, charcuteries, plats traiteur.",
    minStartCash: 15000,
    targetDemographics: ["families", "retirees", "workers"],
  },
  epicerie_fine: {
    id: "epicerie_fine",
    name: "Épicerie fine",
    glyph: "🛒",
    description: "Produits gourmet, conserves, chocolats.",
    minStartCash: 20000,
    targetDemographics: ["wealthy", "tourists", "workers"],
  },
  supplette: {
    id: "supplette",
    name: "Supérette",
    glyph: "🏪",
    description: "Tout-en-un alimentaire + base.",
    minStartCash: 25000,
    targetDemographics: ["families", "students", "workers"],
  },
  boutique_vetements: {
    id: "boutique_vetements",
    name: "Boutique vêtements",
    glyph: "👕",
    description: "Hauts, bas, robes, accessoires.",
    minStartCash: 25000,
    targetDemographics: ["wealthy", "students", "workers"],
  },
  pharmacie: {
    id: "pharmacie",
    name: "Pharmacie",
    glyph: "💊",
    description: "Médicaments, parapharma, hygiène. Diplôme requis.",
    minStartCash: 30000,
    targetDemographics: ["retirees", "families", "workers"],
  },
  parfumerie: {
    id: "parfumerie",
    name: "Parfumerie",
    glyph: "🧴",
    description: "Parfums, cosmétiques, soins.",
    minStartCash: 30000,
    targetDemographics: ["wealthy", "tourists", "workers"],
  },
  bricolage: {
    id: "bricolage",
    name: "Bricolage / Quincaillerie",
    glyph: "🎨",
    description: "Outils, matériaux, peintures, jardin.",
    minStartCash: 35000,
    targetDemographics: ["families", "workers"],
  },
  magasin_meubles: {
    id: "magasin_meubles",
    name: "Magasin de meubles",
    glyph: "🛋️",
    description: "Canapés, lits, tables, déco.",
    minStartCash: 40000,
    targetDemographics: ["families", "wealthy"],
  },
  magasin_electronique: {
    id: "magasin_electronique",
    name: "Magasin électronique",
    glyph: "📺",
    description: "TV, PC, smartphones, consoles.",
    minStartCash: 50000,
    targetDemographics: ["students", "workers", "wealthy"],
  },
  joaillerie: {
    id: "joaillerie",
    name: "Joaillerie",
    glyph: "💎",
    description: "Bagues, colliers, montres. Sécurité +++.",
    minStartCash: 50000,
    targetDemographics: ["wealthy", "tourists"],
  },
  restaurant_gastro: {
    id: "restaurant_gastro",
    name: "Restaurant gastro",
    glyph: "🍽️",
    description: "Service haut de gamme. Cuisine + cave.",
    minStartCash: 50000,
    targetDemographics: ["wealthy", "tourists", "workers"],
  },
  station_service: {
    id: "station_service",
    name: "Station-service",
    glyph: "⛽",
    description: "Carburant + petite épicerie.",
    minStartCash: 80000,
    targetDemographics: ["workers", "families", "tourists"],
  },
  hotel: {
    id: "hotel",
    name: "Hôtel",
    glyph: "🏨",
    description: "Nuitées + petit-déj + service.",
    minStartCash: 100000,
    targetDemographics: ["tourists", "wealthy", "workers"],
  },
  concessionnaire_auto: {
    id: "concessionnaire_auto",
    name: "Concessionnaire auto",
    glyph: "🚗",
    description: "Voitures neuves, occasion. Ticket élevé.",
    minStartCash: 200000,
    targetDemographics: ["wealthy", "families", "workers"],
  },
};

// ──────────────────────────────────────────────────────────────────────────
// 4. PRODUITS DE BASE (P1) — catalogue revendable au marché de gros PNJ
// ──────────────────────────────────────────────────────────────────────────

export type SkylineProductId = string; // ex: "baguette", "vin_rouge", "tshirt_basic"

// Mapping commerce → produits que ce commerce peut vendre.
// Pour P1, on commence avec quelques produits par commerce.
export const SKYLINE_COMMERCE_PRODUCTS: Record<SkylineCommerceSector, SkylineProductId[]> = {
  boulangerie: ["baguette", "croissant", "pain_au_chocolat", "tarte_pommes"],
  cave_alcool: ["vin_rouge", "vin_blanc", "biere_blonde", "champagne"],
  boucherie: ["steak", "saucisson", "jambon", "rotisserie_poulet"],
  pizzeria: ["pizza_margherita", "pizza_4_fromages", "tiramisu", "soda"],
  fast_food: ["burger_classique", "frites", "nuggets", "soda"],
  cafe_bar: ["cafe_expresso", "cappuccino", "biere_pression", "croissant"],
  fleuriste: ["bouquet_roses", "bouquet_mixte", "plante_verte", "orchidee"],
  epicerie_fine: ["chocolat_noir", "huile_olive", "miel", "confiture"],
  supplette: ["pates", "yaourt", "lait", "biscuits"],
  boutique_vetements: ["tshirt_basic", "jean", "pull", "robe"],
  joaillerie: ["bague_argent", "collier_or", "montre_classique", "bracelet"],
  pharmacie: ["paracetamol", "creme_hydratante", "vitamines", "shampoing"],
  parfumerie: ["parfum_femme", "parfum_homme", "creme_visage", "rouge_levres"],
  magasin_meubles: ["canape", "table_basse", "lit_double", "etagere"],
  magasin_electronique: ["smartphone", "tv_4k", "casque_audio", "tablette"],
  bricolage: ["perceuse", "peinture_blanche", "marteau", "vis_lot"],
  restaurant_gastro: ["menu_decouverte", "plat_jour", "cave_signature", "dessert_signature"],
  concessionnaire_auto: ["citadine", "berline", "suv", "sportive"],
  station_service: ["carburant_essence", "carburant_diesel", "snack", "boisson_chaude"],
  hotel: ["nuitee_simple", "nuitee_double", "petit_dejeuner", "spa"],
  animalerie: ["croquettes_chien", "croquettes_chat", "litiere", "jouet_animal"],
};

// Catalogue de produits avec prix de référence (en $).
// Le prix marché fluctue autour du prix de référence selon offre/demande.
export const SKYLINE_PRODUCTS: Record<
  SkylineProductId,
  { id: SkylineProductId; name: string; glyph: string; refBuyPrice: number; refSellPrice: number; perishDays: number }
> = {
  // Boulangerie
  baguette: { id: "baguette", name: "Baguette", glyph: "🥖", refBuyPrice: 0.4, refSellPrice: 1.2, perishDays: 1 },
  croissant: { id: "croissant", name: "Croissant", glyph: "🥐", refBuyPrice: 0.6, refSellPrice: 1.5, perishDays: 2 },
  pain_au_chocolat: { id: "pain_au_chocolat", name: "Pain au chocolat", glyph: "🥐", refBuyPrice: 0.7, refSellPrice: 1.7, perishDays: 2 },
  tarte_pommes: { id: "tarte_pommes", name: "Tarte aux pommes", glyph: "🥧", refBuyPrice: 4, refSellPrice: 12, perishDays: 3 },
  // Cave alcool
  vin_rouge: { id: "vin_rouge", name: "Vin rouge", glyph: "🍷", refBuyPrice: 5, refSellPrice: 14, perishDays: 365 },
  vin_blanc: { id: "vin_blanc", name: "Vin blanc", glyph: "🥂", refBuyPrice: 5, refSellPrice: 14, perishDays: 365 },
  biere_blonde: { id: "biere_blonde", name: "Bière blonde", glyph: "🍺", refBuyPrice: 1.2, refSellPrice: 3.5, perishDays: 180 },
  champagne: { id: "champagne", name: "Champagne", glyph: "🍾", refBuyPrice: 25, refSellPrice: 70, perishDays: 365 },
  // Boucherie
  steak: { id: "steak", name: "Steak", glyph: "🥩", refBuyPrice: 6, refSellPrice: 15, perishDays: 3 },
  saucisson: { id: "saucisson", name: "Saucisson", glyph: "🍖", refBuyPrice: 5, refSellPrice: 14, perishDays: 30 },
  jambon: { id: "jambon", name: "Jambon", glyph: "🍖", refBuyPrice: 8, refSellPrice: 20, perishDays: 14 },
  rotisserie_poulet: { id: "rotisserie_poulet", name: "Poulet rôti", glyph: "🍗", refBuyPrice: 6, refSellPrice: 14, perishDays: 1 },
  // Pizzeria
  pizza_margherita: { id: "pizza_margherita", name: "Pizza Margherita", glyph: "🍕", refBuyPrice: 3, refSellPrice: 10, perishDays: 1 },
  pizza_4_fromages: { id: "pizza_4_fromages", name: "Pizza 4 Fromages", glyph: "🍕", refBuyPrice: 4, refSellPrice: 13, perishDays: 1 },
  tiramisu: { id: "tiramisu", name: "Tiramisu", glyph: "🍰", refBuyPrice: 2, refSellPrice: 6, perishDays: 3 },
  // Fast-food
  burger_classique: { id: "burger_classique", name: "Burger classique", glyph: "🍔", refBuyPrice: 2, refSellPrice: 8, perishDays: 1 },
  frites: { id: "frites", name: "Frites", glyph: "🍟", refBuyPrice: 0.5, refSellPrice: 3, perishDays: 1 },
  nuggets: { id: "nuggets", name: "Nuggets x6", glyph: "🍗", refBuyPrice: 1.5, refSellPrice: 5, perishDays: 1 },
  // Café/bar
  cafe_expresso: { id: "cafe_expresso", name: "Expresso", glyph: "☕", refBuyPrice: 0.3, refSellPrice: 1.8, perishDays: 90 },
  cappuccino: { id: "cappuccino", name: "Cappuccino", glyph: "☕", refBuyPrice: 0.5, refSellPrice: 3.5, perishDays: 90 },
  biere_pression: { id: "biere_pression", name: "Bière pression 25cl", glyph: "🍺", refBuyPrice: 0.8, refSellPrice: 4.5, perishDays: 30 },
  soda: { id: "soda", name: "Soda canette", glyph: "🥤", refBuyPrice: 0.6, refSellPrice: 2.5, perishDays: 365 },
  // Fleuriste
  bouquet_roses: { id: "bouquet_roses", name: "Bouquet de roses", glyph: "🌹", refBuyPrice: 8, refSellPrice: 25, perishDays: 7 },
  bouquet_mixte: { id: "bouquet_mixte", name: "Bouquet mixte", glyph: "💐", refBuyPrice: 6, refSellPrice: 18, perishDays: 7 },
  plante_verte: { id: "plante_verte", name: "Plante verte", glyph: "🪴", refBuyPrice: 10, refSellPrice: 30, perishDays: 90 },
  orchidee: { id: "orchidee", name: "Orchidée", glyph: "🌺", refBuyPrice: 12, refSellPrice: 35, perishDays: 60 },
  // Épicerie fine
  chocolat_noir: { id: "chocolat_noir", name: "Chocolat noir 70%", glyph: "🍫", refBuyPrice: 3, refSellPrice: 9, perishDays: 365 },
  huile_olive: { id: "huile_olive", name: "Huile d'olive", glyph: "🫒", refBuyPrice: 6, refSellPrice: 18, perishDays: 730 },
  miel: { id: "miel", name: "Miel artisanal", glyph: "🍯", refBuyPrice: 5, refSellPrice: 15, perishDays: 730 },
  confiture: { id: "confiture", name: "Confiture", glyph: "🍓", refBuyPrice: 3, refSellPrice: 8, perishDays: 365 },
  // Supérette
  pates: { id: "pates", name: "Paquet de pâtes", glyph: "🍝", refBuyPrice: 0.8, refSellPrice: 2.5, perishDays: 730 },
  yaourt: { id: "yaourt", name: "Yaourt x4", glyph: "🍶", refBuyPrice: 1.5, refSellPrice: 4, perishDays: 14 },
  lait: { id: "lait", name: "Lait 1L", glyph: "🥛", refBuyPrice: 0.8, refSellPrice: 2.2, perishDays: 7 },
  biscuits: { id: "biscuits", name: "Biscuits", glyph: "🍪", refBuyPrice: 1.5, refSellPrice: 4, perishDays: 180 },
  // Vêtements
  tshirt_basic: { id: "tshirt_basic", name: "T-shirt basique", glyph: "👕", refBuyPrice: 5, refSellPrice: 18, perishDays: 9999 },
  jean: { id: "jean", name: "Jean", glyph: "👖", refBuyPrice: 20, refSellPrice: 60, perishDays: 9999 },
  pull: { id: "pull", name: "Pull", glyph: "🧥", refBuyPrice: 15, refSellPrice: 45, perishDays: 9999 },
  robe: { id: "robe", name: "Robe", glyph: "👗", refBuyPrice: 25, refSellPrice: 75, perishDays: 9999 },
  // Joaillerie
  bague_argent: { id: "bague_argent", name: "Bague argent", glyph: "💍", refBuyPrice: 80, refSellPrice: 240, perishDays: 9999 },
  collier_or: { id: "collier_or", name: "Collier or", glyph: "📿", refBuyPrice: 400, refSellPrice: 1200, perishDays: 9999 },
  montre_classique: { id: "montre_classique", name: "Montre classique", glyph: "⌚", refBuyPrice: 200, refSellPrice: 600, perishDays: 9999 },
  bracelet: { id: "bracelet", name: "Bracelet", glyph: "📿", refBuyPrice: 60, refSellPrice: 180, perishDays: 9999 },
  // Pharmacie
  paracetamol: { id: "paracetamol", name: "Paracétamol", glyph: "💊", refBuyPrice: 1, refSellPrice: 3.5, perishDays: 730 },
  creme_hydratante: { id: "creme_hydratante", name: "Crème hydratante", glyph: "🧴", refBuyPrice: 6, refSellPrice: 18, perishDays: 365 },
  vitamines: { id: "vitamines", name: "Vitamines", glyph: "💊", refBuyPrice: 8, refSellPrice: 22, perishDays: 730 },
  shampoing: { id: "shampoing", name: "Shampoing", glyph: "🧴", refBuyPrice: 3, refSellPrice: 9, perishDays: 730 },
  // Parfumerie
  parfum_femme: { id: "parfum_femme", name: "Parfum femme", glyph: "💄", refBuyPrice: 30, refSellPrice: 95, perishDays: 730 },
  parfum_homme: { id: "parfum_homme", name: "Parfum homme", glyph: "🧔", refBuyPrice: 30, refSellPrice: 95, perishDays: 730 },
  creme_visage: { id: "creme_visage", name: "Crème visage", glyph: "🧴", refBuyPrice: 15, refSellPrice: 45, perishDays: 365 },
  rouge_levres: { id: "rouge_levres", name: "Rouge à lèvres", glyph: "💋", refBuyPrice: 8, refSellPrice: 25, perishDays: 365 },
  // Meubles
  canape: { id: "canape", name: "Canapé", glyph: "🛋️", refBuyPrice: 300, refSellPrice: 900, perishDays: 9999 },
  table_basse: { id: "table_basse", name: "Table basse", glyph: "🪑", refBuyPrice: 80, refSellPrice: 240, perishDays: 9999 },
  lit_double: { id: "lit_double", name: "Lit double", glyph: "🛏️", refBuyPrice: 200, refSellPrice: 600, perishDays: 9999 },
  etagere: { id: "etagere", name: "Étagère", glyph: "📚", refBuyPrice: 50, refSellPrice: 150, perishDays: 9999 },
  // Électronique
  smartphone: { id: "smartphone", name: "Smartphone", glyph: "📱", refBuyPrice: 250, refSellPrice: 750, perishDays: 9999 },
  tv_4k: { id: "tv_4k", name: "TV 4K", glyph: "📺", refBuyPrice: 400, refSellPrice: 1200, perishDays: 9999 },
  casque_audio: { id: "casque_audio", name: "Casque audio", glyph: "🎧", refBuyPrice: 50, refSellPrice: 150, perishDays: 9999 },
  tablette: { id: "tablette", name: "Tablette", glyph: "📱", refBuyPrice: 200, refSellPrice: 600, perishDays: 9999 },
  // Bricolage
  perceuse: { id: "perceuse", name: "Perceuse", glyph: "🔧", refBuyPrice: 40, refSellPrice: 120, perishDays: 9999 },
  peinture_blanche: { id: "peinture_blanche", name: "Peinture 5L", glyph: "🎨", refBuyPrice: 18, refSellPrice: 55, perishDays: 730 },
  marteau: { id: "marteau", name: "Marteau", glyph: "🔨", refBuyPrice: 8, refSellPrice: 25, perishDays: 9999 },
  vis_lot: { id: "vis_lot", name: "Lot de vis", glyph: "🔩", refBuyPrice: 4, refSellPrice: 12, perishDays: 9999 },
  // Restaurant gastro
  menu_decouverte: { id: "menu_decouverte", name: "Menu découverte", glyph: "🍽️", refBuyPrice: 18, refSellPrice: 75, perishDays: 1 },
  plat_jour: { id: "plat_jour", name: "Plat du jour", glyph: "🥘", refBuyPrice: 6, refSellPrice: 25, perishDays: 1 },
  cave_signature: { id: "cave_signature", name: "Cave signature", glyph: "🍷", refBuyPrice: 30, refSellPrice: 100, perishDays: 365 },
  dessert_signature: { id: "dessert_signature", name: "Dessert signature", glyph: "🍰", refBuyPrice: 4, refSellPrice: 18, perishDays: 1 },
  // Concessionnaire
  citadine: { id: "citadine", name: "Citadine", glyph: "🚙", refBuyPrice: 9000, refSellPrice: 18000, perishDays: 9999 },
  berline: { id: "berline", name: "Berline", glyph: "🚗", refBuyPrice: 18000, refSellPrice: 36000, perishDays: 9999 },
  suv: { id: "suv", name: "SUV", glyph: "🚙", refBuyPrice: 22000, refSellPrice: 45000, perishDays: 9999 },
  sportive: { id: "sportive", name: "Sportive", glyph: "🏎️", refBuyPrice: 35000, refSellPrice: 75000, perishDays: 9999 },
  // Station-service
  carburant_essence: { id: "carburant_essence", name: "Carburant essence (L)", glyph: "⛽", refBuyPrice: 1.2, refSellPrice: 1.8, perishDays: 365 },
  carburant_diesel: { id: "carburant_diesel", name: "Carburant diesel (L)", glyph: "⛽", refBuyPrice: 1.1, refSellPrice: 1.7, perishDays: 365 },
  snack: { id: "snack", name: "Snack", glyph: "🍫", refBuyPrice: 1, refSellPrice: 3, perishDays: 180 },
  boisson_chaude: { id: "boisson_chaude", name: "Boisson chaude", glyph: "☕", refBuyPrice: 0.4, refSellPrice: 2, perishDays: 90 },
  // Hôtel
  nuitee_simple: { id: "nuitee_simple", name: "Nuitée chambre simple", glyph: "🛏️", refBuyPrice: 25, refSellPrice: 80, perishDays: 1 },
  nuitee_double: { id: "nuitee_double", name: "Nuitée chambre double", glyph: "🛏️", refBuyPrice: 40, refSellPrice: 130, perishDays: 1 },
  petit_dejeuner: { id: "petit_dejeuner", name: "Petit déjeuner", glyph: "🥐", refBuyPrice: 4, refSellPrice: 15, perishDays: 1 },
  spa: { id: "spa", name: "Accès spa", glyph: "🧖", refBuyPrice: 8, refSellPrice: 35, perishDays: 1 },
  // Animalerie
  croquettes_chien: { id: "croquettes_chien", name: "Croquettes chien 10kg", glyph: "🐕", refBuyPrice: 18, refSellPrice: 45, perishDays: 365 },
  croquettes_chat: { id: "croquettes_chat", name: "Croquettes chat 5kg", glyph: "🐈", refBuyPrice: 15, refSellPrice: 38, perishDays: 365 },
  litiere: { id: "litiere", name: "Litière", glyph: "🪨", refBuyPrice: 5, refSellPrice: 15, perishDays: 9999 },
  jouet_animal: { id: "jouet_animal", name: "Jouet animal", glyph: "🎾", refBuyPrice: 4, refSellPrice: 12, perishDays: 9999 },
};

// ──────────────────────────────────────────────────────────────────────────
// 5. PRÉSENTOIRS / ÉQUIPEMENT (P1 — placement abstrait)
// ──────────────────────────────────────────────────────────────────────────

export type SkylineFurnitureKind =
  | "shelf_basic"
  | "shelf_wood"
  | "vitrine_glass"
  | "vitrine_fridge"
  | "counter_basic"
  | "counter_premium"
  | "register_basic"
  | "register_pro"
  | "table_chairs"
  | "fridge_drinks";

export const SKYLINE_FURNITURE: Record<
  SkylineFurnitureKind,
  {
    id: SkylineFurnitureKind;
    name: string;
    glyph: string;
    cost: number;
    capacity: number; // unités stockables
    width: number; // cases grille
    height: number;
    description: string;
  }
> = {
  shelf_basic: {
    id: "shelf_basic",
    name: "Étagère basique",
    glyph: "🪞",
    cost: 600,
    capacity: 30,
    width: 1,
    height: 3,
    description: "Étagère simple, peu de capacité.",
  },
  shelf_wood: {
    id: "shelf_wood",
    name: "Étagère bois",
    glyph: "🪵",
    cost: 800,
    capacity: 50,
    width: 1,
    height: 3,
    description: "Aspect chaleureux. +5% qualité perçue.",
  },
  vitrine_glass: {
    id: "vitrine_glass",
    name: "Vitrine en verre",
    glyph: "🪟",
    cost: 1500,
    capacity: 80,
    width: 1,
    height: 2,
    description: "Visibilité produits, présentation premium.",
  },
  vitrine_fridge: {
    id: "vitrine_fridge",
    name: "Vitrine réfrigérée",
    glyph: "❄️",
    cost: 4000,
    capacity: 60,
    width: 1,
    height: 2,
    description: "Pour produits frais. Péremption +50%.",
  },
  counter_basic: {
    id: "counter_basic",
    name: "Comptoir basique",
    glyph: "🟫",
    cost: 1200,
    capacity: 20,
    width: 2,
    height: 1,
    description: "Comptoir d'accueil. Présentation produits premium.",
  },
  counter_premium: {
    id: "counter_premium",
    name: "Comptoir premium",
    glyph: "🟧",
    cost: 2500,
    capacity: 30,
    width: 2,
    height: 1,
    description: "Comptoir prestige. +10% panier moyen.",
  },
  register_basic: {
    id: "register_basic",
    name: "Caisse enregistreuse",
    glyph: "💵",
    cost: 1500,
    capacity: 0,
    width: 1,
    height: 1,
    description: "Caisse standard. Indispensable.",
  },
  register_pro: {
    id: "register_pro",
    name: "Caisse pro",
    glyph: "💸",
    cost: 4000,
    capacity: 0,
    width: 1,
    height: 1,
    description: "File d'attente -50%, gestion stocks intégrée.",
  },
  table_chairs: {
    id: "table_chairs",
    name: "Table + chaises (4 places)",
    glyph: "🪑",
    cost: 500,
    capacity: 0,
    width: 2,
    height: 2,
    description: "Coin sur place. ↑ panier moyen.",
  },
  fridge_drinks: {
    id: "fridge_drinks",
    name: "Frigo boissons",
    glyph: "🥤",
    cost: 1200,
    capacity: 100,
    width: 1,
    height: 1,
    description: "Réfrigéré. Pour boissons.",
  },
};

// ──────────────────────────────────────────────────────────────────────────
// 6. COMPÉTENCES (P1 prêt mais pleinement utilisé P9)
// ──────────────────────────────────────────────────────────────────────────

export type SkylineSkill =
  // Front
  | "vente"
  | "service_client"
  | "presentation"
  // Production
  | "machine_use"
  | "cuisine"
  | "soins"
  | "manuel"
  | "medical"
  | "agricole"
  // Support
  | "rh"
  | "compta"
  | "marketing"
  | "negociation"
  | "management"
  | "securite"
  | "entretien";

export const SKYLINE_SKILLS: Record<
  SkylineSkill,
  { id: SkylineSkill; name: string; glyph: string; group: "front" | "production" | "support" }
> = {
  vente: { id: "vente", name: "Vente", glyph: "👔", group: "front" },
  service_client: { id: "service_client", name: "Service client", glyph: "📞", group: "front" },
  presentation: { id: "presentation", name: "Présentation", glyph: "🎨", group: "front" },
  machine_use: { id: "machine_use", name: "Utilisation machines", glyph: "⚙️", group: "production" },
  cuisine: { id: "cuisine", name: "Cuisine / Préparation", glyph: "🍳", group: "production" },
  soins: { id: "soins", name: "Soins / Esthétique", glyph: "💈", group: "production" },
  manuel: { id: "manuel", name: "Manuel / Construction", glyph: "🏗️", group: "production" },
  medical: { id: "medical", name: "Médical", glyph: "💊", group: "production" },
  agricole: { id: "agricole", name: "Agricole", glyph: "🌾", group: "production" },
  rh: { id: "rh", name: "Recrutement (RH)", glyph: "💼", group: "support" },
  compta: { id: "compta", name: "Comptabilité", glyph: "📊", group: "support" },
  marketing: { id: "marketing", name: "Marketing", glyph: "📢", group: "support" },
  negociation: { id: "negociation", name: "Négociation", glyph: "🛒", group: "support" },
  management: { id: "management", name: "Management", glyph: "👨‍💼", group: "support" },
  securite: { id: "securite", name: "Sécurité", glyph: "🛡️", group: "support" },
  entretien: { id: "entretien", name: "Entretien", glyph: "🧹", group: "support" },
};

// ──────────────────────────────────────────────────────────────────────────
// 6.5. PERMIS / LICENCES (P2)
// ──────────────────────────────────────────────────────────────────────────

export type SkylinePermitKind =
  | "food"
  | "alcohol"
  | "pharma"
  | "enseigne"
  | "terrasse"
  | "tobacco"
  | "firearms"
  | "medical"
  | "fire";

export const SKYLINE_PERMITS: Record<
  SkylinePermitKind,
  {
    id: SkylinePermitKind;
    name: string;
    glyph: string;
    cost: number;
    description: string;
  }
> = {
  food: {
    id: "food",
    name: "Licence alimentaire",
    glyph: "🍽️",
    cost: 500,
    description: "Obligatoire pour vendre/préparer des aliments.",
  },
  alcohol: {
    id: "alcohol",
    name: "Licence IV (alcool)",
    glyph: "🍷",
    cost: 1500,
    description: "Pour vendre des boissons alcoolisées.",
  },
  pharma: {
    id: "pharma",
    name: "Licence pharmacie",
    glyph: "💊",
    cost: 5000,
    description: "Diplôme officinal requis. Sans ce permis, impossible d'opérer.",
  },
  enseigne: {
    id: "enseigne",
    name: "Permis enseigne",
    glyph: "🪧",
    cost: 200,
    description: "Pour afficher une enseigne extérieure.",
  },
  terrasse: {
    id: "terrasse",
    name: "Permis terrasse",
    glyph: "☂️",
    cost: 800,
    description: "Pour installer des tables sur le trottoir.",
  },
  tobacco: {
    id: "tobacco",
    name: "Permis tabac",
    glyph: "🚬",
    cost: 1200,
    description: "Pour vendre cigarettes et jeux à gratter.",
  },
  firearms: {
    id: "firearms",
    name: "Licence armes",
    glyph: "🔫",
    cost: 3000,
    description: "Pour vendre armes et munitions (T4 uniquement).",
  },
  medical: {
    id: "medical",
    name: "Licence médicale",
    glyph: "⚕️",
    cost: 4000,
    description: "Pour exercer la médecine ou ouvrir une clinique.",
  },
  fire: {
    id: "fire",
    name: "Conformité incendie",
    glyph: "🚨",
    cost: 300,
    description: "Annuelle, obligatoire pour tout local accueillant du public.",
  },
};

// Mapping secteur commerce → permis requis (au minimum).
export const SKYLINE_SECTOR_REQUIRED_PERMITS: Partial<
  Record<SkylineCommerceSector, SkylinePermitKind[]>
> = {
  boulangerie: ["food", "fire"],
  cafe_bar: ["food", "alcohol", "fire"],
  pizzeria: ["food", "fire"],
  fast_food: ["food", "fire"],
  cave_alcool: ["alcohol", "fire"],
  boucherie: ["food", "fire"],
  epicerie_fine: ["food", "alcohol", "fire"],
  supplette: ["food", "alcohol", "tobacco", "fire"],
  restaurant_gastro: ["food", "alcohol", "fire", "terrasse"],
  pharmacie: ["pharma", "fire"],
  hotel: ["food", "alcohol", "fire"],
  station_service: ["food", "tobacco", "fire"],
  fleuriste: ["fire"],
  boutique_vetements: ["fire"],
  joaillerie: ["fire"],
  parfumerie: ["fire"],
  magasin_meubles: ["fire"],
  magasin_electronique: ["fire"],
  bricolage: ["fire"],
  concessionnaire_auto: ["fire"],
  animalerie: ["food", "fire"],
};

// ──────────────────────────────────────────────────────────────────────────
// 6.6. DÉMOGRAPHIES PAR QUARTIER (P3)
// ──────────────────────────────────────────────────────────────────────────

export const SKYLINE_DISTRICT_DEMOGRAPHICS: Record<
  SkylineDistrict,
  Partial<Record<SkylineDemographic, number>> // % de chaque profil
> = {
  centre: { tourists: 30, wealthy: 25, workers: 25, families: 10, students: 5, retirees: 5 },
  affaires: { workers: 60, wealthy: 25, families: 5, students: 5, tourists: 5 },
  residentiel: { families: 40, retirees: 30, workers: 20, students: 5, wealthy: 5 },
  peripherie: { families: 50, retirees: 30, students: 20 },
  populaire: { students: 35, families: 35, retirees: 30 },
};

// ──────────────────────────────────────────────────────────────────────────
// 7. FORMULES — duplicate côté client pour affichage rapide
// ──────────────────────────────────────────────────────────────────────────

export const SKYLINE_STARTING_CASH = 10_000;

// Loyer mensuel d'un local.
export function skylineRentMonthly(district: SkylineDistrict, size: SkylineLocalSize): number {
  return SKYLINE_DISTRICTS[district].rentPerSqm * SKYLINE_LOCAL_SIZES[size].sqm;
}

// Caution = 1 mois de loyer.
export function skylineDepositCost(district: SkylineDistrict, size: SkylineLocalSize): number {
  return skylineRentMonthly(district, size);
}

// Achat d'un local = 100× loyer mensuel.
export function skylinePurchaseCost(district: SkylineDistrict, size: SkylineLocalSize): number {
  return skylineRentMonthly(district, size) * 100;
}

// Conversion $ → OS (avec taxe applicable).
export function skylineDollarsToOS(
  dollars: number,
  method: "wire" | "shell",
): { os: number; taxedDollars: number; receivedOS: number } {
  if (method === "wire") {
    // 1$ → 0.001 OS. Taxe 60% sur les $ avant conversion.
    const taxedDollars = dollars * 0.6;
    const remainingDollars = dollars - taxedDollars;
    const os = remainingDollars * 0.001;
    return { os, taxedDollars, receivedOS: Math.floor(os) };
  } else {
    // 1$ → 0.005 OS. Taxe 20%.
    const taxedDollars = dollars * 0.2;
    const remainingDollars = dollars - taxedDollars;
    const os = remainingDollars * 0.005;
    return { os, taxedDollars, receivedOS: Math.floor(os) };
  }
}

// Conversion OS → $ (à perte).
export function skylineOSToDollars(os: number): number {
  return os * 500;
}

// Cap quotidien OS → $.
export const SKYLINE_OS_TO_DOLLARS_CAP_PER_DAY = 50;

// Cap hebdo $ → OS via société écran.
export const SKYLINE_SHELL_WEEKLY_CAP = 100_000;

// Productivité d'un employé sur une tâche.
export function skylineProductivity(skill: number, equipQuality: number): number {
  return (skill / 100) * equipQuality;
}

// Niveau machine requis selon comp Utilisation machines.
export type SkylineMachineLevel = "basic" | "pro" | "elite" | "hightech";

export function skylineMachineSkillRequired(level: SkylineMachineLevel): number {
  switch (level) {
    case "basic":
      return 30;
    case "pro":
      return 60;
    case "elite":
      return 85;
    case "hightech":
      return 95;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 8. TYPES DB ROWS
// ──────────────────────────────────────────────────────────────────────────

export type SkylineProfileRow = {
  user_id: string;
  cash: number; // $ liquide
  credit_score: number; // 0-1000
  net_worth: number; // patrimoine total cached
  bankruptcy_pending: boolean;
  bankruptcy_started_at: string | null;
  os_to_dollars_today: number; // OS convertis en $ aujourd'hui (cap quotidien)
  shell_dollars_this_week: number; // $ convertis via shell cette semaine
  last_dollar_to_os_audit_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SkylineCompanyRow = {
  id: string;
  user_id: string;
  category: SkylineCategory;
  sector: string; // ex: "boulangerie", "moulin", "tech_solo"
  name: string;
  district: SkylineDistrict;
  local_size: SkylineLocalSize;
  is_owned: boolean; // true si acheté, false si loué
  cleanliness: number; // 0-100
  hygiene_grade: "A" | "B" | "C" | null;
  cash: number; // trésorerie de l'entreprise
  monthly_revenue: number;
  monthly_expenses: number;
  is_open: boolean;
  open_hour: number; // 0-23
  close_hour: number;
  created_at: string;
  updated_at: string;
  last_tick_at: string;
};

export type SkylineFurnitureRow = {
  id: string;
  company_id: string;
  kind: SkylineFurnitureKind;
  grid_x: number;
  grid_y: number;
  rotation: 0 | 90 | 180 | 270;
  created_at: string;
};

export type SkylineInventoryRow = {
  id: string;
  company_id: string;
  product_id: SkylineProductId;
  quantity: number;
  avg_buy_price: number; // moyenne pondérée d'achat
  sell_price: number; // prix de vente fixé par le joueur
  purchased_at: string; // pour péremption
};

export type SkylineTransactionRow = {
  id: string;
  user_id: string;
  company_id: string | null;
  kind:
    | "sale" // vente boutique
    | "purchase" // achat stock
    | "rent" // loyer
    | "salary" // salaires
    | "loan_payment" // mensualité prêt
    | "tax" // impôts
    | "permit" // permis
    | "equipment" // achat équipement
    | "marketing" // campagne pub
    | "deposit" // caution loyer
    | "purchase_local" // achat local
    | "shell_conversion" // conversion via shell
    | "wire_conversion" // virement bancaire
    | "os_to_dollars" // pont inverse
    | "audit_fine" // amende audit
    | "other";
  amount: number; // négatif = sortie, positif = entrée
  description: string;
  created_at: string;
};

export type SkylineOffshoreLogRow = {
  id: string;
  user_id: string;
  method: "wire" | "shell" | "os_to_dollars";
  dollars_in: number;
  os_in: number;
  dollars_out: number;
  os_out: number;
  tax_amount: number;
  was_audited: boolean;
  fine_amount: number;
  created_at: string;
};

export type SkylineEmployeeRow = {
  id: string;
  user_id: string;
  company_id: string | null;
  full_name: string;
  avatar_seed: string;
  skills: Record<SkylineSkill, number>; // 0-100
  salary_demanded: number;
  salary_paid: number;
  morale: number; // 0-100
  hired_at: string | null;
  available_until: string | null;
};

export type SkylineLoanRow = {
  id: string;
  user_id: string;
  company_id: string | null;
  amount_initial: number;
  amount_remaining: number;
  rate: number; // % annuel
  duration_months: number;
  monthly_payment: number;
  next_payment_at: string;
  paid_off_at: string | null;
  created_at: string;
  is_starter_loan: boolean;
};

export type SkylinePermitRow = {
  id: string;
  company_id: string;
  kind: SkylinePermitKind;
  acquired_at: string;
  expires_at: string;
  cost: number;
};

export type SkylineMarketCourseRow = {
  product_id: SkylineProductId;
  current_price: number;
  ref_price: number;
  trend_24h: number; // % variation
  volume_24h: number;
  updated_at: string;
};

export type SkylineNewsRow = {
  id: string;
  kind:
    | "shortage"
    | "trend"
    | "scandal"
    | "season"
    | "regulation"
    | "npc_announce"
    | "event_other";
  headline: string;
  body: string;
  product_id: SkylineProductId | null;
  sector: string | null;
  impact_pct: number; // -50 à +50
  starts_at: string;
  ends_at: string;
  created_at: string;
};

export type SkylineCompanyShareRow = {
  id: string;
  company_id: string;
  total_shares: number;
  ipo_price: number;
  current_price: number;
  market_cap: number;
  ipo_at: string | null;
};

export type SkylineShareHoldingRow = {
  id: string;
  user_id: string;
  company_id: string;
  shares: number;
  avg_buy_price: number;
};

// ──────────────────────────────────────────────────────────────────────────
// 9. UTILITIES
// ──────────────────────────────────────────────────────────────────────────

export function skylineFormatCash(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}Md $`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M $`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k $`;
  }
  return `${value.toFixed(0)} $`;
}

export function skylineFormatCashFR(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} $`;
}
