// Helpers communs à toutes les phases du battle Pokémon. Volontairement
// pure-fonctionnels (pas de state) pour qu'on puisse les tester en isolation.

import type {
  PokemonCard,
  PokemonCardData,
  PokemonEnergyType,
} from "../../../shared/types";
import { POKEMON_BASE_SET_BY_ID } from "../../../shared/tcg-pokemon-base";

/** Une carte de deck encapsulée (ce qu'on shuffle / pioche). On garde
 *  juste l'id, le serveur résout via le pool partagé pour récupérer la
 *  donnée riche (HP, attaques…). */
export type DeckCard = {
  uid: string; // identifiant unique de l'instance (utile pour le client)
  cardId: string;
};

/** Cartes Dresseur "Fossile" qui se jouent comme un Pokémon de Base à 40 PV
 *  (Pocket : pas d'attaque, retrait impossible). Vérifié par NOM (les ids
 *  varient entre boosters mewtwo/charizard/pikachu). */
export const FOSSIL_NAMES = new Set<string>([
  "Vieil Ambre",
  "Fossile Dôme",
  "Fossile Nautile",
]);

export function getCard(cardId: string): PokemonCardData | undefined {
  return POKEMON_BASE_SET_BY_ID.get(cardId);
}

/** Comme `getCard` mais retourne un Pokémon synthétique pour les Fossiles
 *  (40 PV / type Incolore / 0 attaque / coût de retraite ∞). Utilisé partout
 *  dans le moteur de combat pour lire HP / type / attaques d'un Pokémon
 *  posé sur le board, pour que les Fossiles se comportent comme des
 *  Pokémon de Base sans avoir à dupliquer la logique. */
export function getCardForBattle(cardId: string): PokemonCard | undefined {
  const c = POKEMON_BASE_SET_BY_ID.get(cardId);
  if (!c) return undefined;
  if (c.kind === "pokemon") return c;
  if (c.kind === "trainer" && FOSSIL_NAMES.has(c.name)) {
    // Synthétise un Pokémon depuis les données Dresseur. 999 = "ne peut
    // jamais battre en retraite" (limite pratique).
    return {
      kind: "pokemon",
      id: c.id,
      number: c.number,
      pokedexId: null,
      name: c.name,
      type: "colorless",
      stage: "basic",
      hp: 40,
      retreatCost: 999,
      weakness: null,
      attacks: [],
      rarity: c.rarity,
      image: c.image,
      illustrator: c.illustrator ?? null,
      isEx: false,
      pack: c.pack,
      description:
        "Fossile — joue comme un Pokémon de Base à 40 PV. Sans attaque, ne peut pas battre en retraite.",
    };
  }
  return undefined;
}

/** Vrai Pokémon de Base (carte `kind: "pokemon"` stage basic). Utilisé par
 *  Poké Ball qui cherche spécifiquement « un Pokémon de base ». */
export function isBasicPokemon(cardId: string): boolean {
  const c = getCard(cardId);
  return c?.kind === "pokemon" && c.stage === "basic";
}

/** Carte jouable comme Pokémon de Base : vrai Basic OU Fossile. C'est ce
 *  qu'on veut pour le setup, le placement au Banc, le mulligan check, etc. */
export function isPlayableAsBasic(cardId: string): boolean {
  const c = getCard(cardId);
  if (!c) return false;
  if (c.kind === "pokemon") return c.stage === "basic";
  return c.kind === "trainer" && FOSSIL_NAMES.has(c.name);
}

export function isPokemon(cardId: string): boolean {
  return getCard(cardId)?.kind === "pokemon";
}

/** Mélange Fisher-Yates en place. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Construit un deck à partir d'une liste {cardId, count} en générant
 *  un uid unique pour chaque copie. */
export function expandDeck(
  cards: { cardId: string; count: number }[],
): DeckCard[] {
  const out: DeckCard[] = [];
  let counter = 0;
  for (const entry of cards) {
    for (let i = 0; i < entry.count; i++) {
      out.push({
        uid: `c${counter++}`,
        cardId: entry.cardId,
      });
    }
  }
  return out;
}

/** Vérifie qu'au moins 1 Pokémon de Base (ou Fossile, qui se joue comme
 *  un Pokémon de Base) est dans la main. Sinon, le joueur fait mulligan. */
export function handHasBasic(hand: DeckCard[]): boolean {
  return hand.some((c) => isPlayableAsBasic(c.cardId));
}

/** Pioche `n` cartes en haut du deck. Mute le deck. */
export function drawN(deck: DeckCard[], n: number): DeckCard[] {
  const drawn: DeckCard[] = [];
  for (let i = 0; i < n; i++) {
    const card = deck.pop();
    if (!card) break;
    drawn.push(card);
  }
  return drawn;
}

/** Pioche initiale + boucle de mulligan jusqu'à avoir 1 Basic en main.
 *  Retourne la main finale + le nombre de mulligans effectués (pour
 *  compenser l'adversaire). Pocket : openingSize = 5. */
export function dealOpeningHand(
  deck: DeckCard[],
  openingSize: number,
): {
  hand: DeckCard[];
  mulligans: number;
} {
  let mulligans = 0;
  let hand = drawN(deck, openingSize);
  while (!handHasBasic(hand)) {
    // Remettre la main dans le deck, reshuffle, redraw openingSize.
    deck.push(...hand);
    shuffle(deck);
    mulligans++;
    hand = drawN(deck, openingSize);
    if (mulligans > 20) break; // sécurité anti-deck-pourri
  }
  return { hand, mulligans };
}

/** Pocket : déduit les types d'énergies disponibles dans le deck à partir
 *  des types des Pokémon présents. Ces types serviront à générer aléatoirement
 *  une énergie à chaque tour. Si aucun Pokémon (impossible normalement),
 *  fallback sur ["colorless"]. */
export function deriveEnergyTypes(
  cards: { cardId: string; count: number }[],
): PokemonEnergyType[] {
  const types = new Set<PokemonEnergyType>();
  for (const entry of cards) {
    const c = getCard(entry.cardId);
    if (c?.kind === "pokemon") types.add(c.type);
  }
  return types.size > 0 ? [...types] : ["colorless"];
}

/** Pocket : tire une énergie aléatoire parmi les types du deck. */
export function pickRandomEnergy(
  types: PokemonEnergyType[],
): PokemonEnergyType {
  if (types.length === 0) return "colorless";
  return types[Math.floor(Math.random() * types.length)];
}
