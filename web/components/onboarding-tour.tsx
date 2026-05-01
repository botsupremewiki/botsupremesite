"use client";

/**
 * Onboarding tour : popover spotlight qui guide le premier user à
 * travers les concepts clés du site (plaza, portails, monnaie, profil).
 *
 * Activation : si l'user n'a pas onboarded_at sur son profile, on
 * monte ce composant et il affiche les étapes une par une. À la fin
 * (ou si "Skip"), appelle complete_onboarding() RPC.
 *
 * Pas de targeting d'éléments DOM (compliqué avec rerenders) — c'est
 * juste une série de modals plein écran centrés.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

const STEPS = [
  {
    icon: "🏛️",
    title: "Bienvenue sur Site Ultime !",
    body: "Tu débarques dans la plaza centrale, un univers 2D où tu peux croiser d'autres joueurs. Marche avec les flèches du clavier ou en cliquant.",
  },
  {
    icon: "🚪",
    title: "Les portails",
    body: "Approche d'un portail coloré pour entrer dans un mini-jeu : Casino, RPG, jeu de cartes, Tycoon, etc. Chaque jeu est connecté à la même progression globale.",
  },
  {
    icon: "🪙",
    title: "L'Or Suprême",
    body: "C'est la monnaie commune à tout le site. Tu en gagnes en jouant, et tu peux la dépenser dans tous les jeux (boosters, mises de casino, achats RPG…). Tu reçois 1 000 OS de bienvenue.",
  },
  {
    icon: "🎯",
    title: "Quêtes & récompenses",
    body: "Page Objectifs : récompense quotidienne (streak), achievements, coffres bonus J7/J14/J30. Reviens chaque jour pour encaisser !",
  },
  {
    icon: "⌘K",
    title: "Astuce navigation",
    body: "Cmd+K (ou Ctrl+K sur PC) ouvre une palette de recherche pour aller direct sur n'importe quelle page. Pratique quand tu connais bien le site.",
  },
  {
    icon: "🎉",
    title: "À toi de jouer !",
    body: "Tu connais l'essentiel. Le mieux est d'explorer librement. Si tu te perds, l'aide est sur /help.",
  },
];

export function OnboardingTour({ active }: { active: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(active);

  async function complete() {
    const supabase = createClient();
    if (supabase) {
      try {
        await supabase.rpc("complete_onboarding");
      } catch {
        // ignore
      }
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) return null;

  const isLast = step >= STEPS.length - 1;
  const current = STEPS[step];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4 backdrop-blur"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <motion.div
          key={step}
          initial={{ scale: 0.95, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md rounded-2xl border border-amber-300/40 bg-gradient-to-b from-zinc-950 to-zinc-900 p-6 shadow-2xl"
        >
          <div className="text-center">
            <div className="text-6xl" aria-hidden="true">
              {current.icon}
            </div>
            <h2
              id="onboarding-title"
              className="mt-3 text-xl font-bold text-amber-100"
            >
              {current.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              {current.body}
            </p>
          </div>
          {/* Progress dots */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Étape ${i + 1}`}
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
          {/* Navigation */}
          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={complete}
              className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Passer le tour
            </button>
            <div className="flex gap-2">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/10"
                >
                  ← Précédent
                </button>
              ) : null}
              {isLast ? (
                <button
                  type="button"
                  onClick={complete}
                  className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-4 py-1.5 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20"
                >
                  Terminer 🎉
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
                >
                  Suivant →
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
