// Champion d'arène : 7 arènes Pokemon TCG (1 par jour de la semaine,
// rotation hebdomadaire). Chaque arène impose au joueur :
//   • Le bot joue un deck mono-type (le type de l'arène)
//   • Le joueur a INTERDICTION d'utiliser le type "faiblesse" de l'arène
//
// Récompenses : 1 badge d'arène + 1 booster gratuit par arène vaincue
// (1× par jour par arène). La RPC record_arena_win track ça en DB.
//
// Le tableau ARENAS est indexé par jour de semaine :
//   0 = dimanche (JS Date.getDay()), 1 = lundi, ..., 6 = samedi.
// On utilise getDay() côté client pour déterminer l'arène du jour.

import type { PokemonEnergyType } from "./types";

export type PokemonArena = {
  /** Identifiant unique pour la DB (jour de semaine clé). */
  id: string;
  /** Nom de l'arène — Champion + type. */
  name: string;
  /** Description courte du champion (quelques mots). */
  description: string;
  /** Emoji icône représentant le type. */
  icon: string;
  /** Type Pokémon que joue le bot (mono-type). */
  botType: PokemonEnergyType;
  /** Type INTERDIT au joueur (= faiblesse standard du type bot). */
  forbiddenType: PokemonEnergyType;
  /** Couleur d'accent Tailwind pour l'UI. */
  accent: string;
  /** Couleur de fond Tailwind. */
  bg: string;
  /** Jour de la semaine (0 = dimanche, ..., 6 = samedi). */
  weekday: number;
};

/** Nom traduit FR pour les types Pokémon. */
export const POKEMON_TYPE_LABEL_FR: Record<PokemonEnergyType, string> = {
  fire: "Feu",
  water: "Eau",
  grass: "Plante",
  lightning: "Électrique",
  psychic: "Psy",
  fighting: "Combat",
  darkness: "Obscurité",
  metal: "Métal",
  dragon: "Dragon",
  colorless: "Incolore",
  fairy: "Fée",
};

/** Emoji par type. */
export const POKEMON_TYPE_EMOJI: Record<PokemonEnergyType, string> = {
  fire: "🔥",
  water: "💧",
  grass: "🍃",
  lightning: "⚡",
  psychic: "🌀",
  fighting: "👊",
  darkness: "🌑",
  metal: "⚙️",
  dragon: "🐉",
  colorless: "⭐",
  fairy: "🧚",
};

export const POKEMON_ARENAS: PokemonArena[] = [
  {
    id: "arena-grass",
    weekday: 1, // Lundi
    name: "Arène Plante",
    description: "Champion Plante — sa forêt n'attend que toi.",
    icon: "🍃",
    botType: "grass",
    forbiddenType: "fire", // Plante est faible contre Feu → tu n'as pas le droit
    accent: "text-emerald-200",
    bg: "from-emerald-900/30 to-green-950/40",
  },
  {
    id: "arena-fire",
    weekday: 2, // Mardi
    name: "Arène Feu",
    description: "Champion Feu — la fournaise t'attend.",
    icon: "🔥",
    botType: "fire",
    forbiddenType: "water",
    accent: "text-orange-200",
    bg: "from-orange-900/30 to-red-950/40",
  },
  {
    id: "arena-water",
    weekday: 3, // Mercredi
    name: "Arène Eau",
    description: "Champion Eau — plonge dans le grand bain.",
    icon: "💧",
    botType: "water",
    forbiddenType: "lightning",
    accent: "text-sky-200",
    bg: "from-sky-900/30 to-blue-950/40",
  },
  {
    id: "arena-lightning",
    weekday: 4, // Jeudi
    name: "Arène Électrique",
    description: "Champion Électrique — l'orage gronde.",
    icon: "⚡",
    botType: "lightning",
    forbiddenType: "fighting",
    accent: "text-yellow-200",
    bg: "from-yellow-900/30 to-amber-950/40",
  },
  {
    id: "arena-psychic",
    weekday: 5, // Vendredi
    name: "Arène Psy",
    description: "Champion Psy — il lit dans tes pensées.",
    icon: "🌀",
    botType: "psychic",
    forbiddenType: "darkness",
    accent: "text-violet-200",
    bg: "from-violet-900/30 to-purple-950/40",
  },
  {
    id: "arena-fighting",
    weekday: 6, // Samedi
    name: "Arène Combat",
    description: "Champion Combat — prêt pour un face-à-face brut.",
    icon: "👊",
    botType: "fighting",
    forbiddenType: "psychic",
    accent: "text-amber-200",
    bg: "from-amber-900/30 to-orange-950/40",
  },
  {
    id: "arena-darkness",
    weekday: 0, // Dimanche
    name: "Arène Ténèbres",
    description: "Champion Ténèbres — l'ombre étouffe.",
    icon: "🌑",
    botType: "darkness",
    forbiddenType: "fighting",
    accent: "text-zinc-200",
    bg: "from-zinc-900/40 to-slate-950/50",
  },
];

/** Retourne l'arène du jour selon la date (timezone locale). */
export function getTodayArena(date: Date = new Date()): PokemonArena {
  const dow = date.getDay();
  const arena = POKEMON_ARENAS.find((a) => a.weekday === dow);
  // Fallback (ne devrait jamais arriver, on couvre tous les dow 0-6).
  return arena ?? POKEMON_ARENAS[0];
}

/** Retourne l'arène par id (stable pour la DB). */
export function getArenaById(id: string): PokemonArena | undefined {
  return POKEMON_ARENAS.find((a) => a.id === id);
}
