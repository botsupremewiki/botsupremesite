// Helpers communs à toutes les phases du battle Pokémon. Volontairement
// pure-fonctionnels (pas de state) pour qu'on puisse les tester en isolation.

import type { PokemonCardData } from "../../../shared/types";
import { POKEMON_BASE_SET_BY_ID } from "../../../shared/tcg-pokemon-base";

/** Une carte de deck encapsulée (ce qu'on shuffle / pioche). On garde
 *  juste l'id, le serveur résout via le pool partagé pour récupérer la
 *  donnée riche (HP, attaques…). */
export type DeckCard = {
  uid: string; // identifiant unique de l'instance (utile pour le client)
  cardId: string;
};

export function getCard(cardId: string): PokemonCardData | undefined {
  return POKEMON_BASE_SET_BY_ID.get(cardId);
}

export function isBasicPokemon(cardId: string): boolean {
  const c = getCard(cardId);
  return c?.kind === "pokemon" && c.stage === "basic";
}

export function isEnergy(cardId: string): boolean {
  return getCard(cardId)?.kind === "energy";
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

/** Vérifie qu'au moins 1 Pokémon de Base est dans la main. Sinon, le
 *  joueur fait mulligan. */
export function handHasBasic(hand: DeckCard[]): boolean {
  return hand.some((c) => isBasicPokemon(c.cardId));
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
 *  compenser l'adversaire). */
export function dealOpeningHand(deck: DeckCard[]): {
  hand: DeckCard[];
  mulligans: number;
} {
  let mulligans = 0;
  let hand = drawN(deck, 7);
  while (!handHasBasic(hand)) {
    // Remettre la main dans le deck, reshuffle, redraw 7.
    deck.push(...hand);
    shuffle(deck);
    mulligans++;
    hand = drawN(deck, 7);
    if (mulligans > 20) break; // sécurité anti-deck-pourri
  }
  return { hand, mulligans };
}

/** Place `n` cartes face cachée comme prizes (ex 6 pour Pokémon TCG). */
export function takePrizes(deck: DeckCard[], n: number): DeckCard[] {
  return drawN(deck, n);
}
