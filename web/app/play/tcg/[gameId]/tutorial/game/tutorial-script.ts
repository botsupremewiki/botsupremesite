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
 *  cartes sont la main de départ.
 *
 *  Le 3e Pokémon de Base est Magnéti pour permettre une démo
 *  interactive du talent Charge Volt à l'Acte 4 (Magnéti évolue en
 *  Magnéton qui a le talent activable, attache 1⚡ par tour). */
export const TUTORIAL_PLAYER_DECK: string[] = [
  // Main de départ (5 cartes)
  "A1-094", // Pikachu (Basic, sera Actif)
  "A1-053", // Carapuce (Basic, bench)
  "A1-097", // Magnéti (Basic, bench — évoluera en Magnéton à l'Acte 4)
  "A1-095", // Raichu (Stage 1 → évoluera Pikachu)
  "P-A-001", // Potion (Item)
  // Pioche tour 2+
  "P-A-007", // Recherches Professorales (Supporter)
  "A1-098", // Magnéton (Stage 1 + Talent Charge Volt — démo Acte 4)
  "A1-094", // 2e Pikachu (backup)
  "P-A-005", // Poké Ball
  "P-A-002", // Vitesse +
  "A1-053", // 2e Carapuce
  "A1-033", // Salamèche (filler)
  "P-A-001", // 2e Potion
  "A1-094", // (filler — on ira pas si loin)
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
    body: "Tu peux ajouter jusqu'à 3 Pokémon de Base sur ton Banc — ils servent de remplaçants si l'Actif est KO. Clique Carapuce et Magnéti pour les ajouter (Magnéti évoluera plus tard en Magnéton qui a un Talent activable).",
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
  {
    id: "bot-turn-1",
    title: "Tour du Bot",
    body: "Le Bot Suprême joue son 1er tour : il pose Roucool en Actif, Smogo au Banc, attache son énergie ⭐. Comme toi, il NE PEUT PAS attaquer au tour 1. Clique pour le voir jouer.",
    target: null,
    nextLabel: "▶️ Voir le bot jouer",
  },
  {
    id: "draw-turn-2",
    title: "Pioche du tour 2",
    body: "À partir du tour 2, tu pioches automatiquement 1 carte au début de ton tour. C'est gratuit, contrairement à beaucoup d'autres TCG. Continue !",
    target: '[data-tutorial-target="self-deck"]',
    nextLabel: "Suivant →",
  },
  {
    id: "attach-energy-2",
    title: "Attache ta 2e énergie",
    body: "Une nouvelle énergie ⚡ t'est offerte. Attache-la à Pikachu : il a déjà 1⚡ du tour précédent, il en aura 2 au total — assez pour son attaque qui en coûte 1 (le surplus sera utile plus tard pour évoluer en Raichu).",
    target: '[data-tutorial-target="energy-pending"]',
    requiresAction: true,
    nextLabel: null,
  },
  {
    id: "attack-rules",
    title: "Comprendre une attaque",
    body: "Pikachu a l'attaque « Ronge » : coûte 1⚡, inflige 20 dégâts. Roucool a une faiblesse ⚡ → tu lui infliges +20 dégâts (40 au lieu de 20). C'est crucial : exploite TOUJOURS les faiblesses.",
    target: '[data-tutorial-target="attacks-panel"]',
    nextLabel: "Compris",
  },
  {
    id: "launch-attack",
    title: "À l'attaque !",
    body: "Clique sur le bouton « Ronge » pour lancer l'attaque. Roucool va prendre 40 dégâts (20 base + 20 faiblesse).",
    target: '[data-tutorial-target="attack-btn-0"]',
    requiresAction: true,
    nextLabel: null,
  },
  {
    id: "bot-attack",
    title: "Le bot riposte",
    body: "Le bot fait Tornade avec Roucool : 10 dmg sur Pikachu (pas de faiblesse ⭐). Roucool ne sera pas KO ce tour, mais on a bien entamé sa barre de PV. Clique pour voir l'attaque.",
    target: null,
    nextLabel: "▶️ Voir Roucool attaquer",
  },
  {
    id: "end-acte-2",
    title: "Tu maîtrises les bases du combat !",
    body: "Tu sais : poser un actif/banc, attacher de l'énergie, lire une attaque, exploiter une faiblesse, finir ton tour. Dans l'Acte 3 on va faire évoluer Pikachu en Raichu pour KO Roucool, et utiliser des Trainer cards.",
    target: null,
    nextLabel: "Acte 3 →",
  },

  // ─── ACTE 3 : Évolution + Trainers (steps 16-22) ─────────────────
  {
    id: "evolve-rules",
    title: "L'évolution",
    body: "Roucool n'a plus que 20 PV — un coup bien placé suffit. Pour ça tu vas faire évoluer Pikachu en Raichu (Stage 1, 100 PV, attaque Tonnerre 3⚡ → 140 dégâts). Une évolution se fait depuis la main sur un Pokémon en jeu depuis ≥1 tour.",
    target: '[data-tutorial-target="hand-card-A1-095"]',
    nextLabel: "Compris",
  },
  {
    id: "evolve-pikachu",
    title: "Évolue Pikachu",
    body: "Clique sur Raichu dans ta main pour l'évoluer sur Pikachu. Il garde ses énergies attachées et ses dégâts (l'évolution N'EST PAS un soin — elle clear seulement les altérations type Sommeil/Paralysie).",
    target: '[data-tutorial-target="hand-card-A1-095"]',
    requiresAction: true,
    nextLabel: null,
  },
  {
    id: "attach-energy-3",
    title: "3e énergie",
    body: "Une nouvelle ⚡ pendante ! Attache-la à Raichu pour avoir 3⚡ au total — le coût exact de Tonnerre.",
    target: '[data-tutorial-target="energy-pending"]',
    requiresAction: true,
    nextLabel: null,
  },
  {
    id: "launch-tonnerre",
    title: "Tonnerre !",
    body: "Tonnerre fait 140 dmg de base. Roucool a faiblesse ⚡ → +20 = 160 dmg total. Il est largement KO. Note : Tonnerre défausse toutes les énergies de Raichu après l'attaque (effet text), il faudra recharger.",
    target: '[data-tutorial-target="attack-btn-0"]',
    requiresAction: true,
    nextLabel: null,
  },
  {
    id: "prize-system",
    title: "Tu marques 1 KO !",
    body: "KO normal = 1 point. Tu mènes 1/3 (les Pokémon EX rapportent 2 points). Le bot doit promouvoir un Pokémon de son banc en Actif : Smogo arrive au front. Sa faiblesse est 👊 (combat).",
    target: null,
    nextLabel: "Continuer",
  },
  {
    id: "trainer-cards",
    title: "Les cartes Dresseur",
    body: "Tu as 2 cartes Dresseur en main : Potion (Objet — soigne 20 PV un Pokémon) et Recherches Professorales (Supporter — pioche 2 cartes). Tu peux jouer 1 Supporter par tour, mais autant d'Objets que tu veux. Elles vont à la défausse après usage.",
    target: '[data-tutorial-target="hand"]',
    nextLabel: "Compris",
  },
  {
    id: "end-acte-3",
    title: "Acte 3 terminé !",
    body: "Tu sais : évoluer un Pokémon, marquer des KO/prizes, comprendre les Trainer cards. Dans l'Acte 4 on couvre les status (poison, paralysie, sommeil, brûlé), le retreat, les talents activés, les EX et la pile/face.",
    target: null,
    nextLabel: "Acte 4 →",
  },

  // ─── ACTE 4 : Avancé (steps 23-30) ───────────────────────────────
  {
    id: "bot-turn-3",
    title: "Le bot contre-attaque",
    body: "Le Bot va faire évoluer Smogo en Smogogo (110 PV), utiliser son talent Fuite de Gaz pour t'empoisonner, puis poser Mewtwo-ex au banc. Click pour le voir jouer.",
    target: null,
    nextLabel: "▶️ Voir le bot jouer",
  },
  {
    id: "poison-effect",
    title: "Empoisonné !",
    body: "Raichu est empoisonné ☠️ — il subit 10 dégâts à la fin du tour de chaque joueur. Le poison persiste jusqu'à ce qu'il soit retiré (par retraite, évolution ou KO). Les autres status : Sommeil 💤, Paralysie 🌀, Confusion ❓, Brûlé 🔥 — chacun a sa propre règle.",
    target: '[data-tutorial-target="active-zone"]',
    nextLabel: "Compris",
  },
  {
    id: "retreat-rules",
    title: "La retraite",
    body: "Tu peux retraiter ton Actif vers le Banc à tout moment de ton tour (sauf si endormi/paralysé) en défaussant N énergies = retreatCost. Raichu coûte 1, Smogogo coûte 3 (lourd !). Retraiter clear Sommeil/Paralysie mais PAS Poison/Brûlure.",
    target: null,
    nextLabel: "Compris",
  },
  {
    id: "evolve-magneton",
    title: "Démo Talent : évolue Magnéti",
    body: "Tu as Magnéton dans ta main (drawn during the previous turns). Il évolue depuis Magnéti (sur ton banc). Magnéton possède un Talent activable « Charge Volt » qui attache 1⚡ une fois par tour, sans coût. Clique sur Magnéton dans ta main pour le faire évoluer.",
    target: '[data-tutorial-target="hand-card-A1-098"]',
    requiresAction: true,
    nextLabel: null,
  },
  {
    id: "activate-charge-volt",
    title: "Active Charge Volt !",
    body: "Magnéton est en jeu. Un bandeau « ⭐ Activer Charge Volt » apparaît sur sa carte. Clique-le pour activer le talent : 1⚡ s'attache automatiquement, sans coût. Talents passifs (toujours actifs, ex. Coque Armure) vs activés (1×/tour) — c'est l'avantage stratégique des talents.",
    target: '[data-tutorial-target="ability-banner"]',
    requiresAction: true,
    nextLabel: null,
  },
  {
    id: "ex-rules",
    title: "Les Pokémon EX",
    body: "Mewtwo-ex (au banc adverse, 150 PV) est un Pokémon EX : très grosses stats (HP + dégâts) MAIS quand il est KO, l'adversaire gagne 2 prizes au lieu d'1. Risque calculé : un EX KO peut renverser le match.",
    target: null,
    nextLabel: "Compris",
  },
  {
    id: "coin-flip",
    title: "Pile ou face",
    body: "Beaucoup d'attaques ont un effet « lance une pièce » : pile = bonus (ex. +20 dmg, paralyse), face = rien. Tu peux personnaliser le design de ta pièce dans la boutique cosmétique (Or Suprême). C'est purement esthétique.",
    target: null,
    nextLabel: "Compris",
  },
  {
    id: "victory-conditions",
    title: "Conditions de victoire",
    body: "Tu gagnes si tu marques 3 points (KO normal = 1, EX = 2). Tu gagnes aussi si l'adversaire ne peut plus jouer : son deck est vide à la pioche, OU il n'a plus aucun Pokémon en jeu. Inversement, garde l'œil sur ton propre deck (20 cartes, ça file vite).",
    target: null,
    nextLabel: "Compris",
  },
  {
    id: "tutorial-end",
    title: "Tu es prêt à jouer !",
    body: "Tu connais TOUTES les mécaniques : main, Actif, Banc, énergie auto, attaques, faiblesses, évolution, KO/prizes, Trainer cards, status, retraite, talents, EX, pile/face, victoire. Le mieux maintenant : enchaîne quelques matchs contre le Bot Suprême (12 decks pré-faits) puis vise le PvP. 🎴 Récupère tes 10 boosters !",
    target: null,
    nextLabel: "🎉 Terminer",
  },
];

/** Énergies du deck du joueur tutoriel : on force ⚡ uniquement (déterministe). */
export const TUTORIAL_PLAYER_ENERGY_TYPES: PokemonEnergyType[] = ["lightning"];

/** Énergies du deck du bot : incolore (Roucool) + obscurité (Smogogo). */
export const TUTORIAL_BOT_ENERGY_TYPES: PokemonEnergyType[] = [
  "colorless",
  "darkness",
];
