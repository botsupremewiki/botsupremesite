// Decks préenregistrés du Bot Suprême — utilisés en mode "bot" (room id
// commence par "bot-"). Le bot pioche un deck au hasard parmi ceux-ci au
// lieu de mirror le deck du joueur. Cela rend les matchs plus variés
// (différentes stratégies / matchups).
//
// Chaque deck respecte les contraintes Pocket :
// - exactement 20 cartes
// - max 2 par NOM (toutes raretés confondues, attention pour les Pokémon
//   qui apparaissent dans plusieurs sets)
// - au moins 1 Pokémon de Base
// - 1 à 3 types d'énergies choisis manuellement

import type { PokemonEnergyType } from "../../../shared/types";

export type BotDeck = {
  /** Nom affiché côté client (UserPill, log). */
  name: string;
  /** Description courte pour debug / log. */
  description: string;
  /** Liste des cartes : id du pool A1 + P-A. */
  cards: { cardId: string; count: number }[];
  /** Types d'énergies générés automatiquement chaque tour. */
  energyTypes: PokemonEnergyType[];
};

export const BOT_DECKS: BotDeck[] = [
  // ─── Deck 1 : Dracaufeu Burn (Feu) ────────────────────────────────────
  {
    name: "Dracaufeu Burn",
    description: "Évolution Salamèche → Dracaufeu, support Goupix/Feunard.",
    energyTypes: ["fire"],
    cards: [
      { cardId: "A1-033", count: 2 }, // Salamèche
      { cardId: "A1-034", count: 2 }, // Reptincel
      { cardId: "A1-035", count: 2 }, // Dracaufeu
      { cardId: "A1-037", count: 2 }, // Goupix
      { cardId: "A1-038", count: 2 }, // Feunard
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-001", count: 2 }, // Potion
      { cardId: "P-A-005", count: 2 }, // Poké Ball
      { cardId: "P-A-002", count: 2 }, // Vitesse +
      { cardId: "A1-223", count: 2 }, // Giovanni (+10 dmg)
    ],
  },

  // ─── Deck 2 : Léviator Splash (Eau) ───────────────────────────────────
  {
    name: "Léviator Splash",
    description: "Léviator + Tortank, support Ondine pour l'attache d'énergie.",
    energyTypes: ["water"],
    cards: [
      { cardId: "A1-077", count: 2 }, // Magicarpe
      { cardId: "A1-078", count: 2 }, // Léviator
      { cardId: "A1-053", count: 2 }, // Carapuce
      { cardId: "A1-054", count: 2 }, // Carabaffe
      { cardId: "A1-055", count: 2 }, // Tortank
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-001", count: 2 }, // Potion
      { cardId: "P-A-005", count: 2 }, // Poké Ball
      { cardId: "A1-220", count: 2 }, // Ondine
      { cardId: "P-A-002", count: 2 }, // Vitesse +
    ],
  },

  // ─── Deck 3 : Pikachu Storm (Élec) ────────────────────────────────────
  {
    name: "Pikachu Storm",
    description: "Triple package élec : Pikachu/Raichu, Magnéti/Magnéton, Voltorbe/Électrode.",
    energyTypes: ["lightning"],
    cards: [
      { cardId: "A1-094", count: 2 }, // Pikachu
      { cardId: "A1-095", count: 2 }, // Raichu
      { cardId: "A1-097", count: 2 }, // Magnéti
      { cardId: "A1-098", count: 2 }, // Magnéton (talent Charge Volt)
      { cardId: "A1-099", count: 2 }, // Voltorbe
      { cardId: "A1-100", count: 2 }, // Électrode
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-001", count: 2 }, // Potion
      { cardId: "A1-226", count: 2 }, // Major Bob (déplace ⚡ du banc)
      { cardId: "A1-223", count: 2 }, // Giovanni
    ],
  },

  // ─── Deck 4 : Florizarre Healer (Plante) ──────────────────────────────
  {
    name: "Florizarre Healer",
    description: "Florizarre / Dardargnan, support Erika qui soigne 50 PV.",
    energyTypes: ["grass"],
    cards: [
      { cardId: "A1-001", count: 2 }, // Bulbizarre
      { cardId: "A1-002", count: 2 }, // Herbizarre
      { cardId: "A1-003", count: 2 }, // Florizarre (heal Méga-Sangsue)
      { cardId: "A1-008", count: 2 }, // Aspicot
      { cardId: "A1-009", count: 2 }, // Coconfort
      { cardId: "A1-010", count: 2 }, // Dardargnan
      { cardId: "A1-219", count: 2 }, // Erika (heal 50 sur grass)
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-001", count: 2 }, // Potion
      { cardId: "P-A-005", count: 2 }, // Poké Ball
    ],
  },

  // ─── Deck 5 : Mackogneur Crush (Combat) ───────────────────────────────
  {
    name: "Mackogneur Crush",
    description: "Mackogneur / Grolem, Onix tank, support Pierre attache combat.",
    energyTypes: ["fighting"],
    cards: [
      { cardId: "A1-143", count: 2 }, // Machoc
      { cardId: "A1-144", count: 2 }, // Machopeur
      { cardId: "A1-145", count: 2 }, // Mackogneur
      { cardId: "A1-147", count: 2 }, // Racaillou
      { cardId: "A1-148", count: 2 }, // Gravalanch
      { cardId: "A1-149", count: 2 }, // Grolem
      { cardId: "A1-150", count: 2 }, // Onix
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-001", count: 2 }, // Potion
      { cardId: "A1-224", count: 2 }, // Pierre (attache combat à Grolem/Onix)
    ],
  },
];

/** Tire un deck au hasard parmi ceux préenregistrés. */
export function pickRandomBotDeck(): BotDeck {
  return BOT_DECKS[Math.floor(Math.random() * BOT_DECKS.length)];
}
