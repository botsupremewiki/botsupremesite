// Decks pré-fabriqués proposés aux nouveaux joueurs.
// Chaque deck = 20 cartes (la limite Pocket), composé de cartes de base
// présentes dans A1+P-A. Les nouveaux joueurs reçoivent automatiquement
// 5 boosters au signup (existant), donc ils ont les cartes pour piocher.
//
// L'idée : permettre de constituer un deck en 1 clic au lieu de devoir
// comprendre la deckbuilding. Le bouton "Adopter ce deck" :
//   1. vérifie que le user possède toutes les cartes (sinon erreur)
//   2. crée un deck dans tcg_decks avec ces cartes + le nom du starter
//
// Si le user n'a pas toutes les cartes, l'UI lui dit lesquelles manquent
// pour qu'il ouvre des boosters d'abord.

import type { PokemonEnergyType } from "./types";

export type StarterDeckTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** Liste des cartes (cardId, count). Total cumulé = 20 obligatoirement. */
  cards: { cardId: string; count: number }[];
  energyTypes: PokemonEnergyType[];
};

export const STARTER_DECKS: StarterDeckTemplate[] = [
  {
    id: "feu-charbon",
    name: "🔥 Le Feu de Charbon",
    description:
      "Deck mono-Feu autour de Salamèche → Reptincel → Dracaufeu. Frappe forte mais lente, demande de patienter pour évoluer.",
    emoji: "🔥",
    energyTypes: ["fire"],
    cards: [
      // Ligne Salamèche (commune)
      { cardId: "A1-033", count: 2 }, // Salamèche
      { cardId: "A1-034", count: 2 }, // Reptincel
      { cardId: "A1-035", count: 2 }, // Dracaufeu
      // Goupix → Feunard
      { cardId: "A1-036", count: 2 }, // Goupix
      { cardId: "A1-037", count: 2 }, // Feunard
      // Magmar pour les early
      { cardId: "A1-046", count: 2 }, // Magmar
      // Trainers utiles
      { cardId: "P-A-001", count: 2 }, // Potion
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-005", count: 2 }, // Poké Ball
      { cardId: "P-A-002", count: 2 }, // Vitesse +
    ],
  },
  {
    id: "eau-tortue",
    name: "💧 La Carapace d'Eau",
    description:
      "Mono-Eau avec Carapuce → Carabaffe → Tortank. Tank avec gros HP, tu joues sur la durée et la défense.",
    emoji: "💧",
    energyTypes: ["water"],
    cards: [
      { cardId: "A1-053", count: 2 }, // Carapuce
      { cardId: "A1-054", count: 2 }, // Carabaffe
      { cardId: "A1-055", count: 2 }, // Tortank
      { cardId: "A1-066", count: 2 }, // Stari
      { cardId: "A1-067", count: 2 }, // Staross
      { cardId: "A1-073", count: 2 }, // Lokhlass
      { cardId: "P-A-001", count: 2 },
      { cardId: "P-A-007", count: 2 },
      { cardId: "P-A-005", count: 2 },
      { cardId: "P-A-002", count: 2 },
    ],
  },
  {
    id: "plante-bulbi",
    name: "🍃 La Forêt Verdoyante",
    description:
      "Mono-Plante avec Bulbizarre → Herbizarre → Florizarre. Style équilibré qui combine soin et dégâts.",
    emoji: "🍃",
    energyTypes: ["grass"],
    cards: [
      { cardId: "A1-001", count: 2 }, // Bulbizarre
      { cardId: "A1-002", count: 2 }, // Herbizarre
      { cardId: "A1-003", count: 2 }, // Florizarre
      { cardId: "A1-013", count: 2 }, // Aspicot
      { cardId: "A1-014", count: 2 }, // Coconfort
      { cardId: "A1-015", count: 2 }, // Dardargnan
      { cardId: "P-A-001", count: 2 },
      { cardId: "P-A-007", count: 2 },
      { cardId: "P-A-005", count: 2 },
      { cardId: "P-A-002", count: 2 },
    ],
  },
  {
    id: "electrique-pika",
    name: "⚡ L'Éclair Jaune",
    description:
      "Mono-Électrique autour de Pikachu et ses copains. Rapide et agressif, idéal pour finir vite.",
    emoji: "⚡",
    energyTypes: ["lightning"],
    cards: [
      { cardId: "A1-094", count: 2 }, // Pikachu
      { cardId: "A1-095", count: 2 }, // Raichu
      { cardId: "A1-098", count: 2 }, // Magnéti
      { cardId: "A1-099", count: 2 }, // Magnéton
      { cardId: "A1-100", count: 2 }, // Voltorbe
      { cardId: "A1-101", count: 2 }, // Électrode
      { cardId: "P-A-001", count: 2 },
      { cardId: "P-A-007", count: 2 },
      { cardId: "P-A-005", count: 2 },
      { cardId: "P-A-002", count: 2 },
    ],
  },
];

/** Retourne un starter par id (ou null). */
export function getStarterDeck(id: string): StarterDeckTemplate | null {
  return STARTER_DECKS.find((d) => d.id === id) ?? null;
}
