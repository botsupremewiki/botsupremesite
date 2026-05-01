// Auto-deckbuilder simple pour Pokémon TCG Pocket.
//
// Algo :
//  1. Liste les Pokémon basics possédés par le user.
//  2. Choisit comme "leader" le Pokémon basic avec le + de PV
//     (capable d'évoluer en stage 1/2 si possédé).
//  3. Inclut la ligne d'évolution complète si possédée (jusqu'à 2 copies).
//  4. Ajoute des Pokémon supports du même type (max 2 par carte).
//  5. Complète avec des Trainers utilitaires (Potion, Recherches Prof,
//     Poké Ball, Vitesse +).
//  6. Vérifie qu'on atteint 20 cartes pile, sinon backfill avec n'importe
//     quel basic du même type.

import type { PokemonCardData, PokemonEnergyType } from "./types";
import { POKEMON_BASE_SET, POKEMON_BASE_SET_BY_ID } from "./tcg-pokemon-base";

export type GeneratedDeck = {
  name: string;
  cards: { cardId: string; count: number }[];
  energyTypes: PokemonEnergyType[];
  errors: string[];
};

/**
 * Génère un deck équilibré de 20 cartes à partir de la collection.
 * Renvoie { errors: ["…"] } si la collection est trop pauvre.
 */
export function generateDeckFromCollection(
  collection: Map<string, number>,
): GeneratedDeck {
  const errors: string[] = [];
  const owned = (id: string) => collection.get(id) ?? 0;

  // Toutes les cartes possédées (count > 0).
  const ownedCards = POKEMON_BASE_SET.filter((c) => owned(c.id) > 0);
  if (ownedCards.length < 8) {
    errors.push(
      "Collection trop pauvre : il faut au moins 8 cartes différentes.",
    );
    return { name: "Deck auto", cards: [], energyTypes: [], errors };
  }

  // Pokémon basics possédés.
  const basics = ownedCards.filter(
    (c) => c.kind === "pokemon" && c.stage === "basic",
  );
  if (basics.length === 0) {
    errors.push("Aucun Pokémon de base possédé.");
    return { name: "Deck auto", cards: [], energyTypes: [], errors };
  }

  // Choix du leader : le basic le + costaud capable d'évoluer.
  const sortedBasics = [...basics].sort((a, b) => {
    const ah = a.kind === "pokemon" ? a.hp : 0;
    const bh = b.kind === "pokemon" ? b.hp : 0;
    return bh - ah;
  });
  const leader = sortedBasics[0];
  const leaderType =
    leader.kind === "pokemon" ? leader.type : ("colorless" as PokemonEnergyType);

  // Construit le deck.
  const deck = new Map<string, number>();
  function addCard(id: string, n: number) {
    const cur = deck.get(id) ?? 0;
    const want = Math.min(2, cur + n, owned(id));
    if (want > cur) deck.set(id, want);
  }
  function totalSize(): number {
    let n = 0;
    for (const v of deck.values()) n += v;
    return n;
  }

  // 1. Leader x2.
  addCard(leader.id, 2);

  // 2. Sa ligne d'évolution si possédée.
  const evoStage1 = ownedCards.find(
    (c) =>
      c.kind === "pokemon" &&
      c.stage === "stage1" &&
      c.evolvesFrom === leader.name,
  );
  if (evoStage1) addCard(evoStage1.id, 2);
  const evoStage2 = evoStage1
    ? ownedCards.find(
        (c) =>
          c.kind === "pokemon" &&
          c.stage === "stage2" &&
          c.evolvesFrom === evoStage1.name,
      )
    : null;
  if (evoStage2) addCard(evoStage2.id, 2);

  // 3. Autres basics du même type (priorité aux + grands HP).
  const otherBasics = sortedBasics
    .filter((c) => c.id !== leader.id && c.kind === "pokemon")
    .filter((c) => c.kind === "pokemon" && (c.type === leaderType || c.type === "colorless"))
    .slice(0, 4);
  for (const b of otherBasics) {
    addCard(b.id, 2);
    if (totalSize() >= 12) break;
  }

  // 4. Trainers utilitaires.
  const utilityTrainerIds = [
    "P-A-001", // Potion
    "P-A-007", // Recherches Professorales
    "P-A-005", // Poké Ball
    "P-A-002", // Vitesse +
  ];
  for (const id of utilityTrainerIds) {
    if (owned(id) > 0) addCard(id, 2);
  }

  // 5. Backfill jusqu'à 20 si possible (n'importe quel basic possédé).
  if (totalSize() < 20) {
    for (const c of sortedBasics) {
      if (totalSize() >= 20) break;
      addCard(c.id, 2);
    }
  }
  // Si toujours moins, ajoute n'importe quel pokemon possédé.
  if (totalSize() < 20) {
    for (const c of ownedCards) {
      if (totalSize() >= 20) break;
      if (c.kind !== "pokemon") continue;
      addCard(c.id, 2);
    }
  }

  if (totalSize() !== 20) {
    errors.push(
      `Impossible d'atteindre 20 cartes (${totalSize()} obtenues). Ouvre plus de boosters.`,
    );
  }

  return {
    name: `${leader.name} auto`,
    cards: Array.from(deck.entries()).map(([cardId, count]) => ({
      cardId,
      count,
    })),
    energyTypes: [leaderType],
    errors,
  };
}

/** Retourne le détail d'une carte (helper). */
export function describeCard(cardId: string): PokemonCardData | undefined {
  return POKEMON_BASE_SET_BY_ID.get(cardId);
}
