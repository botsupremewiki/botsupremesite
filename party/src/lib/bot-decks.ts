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

  // ─── Deck 6 : Mewtwo-ex Psyburn (Psy + ex) ────────────────────────────
  {
    name: "Mewtwo-ex Psyburn",
    description: "Mewtwo-ex Basic 150 PV, Hypnomade Pendulo Dodo pour Endormi.",
    energyTypes: ["psychic"],
    cards: [
      { cardId: "A1-129", count: 2 }, // Mewtwo-ex (basic 150)
      { cardId: "A1-128", count: 2 }, // Mewtwo (basic 120)
      { cardId: "A1-124", count: 2 }, // Soporifik
      { cardId: "A1-125", count: 2 }, // Hypnomade (talent Pendulo Dodo)
      { cardId: "A1-115", count: 2 }, // Abra (Téléport self-swap)
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-001", count: 2 }, // Potion
      { cardId: "P-A-005", count: 2 }, // Poké Ball
      { cardId: "A1-223", count: 2 }, // Giovanni
      { cardId: "P-A-002", count: 2 }, // Vitesse +
    ],
  },

  // ─── Deck 7 : Pikachu-ex Surge (Élec + ex multiplicateur) ─────────────
  {
    name: "Pikachu-ex Surge",
    description: "Pikachu-ex 30×N Pokémon ⚡ Banc — sature le Banc d'électriques.",
    energyTypes: ["lightning"],
    cards: [
      { cardId: "A1-096", count: 2 }, // Pikachu-ex (Cercle Électrik 30×N)
      { cardId: "A1-094", count: 2 }, // Pikachu
      { cardId: "A1-097", count: 2 }, // Magnéti
      { cardId: "A1-099", count: 2 }, // Voltorbe
      { cardId: "A1-100", count: 2 }, // Électrode
      { cardId: "A1-107", count: 2 }, // Anchwatt
      { cardId: "A1-110", count: 2 }, // Galvaran
      { cardId: "A1-112", count: 2 }, // Wattapik
      { cardId: "A1-226", count: 2 }, // Major Bob
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
    ],
  },

  // ─── Deck 8 : Dracaufeu-ex Inferno (Feu stage 2 ex) ───────────────────
  {
    name: "Dracaufeu-ex Inferno",
    description: "Salamèche → Reptincel → Dracaufeu-ex 180 PV. Tape fort, mais lent à monter.",
    energyTypes: ["fire"],
    cards: [
      { cardId: "A1-033", count: 2 }, // Salamèche
      { cardId: "A1-034", count: 2 }, // Reptincel
      { cardId: "A1-036", count: 2 }, // Dracaufeu-ex (stage 2, 180 PV)
      { cardId: "A1-035", count: 2 }, // Dracaufeu (backup non-ex)
      { cardId: "A1-042", count: 2 }, // Ponyta
      { cardId: "A1-043", count: 2 }, // Galopa
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-005", count: 2 }, // Poké Ball
      { cardId: "P-A-001", count: 2 }, // Potion
      { cardId: "A1-223", count: 2 }, // Giovanni
    ],
  },

  // ─── Deck 9 : Ectoplasma-ex Maléfice (Psy stage 2 lock Supporter) ─────
  {
    name: "Ectoplasma Lock",
    description: "Ectoplasma-ex talent Maléfice des Ombres bloque les Supporters adverses.",
    energyTypes: ["psychic"],
    cards: [
      { cardId: "A1-120", count: 2 }, // Fantominus
      { cardId: "A1-121", count: 2 }, // Spectrum
      { cardId: "A1-123", count: 2 }, // Ectoplasma-ex (Maléfice des Ombres)
      { cardId: "A1-124", count: 2 }, // Soporifik
      { cardId: "A1-125", count: 2 }, // Hypnomade (Pendulo Dodo)
      { cardId: "A1-115", count: 2 }, // Abra
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-005", count: 2 }, // Poké Ball
      { cardId: "P-A-001", count: 2 }, // Potion
      { cardId: "P-A-002", count: 2 }, // Vitesse +
    ],
  },

  // ─── Deck 10 : Aéromite Poison (Plante poison) ────────────────────────
  {
    name: "Aéromite Poison",
    description: "Aéromite Poudre Toxik empoisonne, Erika soigne le banc Plante.",
    energyTypes: ["grass"],
    cards: [
      { cardId: "A1-016", count: 2 }, // Mimitoss
      { cardId: "A1-017", count: 2 }, // Aéromite (Poudre Toxik empoisonne)
      { cardId: "A1-008", count: 2 }, // Aspicot
      { cardId: "A1-009", count: 2 }, // Coconfort
      { cardId: "A1-010", count: 2 }, // Dardargnan
      { cardId: "A1-025", count: 2 }, // Insécateur
      { cardId: "A1-026", count: 2 }, // Scarabrute
      { cardId: "A1-219", count: 2 }, // Erika (heal 50 grass)
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-001", count: 2 }, // Potion
    ],
  },

  // ─── Deck 11 : Krabboss Tentacruel (Eau alternatif) ───────────────────
  {
    name: "Krabboss Crush",
    description: "Eau alternatif avec Krabboss et Tentacruel, Ondine pour les énergies bonus.",
    energyTypes: ["water"],
    cards: [
      { cardId: "A1-068", count: 2 }, // Krabby
      { cardId: "A1-069", count: 2 }, // Krabboss
      { cardId: "A1-062", count: 2 }, // Tentacool
      { cardId: "A1-063", count: 2 }, // Tentacruel
      { cardId: "A1-066", count: 2 }, // Kokiyas
      { cardId: "A1-067", count: 2 }, // Crustabri (talent Coque Armure -10)
      { cardId: "A1-220", count: 2 }, // Ondine
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-001", count: 2 }, // Potion
      { cardId: "P-A-002", count: 2 }, // Vitesse +
    ],
  },

  // ─── Deck 12 : Grodoudou Stall (Incolore endurance) ───────────────────
  {
    name: "Grodoudou Stall",
    description: "Grodoudou + Roucarnage Déroute pour casser le tempo adverse.",
    energyTypes: ["psychic", "colorless"],
    cards: [
      { cardId: "A1-193", count: 2 }, // Rondoudou
      { cardId: "A1-194", count: 2 }, // Grodoudou
      { cardId: "A1-186", count: 2 }, // Roucool
      { cardId: "A1-187", count: 2 }, // Roucoups
      { cardId: "A1-188", count: 2 }, // Roucarnage (talent Déroute force switch)
      { cardId: "A1-128", count: 2 }, // Mewtwo (basic)
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-001", count: 2 }, // Potion
      { cardId: "A1-225", count: 2 }, // Morgane (force switch)
      { cardId: "P-A-002", count: 2 }, // Vitesse +
    ],
  },

  // ─── Deck 13 : Grotadmorv Toxik (Ténèbres / Obscurité) ────────────────
  // Arène Ténèbres : poison + control via Grotadmorv et Smogogo.
  {
    name: "Grotadmorv Toxik",
    description:
      "Toxik + Smogogo (Fuite de Gaz) + Arbok lock retraite. Mono-darkness pour l'Arène Ténèbres.",
    energyTypes: ["darkness"],
    cards: [
      { cardId: "A1-164", count: 2 }, // Abo
      { cardId: "A1-165", count: 2 }, // Arbok
      { cardId: "A1-174", count: 2 }, // Tadmorv
      { cardId: "A1-175", count: 2 }, // Grotadmorv (Choc Venin +50 si empoisonné)
      { cardId: "A1-176", count: 2 }, // Smogo
      { cardId: "A1-177", count: 2 }, // Smogogo (talent Fuite de Gaz)
      { cardId: "A1-172", count: 2 }, // Nosferapti
      { cardId: "A1-173", count: 2 }, // Nosferalto
      { cardId: "P-A-007", count: 2 }, // Recherches Professorales
      { cardId: "P-A-001", count: 2 }, // Potion
    ],
  },
];

/** Tire un deck au hasard parmi ceux préenregistrés. */
export function pickRandomBotDeck(): BotDeck {
  return BOT_DECKS[Math.floor(Math.random() * BOT_DECKS.length)];
}

/** Tire un deck bot mono-type pour le mode "Champion d'arène".
 *  Filtre les decks dont le seul type d'énergie est `arenaType`.
 *  Si plusieurs decks matchent, en pioche un au hasard.
 *  Retourne null si aucun deck mono-type pour ce type — fallback sur
 *  pickRandomBotDeck() côté caller. */
export function pickArenaBotDeck(
  arenaType: PokemonEnergyType,
): BotDeck | null {
  const matching = BOT_DECKS.filter(
    (d) => d.energyTypes.length === 1 && d.energyTypes[0] === arenaType,
  );
  if (matching.length === 0) return null;
  return matching[Math.floor(Math.random() * matching.length)];
}
