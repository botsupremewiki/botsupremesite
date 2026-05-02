"use client";

/**
 * Tutoriel Pokemon TCG en mode partie pédagogique.
 *
 * Joue une partie scriptée contre un bot fictif, avec un overlay
 * "coach" qui :
 *   • Highlight l'élément à utiliser (halo jaune pulsant)
 *   • Affiche une bulle d'explication
 *   • Bloque les autres actions tant que la step n'est pas validée
 *
 * Le state battle est local (pas de WebSocket) — déterministe pour
 * que chaque joueur voit la même séquence de mécaniques.
 *
 * À la fin : redirige vers /tutorial avec ?completed=1 pour que
 * complete_tcg_tutorial soit appelée et débloque les +50 OS + 10 packs.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import type {
  PokemonAttack,
  PokemonCard,
  PokemonCardData,
  PokemonEnergyType,
} from "@shared/types";
import { createClient } from "@/lib/supabase/client";
import { CoachOverlay } from "@/components/coach-overlay";
import {
  TUTORIAL_BOT_DECK,
  TUTORIAL_PLAYER_DECK,
  TUTORIAL_STEPS,
  type TutorialStep,
} from "./tutorial-script";

/** Récupère la définition Pokémon (seulement si c'est un Pokémon, pas un
 *  Trainer). Retourne null sinon. Helper utilisé partout pour avoir
 *  accès aux HP, attaques, faiblesse… */
function getPokemonCard(cardId: string): PokemonCard | null {
  const meta = POKEMON_BASE_SET_BY_ID.get(cardId);
  if (!meta || meta.kind !== "pokemon") return null;
  return meta;
}

/** Vérifie si un set d'énergies couvre un coût d'attaque. Le ⭐
 *  (colorless) accepte n'importe quel type. Simplifié vs vrai engine. */
function canPayCost(
  attached: PokemonEnergyType[],
  cost: PokemonEnergyType[],
): boolean {
  const pool = [...attached];
  // 1ère passe : matcher les exigences typées (non colorless).
  for (const c of cost) {
    if (c === "colorless") continue;
    const idx = pool.indexOf(c);
    if (idx === -1) return false;
    pool.splice(idx, 1);
  }
  // 2e passe : compter les colorless restants (n'importe quoi).
  const colorless = cost.filter((c) => c === "colorless").length;
  return pool.length >= colorless;
}

/** Calcule les dégâts effectifs en tenant compte de la faiblesse (+20). */
function computeDamage(
  attack: PokemonAttack,
  attackerType: PokemonEnergyType,
  defenderWeakness: PokemonEnergyType | null | undefined,
): number {
  const base = attack.damage ?? 0;
  if (defenderWeakness && defenderWeakness === attackerType) return base + 20;
  return base;
}


/** State minimal d'un Pokémon en jeu (Active ou Bench). */
type InPlay = {
  uid: string;
  cardId: string;
  damage: number;
  attachedEnergies: PokemonEnergyType[];
  statuses: string[];
  playedThisTurn: boolean;
};

/** Phase du jeu (mirror du vrai battle-client). */
type Phase = "setup" | "playing" | "ended";

type Side = {
  hand: string[]; // cardIds en main
  deck: string[]; // cardIds (top = index 0)
  active: InPlay | null;
  bench: InPlay[];
  discard: string[];
  pendingEnergy: PokemonEnergyType | null;
  energyAttachedThisTurn: boolean;
  koCount: number;
};

type GameState = {
  phase: Phase;
  turn: number; // numéro de tour (1 = 1er tour du joueur)
  activeSide: "self" | "bot";
  self: Side;
  bot: Side;
  winner: "self" | "bot" | null;
};

/** Cherche un Pokémon allié (active ou bench) dont le nom matche
 *  `evolvesFrom`. Retourne l'uid de la 1ère cible valide (Active
 *  prioritaire). null si aucune cible. */
function findEvolveTarget(state: GameState, evolvesFrom: string): string | null {
  if (state.self.active) {
    const m = getPokemonCard(state.self.active.cardId);
    if (m && m.name === evolvesFrom) return state.self.active.uid;
  }
  for (const b of state.self.bench) {
    const m = getPokemonCard(b.cardId);
    if (m && m.name === evolvesFrom) return b.uid;
  }
  return null;
}

/** Crée le state initial du tutoriel : main de départ + deck. */
function makeInitialState(): GameState {
  const playerHand = TUTORIAL_PLAYER_DECK.slice(0, 5);
  const playerDeck = TUTORIAL_PLAYER_DECK.slice(5);
  const botHand = TUTORIAL_BOT_DECK.slice(0, 5);
  const botDeck = TUTORIAL_BOT_DECK.slice(5);
  return {
    phase: "setup",
    turn: 0,
    activeSide: "self",
    self: {
      hand: playerHand,
      deck: playerDeck,
      active: null,
      bench: [],
      discard: [],
      pendingEnergy: null,
      energyAttachedThisTurn: false,
      koCount: 0,
    },
    bot: {
      hand: botHand,
      deck: botDeck,
      active: null,
      bench: [],
      discard: [],
      pendingEnergy: null,
      energyAttachedThisTurn: false,
      koCount: 0,
    },
    winner: null,
  };
}

let uidCounter = 1;
function nextUid(): string {
  return `tut-${uidCounter++}`;
}

export function TutorialGameClient({
  gameId,
  isLoggedIn,
  alreadyCompleted,
  reviewMode = false,
}: {
  gameId: string;
  isLoggedIn: boolean;
  alreadyCompleted: boolean;
  /** Tutoriel revisité depuis le hub : pas de récompense, skip libre. */
  reviewMode?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<GameState>(() => makeInitialState());
  const [stepIdx, setStepIdx] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const totalSteps = TUTORIAL_STEPS.length;
  const currentStep: TutorialStep | null =
    stepIdx < totalSteps ? TUTORIAL_STEPS[stepIdx] : null;

  /** Avance d'une step. */
  const advance = useCallback(() => {
    setStepIdx((idx) => Math.min(idx + 1, totalSteps));
  }, [totalSteps]);

  /** Skip tutoriel : redirige vers le hub.
   *  - Mode review : pas de prompt (le user a déjà sa récompense ou peut
   *    tout simplement quitter sans rien perdre).
   *  - Mode normal : prompt confirmant la perte des +10 boosters. */
  const skip = useCallback(() => {
    if (reviewMode) {
      router.push(`/play/tcg/${gameId}`);
      return;
    }
    if (!confirm("Quitter le tutoriel ? Tu n'auras pas les 10 boosters offerts."))
      return;
    router.push(`/play/tcg/${gameId}?skipTutorial=1`);
  }, [router, gameId, reviewMode]);

  /** Validation finale + appel RPC complete_tcg_tutorial qui crédite
   *  +50 OS + 10 boosters. Idempotent côté serveur (on conflict do nothing).
   *  En mode review ou déjà complété, on ne fait que rediriger. */
  const validateAndGoToBoosters = useCallback(async () => {
    const target = `/play/tcg/${gameId}/boosters`;
    if (reviewMode || alreadyCompleted || !isLoggedIn) {
      router.push(target);
      return;
    }
    setCompletionError(null);
    setCompleting(true);
    const supabase = createClient();
    if (!supabase) {
      setCompletionError("Connexion à la base impossible.");
      setCompleting(false);
      return;
    }
    const { error: rpcErr } = await supabase.rpc("complete_tcg_tutorial", {
      p_game_id: gameId,
    });
    if (rpcErr) {
      setCompletionError(rpcErr.message ?? "Erreur lors de l'enregistrement.");
      setCompleting(false);
      return;
    }
    router.push(target);
  }, [router, gameId, reviewMode, alreadyCompleted, isLoggedIn]);

  /** Place un Pokémon de la main en Active (setup phase). */
  function setActive(handIdx: number) {
    setState((s) => {
      if (s.phase !== "setup" || s.self.active) return s;
      const cardId = s.self.hand[handIdx];
      const meta = POKEMON_BASE_SET_BY_ID.get(cardId);
      if (!meta || meta.kind !== "pokemon" || meta.stage !== "basic") return s;
      const newHand = [...s.self.hand.slice(0, handIdx), ...s.self.hand.slice(handIdx + 1)];
      return {
        ...s,
        self: {
          ...s.self,
          hand: newHand,
          active: {
            uid: nextUid(),
            cardId,
            damage: 0,
            attachedEnergies: [],
            statuses: [],
            playedThisTurn: false,
          },
        },
      };
    });
    // Avance auto si on est sur la step "set-active"
    if (currentStep?.id === "set-active") advance();
  }

  /** Ajoute un Pokémon de la main au banc (setup phase). */
  function addToBench(handIdx: number) {
    setState((s) => {
      if (s.phase !== "setup") return s;
      if (s.self.bench.length >= 3) return s;
      const cardId = s.self.hand[handIdx];
      const meta = POKEMON_BASE_SET_BY_ID.get(cardId);
      if (!meta || meta.kind !== "pokemon" || meta.stage !== "basic") return s;
      const newHand = [...s.self.hand.slice(0, handIdx), ...s.self.hand.slice(handIdx + 1)];
      return {
        ...s,
        self: {
          ...s.self,
          hand: newHand,
          bench: [
            ...s.self.bench,
            {
              uid: nextUid(),
              cardId,
              damage: 0,
              attachedEnergies: [],
              statuses: [],
              playedThisTurn: false,
            },
          ],
        },
      };
    });
    // L'avancée de la step "set-bench" est gérée par useEffect plus bas
    // (déclenchement quand bench.length atteint 2).
  }

  /** Confirme l'équipe et démarre le match. */
  function confirmSetup() {
    setState((s) => {
      if (s.phase !== "setup" || !s.self.active) return s;
      // Pose le bot : Roucool en Actif, Smogo + Smogogo bench
      const botActiveCard = TUTORIAL_BOT_DECK[0]; // Roucool
      const botBench1 = TUTORIAL_BOT_DECK[2]; // Smogo
      return {
        ...s,
        phase: "playing",
        turn: 1,
        activeSide: "self",
        self: {
          ...s.self,
          // Énergie pendante au tour 1.
          pendingEnergy: "lightning",
        },
        bot: {
          ...s.bot,
          hand: TUTORIAL_BOT_DECK.slice(0, 5).filter(
            (_, i) => i !== 0 && i !== 2,
          ),
          active: {
            uid: nextUid(),
            cardId: botActiveCard,
            damage: 0,
            attachedEnergies: [],
            statuses: [],
            playedThisTurn: false,
          },
          bench: [
            {
              uid: nextUid(),
              cardId: botBench1,
              damage: 0,
              attachedEnergies: [],
              statuses: [],
              playedThisTurn: false,
            },
          ],
        },
      };
    });
    if (currentStep?.id === "confirm-setup") advance();
  }

  /** Attache l'énergie pendante à un Pokémon. */
  function attachEnergy(targetUid: string) {
    setState((s) => {
      if (!s.self.pendingEnergy || s.self.energyAttachedThisTurn) return s;
      const energy = s.self.pendingEnergy;
      const updateCard = (c: InPlay): InPlay =>
        c.uid === targetUid
          ? { ...c, attachedEnergies: [...c.attachedEnergies, energy] }
          : c;
      return {
        ...s,
        self: {
          ...s.self,
          pendingEnergy: null,
          energyAttachedThisTurn: true,
          active: s.self.active ? updateCard(s.self.active) : null,
          bench: s.self.bench.map(updateCard),
        },
      };
    });
    if (
      currentStep?.id === "attach-first-energy" ||
      currentStep?.id === "attach-energy-2" ||
      currentStep?.id === "attach-energy-3"
    ) {
      advance();
    }
  }

  /** Termine le tour du joueur. */
  function endTurn() {
    setState((s) => ({
      ...s,
      activeSide: "bot",
      // Reset les flags de tour côté joueur (préparation pour le retour).
      self: { ...s.self, energyAttachedThisTurn: false, pendingEnergy: null },
    }));
    if (currentStep?.id === "end-turn-1") advance();
    if (currentStep?.id === "end-turn-2") advance();
  }

  /** Lance une attaque du Pokémon Actif sur l'Actif adverse. Règle
   *  Pokémon TCG Pocket : attaquer met fin au tour. On flippe donc
   *  activeSide à "bot" après l'attaque. Pour le tutoriel : pas de cible
   *  alternative — juste les dégâts + faiblesse + KO + auto-promote.
   *  Effet text "défausse toutes les énergies" est implémenté pour
   *  l'attaque Tonnerre de Raichu (détecté par texte fr). */
  function attack(attackIdx: number) {
    setState((s) => {
      if (s.activeSide !== "self" || !s.self.active || !s.bot.active) return s;
      const attacker = getPokemonCard(s.self.active.cardId);
      const defender = getPokemonCard(s.bot.active.cardId);
      if (!attacker || !defender) return s;
      const a = attacker.attacks[attackIdx];
      if (!a) return s;
      if (!canPayCost(s.self.active.attachedEnergies, a.cost)) return s;
      const dmg = computeDamage(a, attacker.type, defender.weakness);
      const newDamage = s.bot.active.damage + dmg;
      const koed = newDamage >= defender.hp;
      // Effet "Défaussez toutes les Énergies" (Tonnerre, Psykoforce…).
      const discardAll =
        typeof a.text === "string" &&
        /défausse[zr]? toutes les énergies/i.test(a.text);
      const updatedSelfActive: InPlay = {
        ...s.self.active,
        attachedEnergies: discardAll ? [] : s.self.active.attachedEnergies,
      };
      if (koed) {
        // Bot promote 1er bench (FIFO simplifié — vrai jeu : choix
        // joueur, mais ici scénarisé : Smogo passe en actif).
        const promoted = s.bot.bench[0] ?? null;
        const restBench = s.bot.bench.slice(1);
        // Prizes : EX = 2, sinon 1.
        const prize = defender.isEx ? 2 : 1;
        return {
          ...s,
          activeSide: "bot",
          self: {
            ...s.self,
            energyAttachedThisTurn: false,
            pendingEnergy: null,
            active: updatedSelfActive,
            koCount: s.self.koCount + prize,
          },
          bot: {
            ...s.bot,
            active: promoted,
            bench: restBench,
            discard: [...s.bot.discard, s.bot.active.cardId],
          },
        };
      }
      return {
        ...s,
        activeSide: "bot",
        self: {
          ...s.self,
          energyAttachedThisTurn: false,
          pendingEnergy: null,
          active: updatedSelfActive,
        },
        bot: {
          ...s.bot,
          active: { ...s.bot.active, damage: newDamage },
        },
      };
    });
    if (currentStep?.id === "launch-attack") advance();
    if (currentStep?.id === "launch-tonnerre") advance();
  }

  /** Évolue un Pokémon : remplace le Pokémon en jeu (cible) par la carte
   *  d'évolution depuis la main. Garde les énergies + dégâts (vrai
   *  Pokémon TCG : pas de heal) ; clear les statuses (le rules text). */
  function evolve(handIdx: number, targetUid: string) {
    setState((s) => {
      const cardId = s.self.hand[handIdx];
      const evoMeta = POKEMON_BASE_SET_BY_ID.get(cardId);
      if (!evoMeta || evoMeta.kind !== "pokemon") return s;
      if (evoMeta.stage === "basic") return s;
      // Trouve la cible (active ou bench).
      const target =
        s.self.active?.uid === targetUid
          ? s.self.active
          : s.self.bench.find((b) => b.uid === targetUid);
      if (!target) return s;
      const targetMeta = getPokemonCard(target.cardId);
      if (!targetMeta) return s;
      // L'évolution doit matcher : evoMeta.evolvesFrom === targetMeta.name
      if (evoMeta.evolvesFrom !== targetMeta.name) return s;
      // Le Pokémon cible doit être en jeu depuis ≥1 tour (pas
      // playedThisTurn). Pour le tutoriel on relâche cette contrainte.
      const newHand = [
        ...s.self.hand.slice(0, handIdx),
        ...s.self.hand.slice(handIdx + 1),
      ];
      const evolved: InPlay = {
        ...target,
        cardId: evoMeta.id,
        statuses: [], // clear status (règle évolution)
        playedThisTurn: true,
      };
      return {
        ...s,
        self: {
          ...s.self,
          hand: newHand,
          active:
            s.self.active?.uid === targetUid ? evolved : s.self.active,
          bench: s.self.bench.map((b) => (b.uid === targetUid ? evolved : b)),
          discard: [...s.self.discard, target.cardId],
        },
      };
    });
    if (currentStep?.id === "evolve-pikachu") advance();
  }

  /** Animation du tour 1 du bot : il a déjà posé ses Pokémon dans
   *  confirmSetup ; il reste juste à attacher 1⭐ sur Roucool. Anti-rush :
   *  pas d'attaque tour 1.  À la fin, repasse au tour joueur 2 +
   *  pioche + énergie pendante. */
  const runBotTurn1AndAdvance = useCallback(() => {
    // Tour bot phase 1 : attache énergie ⭐ sur Roucool (~600ms après).
    setTimeout(() => {
      setState((s) => {
        if (!s.bot.active) return s;
        return {
          ...s,
          bot: {
            ...s.bot,
            active: {
              ...s.bot.active,
              attachedEnergies: [...s.bot.active.attachedEnergies, "colorless"],
            },
            energyAttachedThisTurn: true,
          },
        };
      });
    }, 600);
    // Phase 2 : retour au tour joueur 2, pioche + énergie pendante.
    setTimeout(() => {
      setState((s) => ({
        ...s,
        turn: 2,
        activeSide: "self",
        self: {
          ...s.self,
          // Pioche 1 carte (top of deck = index 0).
          hand: s.self.deck.length > 0 ? [...s.self.hand, s.self.deck[0]] : s.self.hand,
          deck: s.self.deck.slice(1),
          pendingEnergy: "lightning",
          energyAttachedThisTurn: false,
        },
        bot: { ...s.bot, energyAttachedThisTurn: false },
      }));
      advance();
    }, 1500);
  }, [advance]);

  /** Animation du tour 3 du bot : évolution Smogo→Smogogo, talent Fuite
   *  de Gaz → poison sur Raichu, pose Mewtwo-ex au banc. Bot ne attaque
   *  pas (économie de tour). À la fin, retour au tour joueur 4. */
  const runBotTurn3AndAdvance = useCallback(() => {
    // Phase 1 (600ms) : Smogo évolue en Smogogo. On garde l'uid +
    // énergies (le bot a posé 0⭐ sur Smogo donc rien à garder, mais
    // pour cohérence on conserve la structure).
    setTimeout(() => {
      setState((s) => {
        if (!s.bot.active) return s;
        return {
          ...s,
          bot: {
            ...s.bot,
            active: {
              ...s.bot.active,
              cardId: "A1-177", // Smogogo
              statuses: [],
              playedThisTurn: true,
            },
            hand: s.bot.hand.filter((c) => c !== "A1-177"),
            discard: [...s.bot.discard, s.bot.active.cardId],
          },
        };
      });
    }, 600);
    // Phase 2 (1500ms) : talent Fuite de Gaz → poison sur Raichu.
    setTimeout(() => {
      setState((s) => {
        if (!s.self.active) return s;
        if (s.self.active.statuses.includes("poison")) return s;
        return {
          ...s,
          self: {
            ...s.self,
            active: {
              ...s.self.active,
              statuses: [...s.self.active.statuses, "poison"],
            },
          },
        };
      });
    }, 1500);
    // Phase 3 (2400ms) : pose Mewtwo-ex sur le bench.
    setTimeout(() => {
      setState((s) => ({
        ...s,
        bot: {
          ...s.bot,
          bench: [
            ...s.bot.bench,
            {
              uid: nextUid(),
              cardId: "A1-129", // Mewtwo-ex
              damage: 0,
              attachedEnergies: [],
              statuses: [],
              playedThisTurn: true,
            },
          ],
          hand: s.bot.hand.filter((c) => c !== "A1-129"),
        },
      }));
    }, 2400);
    // Phase 4 (3500ms) : end of turn → poison damage 10 sur Raichu,
    // puis retour au tour joueur 4 + pioche + énergie pendante.
    setTimeout(() => {
      setState((s) => ({
        ...s,
        turn: 4,
        activeSide: "self",
        self: {
          ...s.self,
          active: s.self.active
            ? {
                ...s.self.active,
                damage:
                  s.self.active.statuses.includes("poison")
                    ? s.self.active.damage + 10
                    : s.self.active.damage,
              }
            : null,
          hand:
            s.self.deck.length > 0
              ? [...s.self.hand, s.self.deck[0]]
              : s.self.hand,
          deck: s.self.deck.slice(1),
          pendingEnergy: "lightning",
          energyAttachedThisTurn: false,
        },
      }));
      advance();
    }, 3500);
  }, [advance]);

  /** Animation du tour 2 du bot : Roucool attaque Pikachu avec Tornade
   *  (1⭐ → 10 dmg). Pas de faiblesse ⭐ donc juste 10. Avance ensuite. */
  const runBotAttackAndAdvance = useCallback(() => {
    setTimeout(() => {
      setState((s) => {
        if (!s.bot.active || !s.self.active) return s;
        const attacker = getPokemonCard(s.bot.active.cardId);
        const defender = getPokemonCard(s.self.active.cardId);
        if (!attacker || !defender) return s;
        const a = attacker.attacks[0];
        if (!a) return s;
        const dmg = computeDamage(a, attacker.type, defender.weakness);
        return {
          ...s,
          self: {
            ...s.self,
            active: { ...s.self.active, damage: s.self.active.damage + dmg },
          },
        };
      });
    }, 600);
    // Phase 2 : retour au tour joueur (tour 3 — sera géré dans Acte 3).
    setTimeout(() => {
      setState((s) => ({
        ...s,
        turn: 3,
        activeSide: "self",
        self: {
          ...s.self,
          hand: s.self.deck.length > 0 ? [...s.self.hand, s.self.deck[0]] : s.self.hand,
          deck: s.self.deck.slice(1),
          pendingEnergy: "lightning",
          energyAttachedThisTurn: false,
        },
        bot: { ...s.bot, energyAttachedThisTurn: false },
      }));
      advance();
    }, 1500);
  }, [advance]);

  /** Wrapper du bouton "Suivant" qui dispatch les side-effects selon
   *  la step active. Permet d'avoir un seul callback pour CoachOverlay. */
  const handleNext = useCallback(() => {
    if (!currentStep) return;
    switch (currentStep.id) {
      case "bot-turn-1":
        runBotTurn1AndAdvance();
        break;
      case "bot-attack":
        runBotAttackAndAdvance();
        break;
      case "bot-turn-3":
        runBotTurn3AndAdvance();
        break;
      default:
        advance();
    }
  }, [
    currentStep,
    advance,
    runBotTurn1AndAdvance,
    runBotAttackAndAdvance,
    runBotTurn3AndAdvance,
  ]);

  // Auto-advance pour les steps purement informatifs avec délai (ex.
  // "draw-turn-2" — on laisse le user 1.5s pour observer la pioche puis
  // on avance). Pour les autres steps, l'avancement est déclenché soit
  // par les actions (setActive, attack, etc.) soit par le bouton "Suivant"
  // via handleNext.
  const lastAutoStepRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentStep) return;
    if (lastAutoStepRef.current === currentStep.id) return;
    if (currentStep.id === "draw-turn-2") {
      lastAutoStepRef.current = currentStep.id;
      const t = setTimeout(() => advance(), 1800);
      return () => clearTimeout(t);
    }
  }, [currentStep, advance]);

  // Auto-advance de la step "set-bench" : se déclenche dès que le
  // joueur a posé 2 Pokémon de Base au banc (Carapuce + Salamèche dans
  // le scénario). Approche propre via useEffect au lieu du setTimeout
  // hack précédent.
  useEffect(() => {
    if (currentStep?.id === "set-bench" && state.self.bench.length >= 2) {
      advance();
    }
  }, [state.self.bench.length, currentStep?.id, advance]);

  if (!currentStep) {
    // Fin du tutoriel. À chaque commit on enrichira les steps ; ce screen
    // reste l'écran final qui crédite les 10 boosters via la RPC
    // complete_tcg_tutorial (idempotente côté serveur).
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-zinc-950 p-8 text-center text-zinc-100">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold text-amber-200">
          Bravo, tu maîtrises les bases !
        </h2>
        <p className="max-w-md text-sm text-zinc-300">
          Tu as appris : main de départ, Actif, Banc, énergie auto, attaques,
          faiblesses et combat tour par tour. Les mécaniques avancées
          (évolution, Trainer, status, EX, pile/face) seront ajoutées
          progressivement.
        </p>
        {!reviewMode && !alreadyCompleted && (
          <div className="rounded-lg border border-emerald-300/50 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.3)]">
            🎴 +10 boosters gratuits
          </div>
        )}
        {completionError && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            ⚠️ {completionError}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={validateAndGoToBoosters}
            disabled={completing}
            className="rounded-md border-2 border-emerald-300/70 bg-gradient-to-br from-emerald-500 to-emerald-700 px-6 py-3 text-sm font-extrabold text-emerald-50 shadow-[0_4px_18px_rgba(52,211,153,0.35)] transition-all hover:scale-[1.02] hover:from-emerald-400 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {completing
              ? "Enregistrement…"
              : reviewMode || alreadyCompleted
                ? "🎴 Retour aux boosters"
                : "🎴 Récupérer les 10 boosters"}
          </button>
          <Link
            href={`/play/tcg/${gameId}?skipTutorial=1`}
            className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10"
          >
            Aller au hub
          </Link>
          <button
            onClick={() => {
              setState(makeInitialState());
              setStepIdx(0);
            }}
            className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10"
          >
            Recommencer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-br from-zinc-900 via-emerald-950/30 to-zinc-950 p-4 text-zinc-100">
      {/* Header */}
      <header className="mb-3 flex items-center justify-between">
        <div className="text-sm font-bold text-amber-200">
          🎓 Tutoriel pratique Pokémon TCG
          {reviewMode && (
            <span className="ml-2 text-xs font-normal text-zinc-400">
              (revoir)
            </span>
          )}
        </div>
        <button
          onClick={skip}
          className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Passer
        </button>
      </header>

      {/* Bot side (haut) */}
      <BotBoard state={state} />

      <div className="mb-2 mt-2 h-px bg-white/10" />

      {/* Self side (bas) */}
      <SelfBoard
        state={state}
        currentStepId={currentStep.id}
        onSetActive={setActive}
        onAddBench={addToBench}
        onConfirm={confirmSetup}
        onAttachEnergy={attachEnergy}
        onAttack={attack}
        onEvolve={evolve}
        onEndTurn={endTurn}
      />

      {/* Coach overlay */}
      <CoachOverlay
        target={currentStep.target}
        title={currentStep.title}
        body={currentStep.body}
        currentStep={stepIdx + 1}
        totalSteps={totalSteps}
        nextLabel={currentStep.nextLabel ?? "Suivant →"}
        onNext={handleNext}
        onSkip={skip}
        bubblePosition={currentStep.bubblePosition ?? "auto"}
      />
    </div>
  );
}

/** Affichage simplifié du board adverse (Active + Bench, infos minimales). */
function BotBoard({ state }: { state: GameState }) {
  return (
    <div className="rounded-xl border-2 border-rose-400/30 bg-rose-950/20 p-3">
      <div className="mb-1 flex items-center gap-3 text-xs">
        <span className="font-bold text-rose-300">🤖 Bot Suprême</span>
        <span className="text-zinc-400">
          KO : {state.bot.koCount} / 3 · Main : {state.bot.hand.length} · Deck :{" "}
          {state.bot.deck.length}
        </span>
      </div>
      <div className="flex items-start gap-3">
        {/* Active adverse */}
        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-widest text-rose-300/80">
            Actif
          </div>
          {state.bot.active ? (
            <CardWithStats inPlay={state.bot.active} />
          ) : (
            <EmptySlot label="" small={false} />
          )}
        </div>
        {/* Bench adverse */}
        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-widest text-rose-300/80">
            Banc
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: 3 }, (_, i) => {
              const c = state.bot.bench[i];
              return c ? (
                <CardWithStats key={c.uid} inPlay={c} small />
              ) : (
                <EmptySlot key={i} label="" small />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Affichage du board joueur (Active + Bench + main + actions). */
function SelfBoard({
  state,
  currentStepId,
  onSetActive,
  onAddBench,
  onConfirm,
  onAttachEnergy,
  onAttack,
  onEvolve,
  onEndTurn,
}: {
  state: GameState;
  currentStepId: string;
  onSetActive: (handIdx: number) => void;
  onAddBench: (handIdx: number) => void;
  onConfirm: () => void;
  onAttachEnergy: (targetUid: string) => void;
  onAttack: (attackIdx: number) => void;
  onEvolve: (handIdx: number, targetUid: string) => void;
  onEndTurn: () => void;
}) {
  // Carte Pokémon Actif (pour afficher ses attaques dans le panneau).
  const activeCard = state.self.active
    ? getPokemonCard(state.self.active.cardId)
    : null;
  // Le panneau d'attaques apparaît dès qu'on est dans la phase de jeu
  // ET que la step le justifie (à partir de "attack-rules"). On garde
  // ainsi un onboarding propre : pas d'attaques visibles au tour 1
  // (l'user ne peut pas attaquer de toute façon).
  const showAttacksPanel =
    state.phase === "playing" &&
    state.activeSide === "self" &&
    state.turn >= 2 &&
    activeCard != null;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-bold text-emerald-300">🧑 Toi</span>
        <span className="text-zinc-400">
          KO : {state.self.koCount} / 3 · Main : {state.self.hand.length} ·
          Tour : {state.turn} · {state.activeSide === "self" ? "À toi" : "Bot joue…"}
        </span>
      </div>
      {/* Board (Actif + Bench + énergie pending + actions) */}
      <div
        className="flex items-start gap-3 rounded-xl border-2 border-emerald-400/30 bg-emerald-950/20 p-3"
        data-tutorial-target="self-board"
      >
        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-widest text-emerald-300/80">
            Actif
          </div>
          <div data-tutorial-target="active-zone">
            {state.self.active ? (
              <button
                onClick={() => state.self.pendingEnergy && onAttachEnergy(state.self.active!.uid)}
                className="cursor-pointer"
              >
                <CardWithStats inPlay={state.self.active} />
              </button>
            ) : (
              <EmptySlot label="Actif" small={false} />
            )}
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-widest text-emerald-300/80">
            Banc
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: 3 }, (_, i) => {
              const c = state.self.bench[i];
              return c ? (
                <button
                  key={c.uid}
                  onClick={() => state.self.pendingEnergy && onAttachEnergy(c.uid)}
                  className="cursor-pointer"
                >
                  <CardWithStats inPlay={c} small />
                </button>
              ) : (
                <EmptySlot key={i} label="Banc" small />
              );
            })}
          </div>
        </div>

        {/* Énergie pendante (si playing) */}
        {state.phase === "playing" && state.self.pendingEnergy && (
          <div
            data-tutorial-target="energy-pending"
            className="ml-auto flex flex-col items-center gap-1 rounded-lg border-2 border-amber-400/50 bg-amber-400/10 p-3"
          >
            <div className="text-[10px] uppercase tracking-widest text-amber-300">
              Énergie à attacher
            </div>
            <EnergyChip type={state.self.pendingEnergy} large />
            <div className="text-[10px] text-zinc-400">Clic sur un Pokémon</div>
          </div>
        )}

        {/* Panneau d'attaques (à partir du tour 2). Affiche les attaques
            de l'Actif avec coût + dégâts. Bouton désactivé si l'énergie
            ne suffit pas ou si on est dans une step où l'attaque n'est
            pas attendue (anti-clic accidentel pendant l'apprentissage). */}
        {showAttacksPanel && activeCard && state.self.active && (
          <div
            data-tutorial-target="attacks-panel"
            className="flex min-w-[180px] flex-col gap-1.5 rounded-lg border-2 border-rose-400/30 bg-rose-950/20 p-2"
          >
            <div className="text-[10px] uppercase tracking-widest text-rose-300/80">
              Attaques
            </div>
            {activeCard.attacks.map((a, i) => {
              const canPay = canPayCost(state.self.active!.attachedEnergies, a.cost);
              // On débloque le bouton uniquement aux steps d'attaque
              // explicites. Les autres steps empêchent les clics accidentels.
              const allowed =
                currentStepId === "launch-attack" ||
                currentStepId === "launch-tonnerre";
              const disabled = !canPay || !allowed;
              return (
                <button
                  key={i}
                  data-tutorial-target={`attack-btn-${i}`}
                  disabled={disabled}
                  onClick={() => onAttack(i)}
                  className={`flex items-center justify-between gap-2 rounded-md border-2 px-2 py-1.5 text-left text-xs transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                    disabled
                      ? "border-rose-400/20 bg-rose-500/5 text-rose-300/60"
                      : "border-rose-400/60 bg-rose-500/15 text-rose-50 shadow-md hover:scale-[1.02] hover:bg-rose-500/25"
                  }`}
                  title={a.text ?? a.name}
                >
                  <div className="flex items-center gap-0.5">
                    {a.cost.map((c, j) => (
                      <EnergyChip key={j} type={c} small />
                    ))}
                  </div>
                  <span className="flex-1 truncate font-bold">{a.name}</span>
                  {a.damage !== undefined && (
                    <span className="text-base font-black tabular-nums text-amber-300">
                      {a.damage}
                      {a.damageSuffix ?? ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Bouton fin de tour */}
        {state.phase === "playing" && state.activeSide === "self" && (
          <div className="ml-auto flex flex-col gap-2">
            <button
              data-tutorial-target="end-turn-btn"
              onClick={onEndTurn}
              className="rounded-md bg-gradient-to-br from-amber-400 to-amber-600 px-4 py-2 text-sm font-bold text-amber-950 shadow hover:from-amber-300"
            >
              🏁 Fin du tour
            </button>
          </div>
        )}

        {/* Bouton confirmer setup */}
        {state.phase === "setup" && state.self.active && (
          <button
            data-tutorial-target="confirm-setup-btn"
            onClick={onConfirm}
            className="ml-auto rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 px-4 py-2 text-sm font-bold text-emerald-950 shadow hover:from-emerald-300"
          >
            ✓ Confirmer mon équipe
          </button>
        )}
      </div>

      {/* Main + indicateur de deck (pour les step "draw-turn-2"). */}
      <div
        data-tutorial-target="hand"
        className="flex items-center gap-2 rounded-xl border-2 border-amber-400/30 bg-amber-950/10 p-3"
      >
        <div className="flex flex-col items-center gap-0.5 self-center">
          <div
            data-tutorial-target="self-deck"
            className="flex h-12 w-9 items-center justify-center rounded border-2 border-indigo-400/40 bg-gradient-to-br from-indigo-900 to-indigo-700 text-[10px] font-bold text-indigo-100 shadow"
            title="Pioche"
          >
            🂠 {state.self.deck.length}
          </div>
          <span className="text-[8px] uppercase tracking-widest text-indigo-300/70">
            Deck
          </span>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-amber-300/80 self-center">
          Main ({state.self.hand.length})
        </div>
        <AnimatePresence mode="popLayout">
          {state.self.hand.map((cardId, idx) => {
            const meta = POKEMON_BASE_SET_BY_ID.get(cardId);
            if (!meta) return null;
            const isBasic = meta.kind === "pokemon" && meta.stage === "basic";
            const isEvolution =
              meta.kind === "pokemon" && meta.stage !== "basic";
            // Détermine si on peut faire évoluer un Pokémon en jeu avec
            // cette carte (la cible doit avoir le bon nom dans
            // evolvesFrom). Pour le tutoriel : Raichu peut évoluer Pikachu
            // si Pikachu est en Actif/Bench.
            const evolveTargetUid: string | null =
              isEvolution && meta.evolvesFrom && state.phase === "playing"
                ? findEvolveTarget(state, meta.evolvesFrom)
                : null;
            // Une carte est "jouable" si :
            //  - phase setup : c'est un Basic (pour Actif/Banc)
            //  - phase playing : c'est un Basic (banc) OU une évolution
            //    avec une cible valide en jeu OU un trainer (cliquable
            //    pour effet — pas implémenté pour tous, juste display).
            const canPlay =
              (state.phase === "setup" && isBasic) ||
              (state.phase === "playing" &&
                (isBasic || evolveTargetUid != null));
            return (
              <motion.button
                layout
                key={`${cardId}-${idx}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onClick={() => {
                  if (state.phase === "setup") {
                    if (!state.self.active) onSetActive(idx);
                    else if (isBasic && state.self.bench.length < 3)
                      onAddBench(idx);
                  } else if (state.phase === "playing") {
                    if (isEvolution && evolveTargetUid) {
                      onEvolve(idx, evolveTargetUid);
                    }
                    // Autres trainer/basic cards : non gérés ici (clic
                    // ignoré silencieusement — l'overlay coach guide
                    // l'user vers les bonnes actions).
                  }
                }}
                disabled={!canPlay}
                data-tutorial-target={`hand-card-${cardId}`}
                className={`relative flex h-44 w-32 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                  canPlay
                    ? "border-emerald-400/60 hover:scale-[1.05] hover:border-emerald-300"
                    : "border-zinc-700 opacity-60"
                }`}
                title={meta.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={meta.image}
                  alt={meta.name}
                  className="h-full w-full object-contain"
                />
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Mini carte affichée sur le board. Variante "stats" qui ajoute la
 *  HP bar et les énergies attachées en dessous. */
function CardMini({ cardId, small }: { cardId: string; small?: boolean }) {
  const meta = POKEMON_BASE_SET_BY_ID.get(cardId);
  if (!meta) return null;
  return (
    <div
      className={`overflow-hidden rounded border-2 border-white/10 ${
        small ? "h-32 w-24" : "h-48 w-36"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={(meta as PokemonCardData).image}
        alt={meta.name}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

/** Carte avec stats : HP bar + énergies attachées. Utilisée sur le board.
 *  Affiche aussi un flash "+N" éphémère quand les dégâts augmentent
 *  (feedback visuel pour les attaques + poison). */
function CardWithStats({
  inPlay,
  small,
}: {
  inPlay: InPlay;
  small?: boolean;
}) {
  const meta = getPokemonCard(inPlay.cardId);
  // Track le précédent damage pour calculer le delta. La popup +N
  // flotte 1.2s puis disparaît via AnimatePresence (clé = damage val).
  const prevDamageRef = useRef(inPlay.damage);
  const [flashDelta, setFlashDelta] = useState<{ delta: number; key: number } | null>(
    null,
  );
  useEffect(() => {
    const prev = prevDamageRef.current;
    // ⚠ Important : on update prev AVANT le return de la branche if,
    // sinon le prev reste figé à 0 et tous les flash suivants seraient
    // calculés depuis zéro (delta cumulatif au lieu d'incrémental).
    prevDamageRef.current = inPlay.damage;
    if (inPlay.damage > prev) {
      const delta = inPlay.damage - prev;
      setFlashDelta({ delta, key: Date.now() });
      const t = setTimeout(() => setFlashDelta(null), 1200);
      return () => clearTimeout(t);
    }
  }, [inPlay.damage]);
  if (!meta) return null;
  const hp = meta.hp;
  const remaining = Math.max(0, hp - inPlay.damage);
  const pct = Math.max(0, Math.min(100, (remaining / hp) * 100));
  const koed = remaining === 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <CardMini cardId={inPlay.cardId} small={small} />
        {/* HP bar overlay en bas de la carte. */}
        <div className="absolute inset-x-1 bottom-1 flex flex-col gap-0.5 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-zinc-100 shadow">
          <div className="flex items-center justify-between">
            <span>PV</span>
            <span className={koed ? "text-rose-400" : "text-emerald-300"}>
              {remaining}/{hp}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-700">
            <motion.div
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4 }}
              className={`h-full ${
                pct > 50
                  ? "bg-emerald-400"
                  : pct > 20
                    ? "bg-amber-400"
                    : "bg-rose-500"
              }`}
            />
          </div>
        </div>
        {/* Flash KO si pkmn out (Acte 3+). */}
        {koed && (
          <div className="absolute inset-0 flex items-center justify-center rounded bg-black/60 text-2xl">
            💀
          </div>
        )}
        {/* Statut(s) en haut-gauche : poison ☠️, sommeil 💤, etc. */}
        {inPlay.statuses.length > 0 && (
          <div className="absolute left-0.5 top-0.5 flex flex-wrap gap-0.5">
            {inPlay.statuses.map((s, i) => (
              <span
                key={i}
                className="rounded bg-purple-700 px-1 py-0.5 text-[10px] font-bold text-white shadow ring-1 ring-purple-300/50"
                title={s}
              >
                {statusEmoji(s)}
              </span>
            ))}
          </div>
        )}
        {/* Flash damage : +N qui flotte vers le haut puis disparaît. */}
        <AnimatePresence>
          {flashDelta && (
            <motion.div
              key={flashDelta.key}
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: -20, scale: 1.2 }}
              exit={{ opacity: 0, y: -40, scale: 1 }}
              transition={{ duration: 1.2 }}
              className="pointer-events-none absolute inset-x-0 top-1/3 flex items-center justify-center text-2xl font-black text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.9)]"
            >
              -{flashDelta.delta}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Énergies attachées sous la carte. */}
      {inPlay.attachedEnergies.length > 0 && (
        <div className="flex flex-wrap justify-center gap-0.5">
          {inPlay.attachedEnergies.map((e, i) => (
            <EnergyChip key={i} type={e} small={small} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Slot vide (Actif/Banc pas rempli). */
function EmptySlot({ label, small }: { label: string; small?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded border-2 border-dashed border-white/10 text-[10px] text-zinc-500 ${
        small ? "h-32 w-24" : "h-48 w-36"
      }`}
    >
      {label}
    </div>
  );
}

/** Emoji pour un status (poison, sommeil, paralysie, confusion, brûlé). */
function statusEmoji(s: string): string {
  switch (s) {
    case "poison":
      return "☠️";
    case "asleep":
      return "💤";
    case "paralyzed":
      return "🌀";
    case "confused":
      return "❓";
    case "burned":
      return "🔥";
    default:
      return "⚠️";
  }
}

/** Pastille énergie. */
function EnergyChip({
  type,
  large,
  small,
}: {
  type: PokemonEnergyType;
  large?: boolean;
  small?: boolean;
}) {
  const bg: Record<PokemonEnergyType, string> = {
    fire: "bg-red-500",
    water: "bg-sky-500",
    grass: "bg-emerald-500",
    lightning: "bg-yellow-400",
    psychic: "bg-purple-500",
    fighting: "bg-amber-700",
    darkness: "bg-zinc-800",
    metal: "bg-slate-400",
    dragon: "bg-violet-600",
    colorless: "bg-zinc-300",
    fairy: "bg-pink-400",
  };
  const icon: Record<PokemonEnergyType, string> = {
    fire: "🔥",
    water: "💧",
    grass: "🌿",
    lightning: "⚡",
    psychic: "🌀",
    fighting: "👊",
    darkness: "🌑",
    metal: "⚙️",
    dragon: "🐲",
    colorless: "⭐",
    fairy: "🧚",
  };
  const sizeClass = large
    ? "h-10 w-10 text-base"
    : small
      ? "h-4 w-4 text-[8px]"
      : "h-5 w-5 text-[10px]";
  return (
    <span
      className={`flex items-center justify-center rounded-full font-bold shadow ring-1 ring-white/30 ${bg[type]} ${sizeClass}`}
      title={type}
    >
      {icon[type]}
    </span>
  );
}
