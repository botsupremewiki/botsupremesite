/**
 * Script du tutoriel pratique Pokemon TCG.
 *
 * Définit :
 *   • Le deck pré-déterminé du joueur (20 cartes, ordre de pioche fixe)
 *   • Le deck du bot et ses actions scriptées tour par tour
 *   • Les 30 steps du tutoriel (action attendue + texte d'explication +
 *     cible à highlight via data-tutorial-target)
 *
 * Tout est déterministe : pas de RNG, pas d'aléa. Le joueur fait l'expérience
 * d'une partie réelle mais entièrement guidée. Chaque step se valide quand
 * une condition (predicate) est remplie sur le state, ou via un bouton
 * "Suivant" pour les steps purement informatifs.
 */

import type { PokemonEnergyType } from "@shared/types";

/** Une step du tutoriel. */
export type TutorialStep = {
  /** Identifiant unique pour debug + state tracking. */
  id: string;
  /** Titre affiché dans la bulle. */
  title: string;
  /** Description / instruction. */
  body: string;
  /** Sélecteur CSS de la zone à highlight. null = pas de highlight. */
  target: string | null;
  /** Si true : auto-advance via condition (cf. validate). Sinon, bouton
   *  "Suivant" ou "Continuer" qui appelle onAdvance. */
  requiresAction?: boolean;
  /** Position préférée de la bulle. */
  bubblePosition?: "auto" | "top" | "bottom" | "left" | "right";
  /** Texte du bouton suivant (default "Suivant →"). null pour cacher
   *  le bouton (auto-advance via predicate). */
  nextLabel?: string | null;
};

/** Deck du joueur tutoriel — 20 cartes A1, ordre de pioche fixe.
 *  Index 0 = top of deck (1ère carte piochée si on devait piocher).
 *  Mais comme on contrôle aussi la main initiale, les 5 premières
 *  cartes sont la main de départ. */
export const TUTORIAL_PLAYER_DECK: string[] = [
  // Main de départ (5 cartes)
  "A1-094", // Pikachu (Basic, sera Actif)
  "A1-053", // Carapuce (Basic, bench)
  "A1-033", // Salamèche (Basic, bench)
  "A1-095", // Raichu (Stage 1 → évoluera Pikachu)
  "P-A-001", // Potion (Item)
  // Pioche tour 2+
  "P-A-007", // Recherches Professorales (Supporter)
  "A1-098", // Magnéton (Basic + Talent Charge Volt)
  "A1-094", // 2e Pikachu (backup)
  "P-A-005", // Poké Ball
  "P-A-002", // Vitesse +
  "A1-053", // 2e Carapuce
  "A1-033", // 2e Salamèche
  "P-A-001", // 2e Potion
  "A1-094", // (rempli filler — on ira pas si loin)
  "A1-098",
  "P-A-007",
  "A1-053",
  "A1-033",
  "A1-095",
  "P-A-005",
];

/** Deck du bot tutoriel — Roucool/Roucoups (basic+stage 1) puis
 *  Smogogo (status poison) puis Mewtwo EX. Scénario :
 *  T1 : Bot pose Roucool en Actif + Smogogo bench. Pas d'attaque.
 *  T2 : Attache énergie incolore sur Roucool, attaque Charge 30.
 *  T3 : Roucool KO par Raichu, bot promote Smogogo, qui empoisonne.
 *  T4 : Bot pose Mewtwo EX au banc (peut-être pas, pour simplifier).
 */
export const TUTORIAL_BOT_DECK: string[] = [
  "A1-186", // Roucool (Basic)
  "A1-187", // Roucoups (Stage 1, pas évolué dans le scénario)
  "A1-176", // Smogo (Basic darkness)
  "A1-177", // Smogogo (Stage 1, darkness, talent Fuite de Gaz = poison)
  "A1-129", // Mewtwo-ex (Basic 150 PV)
  ...Array(15).fill("A1-094"), // filler (jamais piochés)
];

/** Les 30 steps du tutoriel. Référence pour l'implémentation acte par acte. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  // ─── ACTE 1 : Setup + Démarrage (steps 1-8) ──────────────────────
  {
    id: "welcome",
    title: "Bienvenue dans Pokémon TCG !",
    body: "Tu vas jouer ton 1er match contre le Bot Suprême en mode tutoriel. Toutes les actions importantes seront expliquées au fur et à mesure. Le but : KO 3 Pokémon adverses. Ready ?",
    target: null,
    nextLabel: "C'est parti !",
  },
  {
    id: "intro-hand",
    title: "Ta main de départ",
    body: "Tu as 5 cartes en main. Tes Pokémon de Base sont entourés en vert : Pikachu, Carapuce et Salamèche peuvent être posés en jeu directement. Raichu (Stage 1) ne peut pas — il faudra le faire évoluer.",
    target: '[data-tutorial-target="hand"]',
    nextLabel: "Suivant →",
  },
  {
    id: "set-active",
    title: "Place ton Pokémon Actif",
    body: "Le Pokémon Actif est au front et combat directement. Clique sur Pikachu dans ta main pour le placer en Actif.",
    target: '[data-tutorial-target="hand-card-A1-094"]',
    requiresAction: true,
    nextLabel: null,
  },
  {
    id: "set-bench",
    title: "Le banc (1-3 Pokémon)",
    body: "Tu peux ajouter jusqu'à 3 Pokémon de Base sur ton Banc — ils servent de remplaçants si l'Actif est KO. Clique Carapuce et Salamèche pour les ajouter.",
    target: '[data-tutorial-target="hand"]',
    requiresAction: true,
    nextLabel: null,
  },
  {
    id: "confirm-setup",
    title: "Valide ton équipe",
    body: "Tu as ton Actif et ton banc. Clique sur « Confirmer mon équipe » pour démarrer le match.",
    target: '[data-tutorial-target="confirm-setup-btn"]',
    requiresAction: true,
    nextLabel: null,
  },
  {
    id: "first-turn-rules",
    title: "Règle du 1er tour",
    body: "Le 1er joueur ne pioche pas, et il NE PEUT PAS attaquer (anti-rush). Tu reçois quand même 1 énergie ⚡ aléatoire à attacher.",
    target: null,
    nextLabel: "Compris",
  },
  {
    id: "attach-first-energy",
    title: "Attache ta 1ère énergie",
    body: "Une énergie ⚡ apparaît à droite. Glisse-la (ou clique-la) sur Pikachu pour qu'il puisse attaquer plus tard.",
    target: '[data-tutorial-target="energy-pending"]',
    requiresAction: true,
    nextLabel: null,
  },
  {
    id: "end-turn-1",
    title: "Termine ton tour",
    body: "Le 1er tour, tu ne peux pas attaquer. Termine ton tour pour laisser le bot jouer.",
    target: '[data-tutorial-target="end-turn-btn"]',
    requiresAction: true,
    nextLabel: null,
  },

  // ─── ACTE 2 : Premier combat (steps 9-15) ────────────────────────
  // (à implémenter dans commit suivant)

  // ─── ACTE 3 : Évolution + Trainers (steps 16-22) ─────────────────
  // (à implémenter dans commit suivant)

  // ─── ACTE 4 : Avancé (steps 23-30) ───────────────────────────────
  // (à implémenter dans commit suivant)
];

/** Énergies du deck du joueur tutoriel : on force ⚡ uniquement (déterministe). */
export const TUTORIAL_PLAYER_ENERGY_TYPES: PokemonEnergyType[] = ["lightning"];

/** Énergies du deck du bot : incolore (Roucool) + obscurité (Smogogo). */
export const TUTORIAL_BOT_ENERGY_TYPES: PokemonEnergyType[] = [
  "colorless",
  "darkness",
];
