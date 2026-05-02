"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Step = {
  title: string;
  body: string;
  visual: React.ReactNode;
};

const STEPS_POKEMON: Step[] = [
  {
    title: "Bienvenue dans le TCG Pokémon Pocket",
    body: "Tu vas affronter d'autres dresseurs avec un deck de 20 cartes. Le but : mettre KO 3 Pokémon de ton adversaire avant qu'il ne fasse pareil. Pas de chance pure : c'est la stratégie qui décide.",
    visual: <BoardMockup phase="intro" />,
  },
  {
    title: "Le deck — 20 cartes, max 2 du même nom",
    body: "Tu construis un deck de 20 cartes (Pokémon + cartes Dresseur). Tu ne peux pas avoir plus de 2 exemplaires d'une même carte. Au début du match, tu piochias 5 cartes de la main de départ.",
    visual: <BoardMockup phase="deck" />,
  },
  {
    title: "L'énergie auto",
    body: "Chaque tour, tu reçois automatiquement 1 énergie d'un type aléatoire parmi ceux que ton deck déclare. Tu peux l'attacher à ton Pokémon Actif ou à un Pokémon de ton banc. Sans énergie, pas d'attaque !",
    visual: <BoardMockup phase="energy" />,
  },
  {
    title: "Le Pokémon Actif et le banc",
    body: "Tu as 1 Pokémon Actif (au front) et jusqu'à 3 Pokémon de banc (en réserve). Le banc te permet d'évoluer et de remplacer ton actif s'il est KO. Pour échanger, paye le coût de retraite (énergies à défausser).",
    visual: <BoardMockup phase="bench" />,
  },
  {
    title: "Évolution",
    body: "Un Pokémon Stage 1 / Stage 2 doit évoluer depuis sa forme précédente, déjà en jeu depuis ≥1 tour. Évoluer guérit toutes les altérations (Sommeil, Paralysie...) et permet d'utiliser sa nouvelle attaque.",
    visual: <BoardMockup phase="evolve" />,
  },
  {
    title: "Attaquer et infliger des dégâts",
    body: "Si tu as les énergies requises sur ton actif, choisis une attaque. Les dégâts sont réduits par les résistances (-20) ou doublés par les faiblesses. Quand un Pokémon atteint 0 PV, il est KO.",
    visual: <BoardMockup phase="attack" />,
  },
  {
    title: "Les points de victoire",
    body: "Mettre KO un Pokémon = 1 point. Mettre KO un Pokémon EX = 2 points. Le premier à 3 points gagne. Tu peux aussi gagner si l'adversaire ne peut plus jouer (deck vide ou aucun Pokémon en jeu).",
    visual: <BoardMockup phase="victory" />,
  },
  {
    title: "À toi de jouer !",
    body: "Tu as les bases. Le mieux est d'apprendre en jouant : commence contre le Bot Suprême (12 decks préfaits qui s'adaptent à ton style) puis affronte de vrais joueurs. Bon match ! 🎮",
    visual: <BoardMockup phase="ready" />,
  },
];

export function TutorialClient({
  gameId,
  isLoggedIn,
  alreadyCompleted,
}: {
  gameId: string;
  isLoggedIn: boolean;
  alreadyCompleted: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(alreadyCompleted);
  const [reward, setReward] = useState<{ gold: number; packs: number } | null>(
    null,
  );

  // Pour l'instant on n'a que pokemon — on duplique pour les autres jeux.
  const steps = STEPS_POKEMON;
  const isLast = step >= steps.length - 1;

  async function complete() {
    setCompleting(true);
    if (!isLoggedIn) {
      setCompleted(true);
      setCompleting(false);
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setCompleted(true);
      setCompleting(false);
      return;
    }
    const { data } = await supabase.rpc("complete_tcg_tutorial", {
      p_game_id: gameId,
    });
    setCompleting(false);
    setCompleted(true);
    const r = data as
      | { first_time: boolean; reward_gold: number; reward_packs?: number }
      | null;
    if (r?.first_time) {
      setReward({ gold: r.reward_gold, packs: r.reward_packs ?? 0 });
    }
    router.refresh();
  }

  if (completed) {
    const gotPacks = reward && reward.packs > 0;
    return (
      <div className="rounded-xl border border-emerald-400/40 bg-gradient-to-b from-emerald-400/10 to-emerald-400/5 p-8 text-center">
        <div className="text-6xl">🎓</div>
        <h2 className="mt-3 text-2xl font-bold text-emerald-200">
          Tutoriel terminé !
        </h2>
        <p className="mt-2 text-sm text-zinc-300">
          Tu connais maintenant les règles essentielles.
          {gotPacks && (
            <>
              {" "}
              Voici tes <strong className="text-amber-200">10 boosters
              gratuits</strong> pour bien démarrer ta collection !
            </>
          )}
        </p>
        {reward ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <div className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-200">
              🎁 +{reward.gold} OS
            </div>
            {gotPacks && (
              <div className="rounded-lg border border-emerald-300/50 bg-emerald-400/15 px-4 py-3 text-sm font-bold text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.3)]">
                🎴 +{reward.packs} boosters gratuits
              </div>
            )}
          </div>
        ) : alreadyCompleted ? (
          <div className="mt-4 text-xs text-zinc-500">
            Tu avais déjà complété ce tutoriel — pas de récompense bonus
            cette fois.
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {gotPacks && (
            <Link
              href={`/play/tcg/${gameId}/boosters`}
              className="rounded-md border-2 border-emerald-300/70 bg-gradient-to-br from-emerald-500 to-emerald-700 px-5 py-3 text-base font-extrabold text-emerald-50 shadow-[0_4px_18px_rgba(52,211,153,0.35)] transition-all hover:scale-[1.02] hover:from-emerald-400 hover:to-emerald-600"
            >
              🎴 Accéder aux boosters
            </Link>
          )}
          <Link
            href={`/play/tcg/${gameId}?skipTutorial=1`}
            className="rounded-md border border-white/20 bg-white/[0.03] px-4 py-3 text-sm text-zinc-200 transition-colors hover:bg-white/[0.07]"
          >
            🏠 Continuer vers le hub
          </Link>
          <Link
            href={`/play/tcg/${gameId}/battle/bot`}
            className="rounded-md border border-amber-400/60 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-400/20"
          >
            🤖 Match contre le Bot
          </Link>
          <Link
            href={`/play/tcg/${gameId}/decks`}
            className="rounded-md border border-white/20 bg-white/[0.03] px-4 py-3 text-sm text-zinc-200 transition-colors hover:bg-white/[0.07]"
          >
            🃏 Mes decks
          </Link>
        </div>
      </div>
    );
  }

  const current = steps[step];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">🎓 Tutoriel</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Étape {step + 1} / {steps.length}
          </p>
        </div>
        <Link
          href={`/play/tcg/${gameId}?skipTutorial=1`}
          className="text-xs text-zinc-400 transition-colors hover:text-zinc-100"
          title="Quitter le tutoriel sans le compléter (pas de récompense)"
        >
          Passer →
        </Link>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-bold text-zinc-100">
            {current.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            {current.body}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          {current.visual}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.07] disabled:opacity-30"
        >
          ← Précédent
        </button>
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${
                i === step
                  ? "w-8 bg-amber-400"
                  : i < step
                    ? "w-2 bg-emerald-400"
                    : "w-2 bg-white/20"
              }`}
            />
          ))}
        </div>
        {isLast ? (
          <button
            type="button"
            disabled={completing}
            onClick={complete}
            className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
          >
            {completing ? "…" : "Terminer 🎉"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
          >
            Suivant →
          </button>
        )}
      </div>
    </div>
  );
}

// Petit visuel emoji-based pour illustrer chaque étape sans dépendre
// d'images externes ni de Pixi. Suffisant pour donner une idée visuelle.
function BoardMockup({ phase }: { phase: string }) {
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-indigo-900/40 to-violet-900/40 p-4">
      {phase === "intro" ? (
        <>
          <div className="text-5xl">⚔️</div>
          <div className="text-sm text-zinc-300">Toi vs Adversaire</div>
        </>
      ) : phase === "deck" ? (
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 20 }, (_, i) => (
            <div
              key={i}
              className="h-12 w-8 rounded border border-amber-300/30 bg-amber-300/10"
            />
          ))}
        </div>
      ) : phase === "energy" ? (
        <div className="flex items-center gap-3">
          <div className="text-4xl">⚡</div>
          <div className="text-3xl">→</div>
          <div className="flex h-20 w-14 flex-col items-center justify-center rounded border border-yellow-300/40 bg-yellow-300/10">
            <span className="text-2xl">🐹</span>
            <span className="mt-1 text-[9px] text-yellow-200">+1⚡</span>
          </div>
        </div>
      ) : phase === "bench" ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-20 w-14 items-center justify-center rounded border-2 border-amber-300/60 bg-amber-300/10">
            <span className="text-2xl">⭐</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">
            Actif
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex h-16 w-12 items-center justify-center rounded border border-white/20 bg-white/5"
              >
                <span className="text-lg">🪺</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">
            Banc (max 3)
          </div>
        </div>
      ) : phase === "evolve" ? (
        <div className="flex items-center gap-2">
          <div className="flex h-16 w-12 items-center justify-center rounded border border-emerald-300/40 bg-emerald-300/10">
            <span className="text-xl">🌱</span>
          </div>
          <div className="text-2xl">→</div>
          <div className="flex h-16 w-12 items-center justify-center rounded border border-emerald-300/60 bg-emerald-300/20">
            <span className="text-xl">🌳</span>
          </div>
          <div className="text-2xl">→</div>
          <div className="flex h-16 w-12 items-center justify-center rounded border-2 border-emerald-300/80 bg-emerald-300/30">
            <span className="text-xl">🌲</span>
          </div>
        </div>
      ) : phase === "attack" ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-16 w-12 items-center justify-center rounded border border-amber-300/60 bg-amber-300/10">
              <span className="text-xl">🐹</span>
            </div>
            <div className="text-3xl">💥</div>
            <div className="flex h-16 w-12 items-center justify-center rounded border border-rose-300/60 bg-rose-300/10">
              <span className="text-xl">🪲</span>
            </div>
          </div>
          <div className="text-xs text-rose-300">−40 PV</div>
        </div>
      ) : phase === "victory" ? (
        <div className="flex flex-col items-center gap-2">
          <div className="text-5xl">🏆</div>
          <div className="flex gap-2">
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-black">
              1
            </span>
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-black">
              2
            </span>
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-black">
              3
            </span>
          </div>
          <div className="text-xs text-amber-200">3 KO = victoire</div>
        </div>
      ) : (
        <>
          <div className="text-5xl">🎮</div>
          <div className="text-sm font-bold text-emerald-200">
            Prêt à jouer !
          </div>
        </>
      )}
    </div>
  );
}
