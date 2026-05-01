// Registry des sets Pokémon TCG Pocket disponibles sur le site.
//
// L'idée : POKEMON_BASE_SET contient le set par défaut (A1 + P-A) ; au fur
// et à mesure qu'on importe d'autres sets (A1a "Île Mythique", A2
// "Espace-Temps Triomphal"…), on les ajoute dans `POKEMON_SETS` pour les
// rendre disponibles dans les boosters et la collection.
//
// Pour importer un nouveau set :
//   1. node scripts/generate-pocket-cards-fr.mjs --set=A1a
//   2. node scripts/pocket-json-to-ts.mjs \
//        --in=scripts/pocket-cards-A1a-fr.json \
//        --out=shared/tcg-pokemon-a1a.ts \
//        --export=POKEMON_A1A_SET
//   3. Importer POKEMON_A1A_SET ici et l'ajouter à POKEMON_SETS

import type { PokemonCardData } from "./types";
import {
  POKEMON_BASE_SET,
  POKEMON_BASE_SET_BY_ID,
} from "./tcg-pokemon-base";
import { POKEMON_A1A_SET } from "./tcg-pokemon-a1a";
import { POKEMON_A2_SET } from "./tcg-pokemon-a2";

export type PokemonSetMeta = {
  /** Identifiant tcgdex (A1, A1a, A2, A2a, A3...). */
  id: string;
  /** Nom affichable. */
  name: string;
  /** Cartes du set (PokemonCardData = pokemon | trainer). */
  cards: PokemonCardData[];
  /** Date de release (UTC, ISO yyyy-mm-dd). null = inconnue. */
  releasedAt: string | null;
  /** Bool : actuellement actif (peut apparaître dans les boosters). */
  active: boolean;
};

export const POKEMON_SETS: PokemonSetMeta[] = [
  {
    id: "A1+P-A",
    name: "Puissance Génétique",
    cards: POKEMON_BASE_SET,
    releasedAt: "2024-10-30",
    active: true,
  },
  // Les 2 sets ci-dessous sont désactivés pour l'instant. La data est
  // gardée (cartes importées dans tcg-pokemon-a1a.ts et tcg-pokemon-a2.ts)
  // pour réactivation rapide ~2 semaines après la mise en production,
  // une fois la draw logic PartyKit validée pour les nouvelles raretés.
  {
    id: "A1a",
    name: "L'Île Fabuleuse",
    cards: POKEMON_A1A_SET,
    releasedAt: "2024-12-17",
    active: false,
  },
  {
    id: "A2",
    name: "Choc Spatio-Temporel",
    cards: POKEMON_A2_SET,
    releasedAt: "2025-01-30",
    active: false,
  },
];

/** Toutes les cartes Pokémon (tous sets actifs) — utile pour la collection
 * quand le user a coché "tous les sets". */
export const POKEMON_ALL_CARDS: PokemonCardData[] = POKEMON_SETS.flatMap(
  (s) => (s.active ? s.cards : []),
);

/** Index global cardId → carte. Pour usage générique (replay, market…). */
export const POKEMON_CARD_BY_ID: Map<string, PokemonCardData> = (() => {
  const map = new Map<string, PokemonCardData>();
  // On garde l'index existant pour la base + on étend avec les autres sets.
  for (const [id, card] of POKEMON_BASE_SET_BY_ID) {
    map.set(id, card);
  }
  for (const s of POKEMON_SETS) {
    if (s.cards === POKEMON_BASE_SET) continue; // déjà ajouté
    if (!s.active) continue;
    for (const card of s.cards) map.set(card.id, card);
  }
  return map;
})();

/** Retourne le set d'une carte d'après son préfixe (A1-001 → "A1+P-A"). */
export function setIdForCard(cardId: string): string | null {
  const prefix = cardId.split("-")[0];
  for (const s of POKEMON_SETS) {
    // P-A a le préfixe "P-A" qui contient "-" — on doit le matcher en
    // priorité avant le simple split.
    if (cardId.startsWith("P-A-")) {
      if (s.id.includes("P-A")) return s.id;
      continue;
    }
    if (s.id === prefix || s.id.startsWith(prefix)) return s.id;
  }
  return null;
}
