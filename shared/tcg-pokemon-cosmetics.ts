// Catalogue des cosmétiques achetables pour Pokemon TCG.
//
// Aligné sur le pattern OnePiece (cf. tcg-onepiece-cosmetics.ts) — même
// type CosmeticItem, même infra DB (tcg_cosmetics_owned + profiles.
// tcg_cosmetics_active). Seul le catalogue change.
//
// Quatre catégories :
//   • avatar  : portrait du joueur (image d'un Pokémon iconique du set actif)
//   • sleeve  : style des dos de carte (couleur par type d'énergie)
//   • playmat : background du combat (lieux Pokemon célèbres)
//   • coin    : pièce de pile/face animée (Pokéball, Master Ball, etc.)
//
// Le cosmetic_id "default" est gratuit et toujours équipable.
// Le combat utilise activeAvatar/Sleeve/Playmat/Coin du profile pour
// rendre l'identité visuelle du joueur.

// On réutilise volontairement les types exportés par OnePiece pour ne
// pas dupliquer (CosmeticType, CosmeticItem). Mais on étend CosmeticType
// avec "coin" via l'union ci-dessous (compatible côté DB qui accepte
// n'importe quel string).

import type { CosmeticItem } from "./tcg-onepiece-cosmetics";

// Pokemon ajoute "coin" en plus de avatar/sleeve/playmat.
export type PokemonCosmeticType = "avatar" | "sleeve" | "playmat" | "coin";

export type PokemonCosmeticItem = CosmeticItem & {
  // Pour les coins : id de pièce (Pokéball, Master Ball, etc.).
  // Affiché lors des coin flips en combat.
  coinId?: string;
};

export const POKEMON_COSMETICS: PokemonCosmeticItem[] = [
  // ─── Sleeves (dos de carte par type d'énergie) ─────────────────────
  {
    id: "default",
    type: "sleeve",
    name: "Dos classique",
    description: "Le dos rouge et bleu Pokéball.",
    emoji: "🔴",
    price: 0,
    sleeveColor: "from-rose-700 via-zinc-100 to-rose-700",
  },
  {
    id: "sleeve-fire",
    type: "sleeve",
    name: "Dos Feu",
    description: "Hommage à Dracaufeu — orange/rouge ardent.",
    emoji: "🔥",
    price: 3_000,
    sleeveColor: "from-orange-700 via-red-800 to-orange-900",
  },
  {
    id: "sleeve-water",
    type: "sleeve",
    name: "Dos Eau",
    description: "Hommage à Tortank — bleu océan profond.",
    emoji: "💧",
    price: 3_000,
    sleeveColor: "from-blue-700 via-cyan-800 to-blue-900",
  },
  {
    id: "sleeve-grass",
    type: "sleeve",
    name: "Dos Plante",
    description: "Hommage à Florizarre — vert luxuriant.",
    emoji: "🍃",
    price: 3_000,
    sleeveColor: "from-emerald-700 via-green-800 to-emerald-900",
  },
  {
    id: "sleeve-lightning",
    type: "sleeve",
    name: "Dos Électrique",
    description: "Hommage à Pikachu — jaune éclair.",
    emoji: "⚡",
    price: 3_000,
    sleeveColor: "from-yellow-500 via-amber-600 to-yellow-700",
  },
  {
    id: "sleeve-psychic",
    type: "sleeve",
    name: "Dos Psy",
    description: "Hommage à Mewtwo — violet onirique.",
    emoji: "🌀",
    price: 5_000,
    sleeveColor: "from-violet-700 via-purple-800 to-violet-900",
  },
  {
    id: "sleeve-darkness",
    type: "sleeve",
    name: "Dos Obscurité",
    description: "Pour les Dresseurs ténébreux.",
    emoji: "🌑",
    price: 5_000,
    sleeveColor: "from-zinc-800 via-slate-900 to-black",
  },
  {
    id: "sleeve-pokeball",
    type: "sleeve",
    name: "Pokéball",
    description: "Le grand classique rouge & blanc.",
    emoji: "⚪",
    price: 8_000,
    sleeveColor: "from-rose-500 via-zinc-100 to-rose-600",
  },
  {
    id: "sleeve-master-ball",
    type: "sleeve",
    name: "Master Ball",
    description: "Pour les Maîtres Pokémon. La perfection.",
    emoji: "🟣",
    price: 15_000,
    sleeveColor: "from-fuchsia-600 via-purple-700 to-violet-900",
  },
  {
    id: "sleeve-shiny-charizard",
    type: "sleeve",
    name: "Dracaufeu Shiny",
    description: "Édition limitée — Dracaufeu chromatique noir et or.",
    emoji: "🌟",
    price: 25_000,
    sleeveColor: "from-zinc-900 via-amber-800 to-zinc-950",
  },
  {
    id: "sleeve-mewtwo-ex",
    type: "sleeve",
    name: "Mewtwo EX",
    description: "Holographique. Le Pokémon génétique en majesté.",
    emoji: "🧬",
    price: 30_000,
    sleeveColor: "from-purple-700 via-fuchsia-800 to-indigo-950",
  },
  {
    id: "sleeve-rainbow",
    type: "sleeve",
    name: "Arc-en-ciel",
    description: "Toutes les couleurs des types Pokémon. Style libre.",
    emoji: "🌈",
    price: 50_000,
    sleeveColor: "from-rose-500 via-amber-400 to-violet-600",
  },

  // ─── Playmats (lieux Pokemon iconiques) ────────────────────────────
  {
    id: "default",
    type: "playmat",
    name: "Bourg Palette",
    description: "Le playmat par défaut — village de départ paisible.",
    emoji: "🏡",
    price: 0,
    playmatId: "default",
  },
  {
    id: "playmat-foret-jade",
    type: "playmat",
    name: "Forêt de Jade",
    description: "Forêt dense et mystérieuse, grands arbres.",
    emoji: "🌲",
    price: 5_000,
    playmatId: "foret-jade",
  },
  {
    id: "playmat-mont-selenite",
    type: "playmat",
    name: "Mont Sélénite",
    description: "Caverne nocturne — lune et étoiles.",
    emoji: "🌙",
    price: 5_000,
    playmatId: "mont-selenite",
  },
  {
    id: "playmat-stade",
    type: "playmat",
    name: "Stade Pokémon",
    description: "Arène professionnelle — Champions de la Ligue.",
    emoji: "🏟️",
    price: 8_000,
    playmatId: "stade",
  },
  {
    id: "playmat-cinabre",
    type: "playmat",
    name: "Île Cinabre",
    description: "Île volcanique, lave en fusion.",
    emoji: "🌋",
    price: 10_000,
    playmatId: "cinabre",
  },
  {
    id: "playmat-spiral-mewtwo",
    type: "playmat",
    name: "Caverne de Mewtwo",
    description: "Le repaire psychique du Pokémon génétique.",
    emoji: "🌀",
    price: 20_000,
    playmatId: "spiral-mewtwo",
  },

  // ─── Avatars (portraits Pokémon iconiques du set A1) ───────────────
  {
    id: "default",
    type: "avatar",
    name: "Avatar par défaut",
    description: "Portrait neutre.",
    emoji: "👤",
    price: 0,
  },
  {
    id: "avatar-pikachu",
    type: "avatar",
    name: "Pikachu",
    description: "La mascotte légendaire.",
    emoji: "⚡",
    price: 3_000,
    leaderCardId: "A1-094",
  },
  {
    id: "avatar-bulbasaur",
    type: "avatar",
    name: "Bulbizarre",
    description: "Le starter Plante d'origine.",
    emoji: "🌱",
    price: 3_000,
    leaderCardId: "A1-001",
  },
  {
    id: "avatar-charmander",
    type: "avatar",
    name: "Salamèche",
    description: "Le starter Feu d'origine.",
    emoji: "🦎",
    price: 3_000,
    leaderCardId: "A1-033",
  },
  {
    id: "avatar-squirtle",
    type: "avatar",
    name: "Carapuce",
    description: "Le starter Eau d'origine.",
    emoji: "🐢",
    price: 3_000,
    leaderCardId: "A1-053",
  },
  {
    id: "avatar-eevee",
    type: "avatar",
    name: "Évoli",
    description: "Le Pokémon évolution — multiples potentiels.",
    emoji: "🦊",
    price: 5_000,
    leaderCardId: "A1-207",
  },
  {
    id: "avatar-snorlax",
    type: "avatar",
    name: "Ronflex",
    description: "Le mur insurmontable. Toujours en train de dormir.",
    emoji: "😴",
    price: 5_000,
    leaderCardId: "A1-211",
  },
  {
    id: "avatar-clefairy",
    type: "avatar",
    name: "Mélofée",
    description: "La mascotte originale (avant Pikachu).",
    emoji: "🌟",
    price: 5_000,
    leaderCardId: "A1-113",
  },
  {
    id: "avatar-charizard",
    type: "avatar",
    name: "Dracaufeu",
    description: "L'évolution finale Feu — dragon emblématique.",
    emoji: "🐉",
    price: 12_000,
    leaderCardId: "A1-035",
  },
  {
    id: "avatar-blastoise",
    type: "avatar",
    name: "Tortank",
    description: "L'évolution finale Eau — forteresse aquatique.",
    emoji: "🌊",
    price: 12_000,
    leaderCardId: "A1-055",
  },
  {
    id: "avatar-venusaur",
    type: "avatar",
    name: "Florizarre",
    description: "L'évolution finale Plante — fleur géante.",
    emoji: "🌺",
    price: 12_000,
    leaderCardId: "A1-003",
  },
  {
    id: "avatar-mewtwo",
    type: "avatar",
    name: "Mewtwo",
    description: "Le Pokémon génétique — terreur Psy.",
    emoji: "🧬",
    price: 25_000,
    leaderCardId: "A1-128",
  },

  // ─── Coins (pièces de pile/face animées) ───────────────────────────
  {
    id: "default",
    type: "coin",
    name: "Pokéball classique",
    description: "La pièce officielle — rouge & blanc.",
    emoji: "🔴",
    price: 0,
    coinId: "default",
  },
  {
    id: "coin-superball",
    type: "coin",
    name: "Super Ball",
    description: "Bleu & rouge — pièce améliorée.",
    emoji: "🔵",
    price: 3_000,
    coinId: "superball",
  },
  {
    id: "coin-hyperball",
    type: "coin",
    name: "Hyper Ball",
    description: "Noir & jaune — pour les pros.",
    emoji: "⚫",
    price: 6_000,
    coinId: "hyperball",
  },
  {
    id: "coin-master-ball",
    type: "coin",
    name: "Master Ball",
    description: "Violet à reflets dorés — la pièce ultime.",
    emoji: "🟣",
    price: 15_000,
    coinId: "master-ball",
  },
  {
    id: "coin-pikachu",
    type: "coin",
    name: "Pièce Pikachu",
    description: "Une pièce dorée à l'effigie de Pikachu.",
    emoji: "⚡",
    price: 10_000,
    coinId: "pikachu",
  },
  {
    id: "coin-charizard",
    type: "coin",
    name: "Pièce Dracaufeu",
    description: "Pièce de feu — flammes gravées et crête écarlate.",
    emoji: "🐉",
    price: 12_000,
    coinId: "charizard",
  },
  {
    id: "coin-mewtwo",
    type: "coin",
    name: "Pièce Mewtwo",
    description: "Pièce psychique violette — ADN mystique gravé.",
    emoji: "🧬",
    price: 18_000,
    coinId: "mewtwo",
  },
  {
    id: "coin-mew",
    type: "coin",
    name: "Pièce Mew",
    description: "Pièce rose mythique — Pokémon n°150 fabuleux.",
    emoji: "🌸",
    price: 20_000,
    coinId: "mew",
  },
  {
    id: "coin-shiny-gold",
    type: "coin",
    name: "Pièce Or Pur",
    description: "Or massif — pour les collectionneurs aisés.",
    emoji: "💎",
    price: 30_000,
    coinId: "shiny-gold",
  },
];

export function getPokemonCosmeticsByType(
  type: PokemonCosmeticType,
): PokemonCosmeticItem[] {
  return POKEMON_COSMETICS.filter((c) => c.type === type);
}

export function getPokemonCosmeticById(
  type: PokemonCosmeticType,
  id: string,
): PokemonCosmeticItem | undefined {
  return POKEMON_COSMETICS.find((c) => c.type === type && c.id === id);
}
