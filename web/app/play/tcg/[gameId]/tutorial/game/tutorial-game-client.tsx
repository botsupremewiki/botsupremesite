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

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import type { PokemonCardData, PokemonEnergyType } from "@shared/types";
import { createClient } from "@/lib/supabase/client";
import { CoachOverlay } from "@/components/coach-overlay";
import {
  TUTORIAL_BOT_DECK,
  TUTORIAL_PLAYER_DECK,
  TUTORIAL_STEPS,
  type TutorialStep,
} from "./tutorial-script";

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
    // Avance step "set-bench" si on a posé au moins 1 carte
    setTimeout(() => {
      setState((s) => {
        if (currentStep?.id === "set-bench" && s.self.bench.length >= 2) {
          advance();
        }
        return s;
      });
    }, 0);
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
    if (currentStep?.id === "attach-first-energy") advance();
  }

  /** Termine le tour du joueur. */
  function endTurn() {
    if (currentStep?.id === "end-turn-1") advance();
    // (Le tour bot sera géré dans Acte 2 — pour l'instant on s'arrête ici.)
  }

  // Détecte les conditions de validation auto pour les steps qui s'avancent
  // sur une condition state (et pas un bouton "Suivant").
  // On utilise un useEffect-equivalent inline via useMemo pour ne pas
  // re-executer à chaque render. Ici on s'appuie sur les avances explicites
  // dans setActive/addToBench/etc.

  if (!currentStep) {
    // Fin du tutoriel (pour ce commit : Acte 1 uniquement). À chaque commit
    // suivant on enrichira les steps ; ce screen reste l'écran final qui
    // crédite les 10 boosters via complete_tcg_tutorial (idempotent).
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-zinc-950 p-8 text-center text-zinc-100">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold text-amber-200">
          Acte 1 terminé !
        </h2>
        <p className="max-w-md text-sm text-zinc-300">
          Tu as appris les bases : main de départ, Actif, Banc, énergie auto.
          Les actes suivants (combat, évolution, Trainer, status, EX) seront
          ajoutés progressivement.
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
        onSetActive={setActive}
        onAddBench={addToBench}
        onConfirm={confirmSetup}
        onAttachEnergy={attachEnergy}
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
        onNext={advance}
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
          KO : {state.bot.koCount} / 3 · Main : {state.bot.hand.length}
        </span>
      </div>
      <div className="flex items-start gap-3">
        {/* Active adverse */}
        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-widest text-rose-300/80">
            Actif
          </div>
          {state.bot.active ? (
            <CardMini cardId={state.bot.active.cardId} />
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
                <CardMini key={c.uid} cardId={c.cardId} small />
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
  onSetActive,
  onAddBench,
  onConfirm,
  onAttachEnergy,
  onEndTurn,
}: {
  state: GameState;
  onSetActive: (handIdx: number) => void;
  onAddBench: (handIdx: number) => void;
  onConfirm: () => void;
  onAttachEnergy: (targetUid: string) => void;
  onEndTurn: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3">
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
                <CardMini cardId={state.self.active.cardId} />
                {state.self.active.attachedEnergies.length > 0 && (
                  <div className="mt-1 flex justify-center gap-0.5">
                    {state.self.active.attachedEnergies.map((e, i) => (
                      <EnergyChip key={i} type={e} />
                    ))}
                  </div>
                )}
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
                  <CardMini cardId={c.cardId} small />
                  {c.attachedEnergies.length > 0 && (
                    <div className="mt-1 flex justify-center gap-0.5">
                      {c.attachedEnergies.map((e, j) => (
                        <EnergyChip key={j} type={e} small />
                      ))}
                    </div>
                  )}
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

      {/* Main */}
      <div
        data-tutorial-target="hand"
        className="flex gap-2 rounded-xl border-2 border-amber-400/30 bg-amber-950/10 p-3"
      >
        <div className="text-[10px] uppercase tracking-widest text-amber-300/80 self-center">
          Main ({state.self.hand.length})
        </div>
        <AnimatePresence mode="popLayout">
          {state.self.hand.map((cardId, idx) => {
            const meta = POKEMON_BASE_SET_BY_ID.get(cardId);
            if (!meta) return null;
            const isBasic = meta.kind === "pokemon" && meta.stage === "basic";
            const canPlay =
              isBasic && (state.phase === "setup" || state.phase === "playing");
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

/** Mini carte affichée sur le board. */
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
