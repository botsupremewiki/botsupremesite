"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const STEP_ID = "plaza-welcome";

type Slide = {
  glyph: string;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    glyph: "👋",
    title: "Bienvenue sur le Site Ultime !",
    body: "C'est la plaza centrale. Tu peux te déplacer en cliquant sur le sol et chatter avec les autres joueurs en bas.",
  },
  {
    glyph: "🚪",
    title: "Choisis ton aventure",
    body: "Chaque portail mène à un mini-jeu : ⚔️ Eternum (RPG idle), 🎰 Casino, 🃏 TCG, 🏰 Imperium (gestion), 🏙️ Skyline (build).",
  },
  {
    glyph: "💰",
    title: "Or Suprême",
    body: "Une seule monnaie partout : l'Or Suprême (OS). Gagnée et dépensée dans tous les jeux. Suis ton solde dans le coin haut-droit.",
  },
  {
    glyph: "🔔",
    title: "Notifications & Profil",
    body: "Cloche en haut à droite pour tes notifications. Clique sur ton avatar pour voir ton profil et tes achievements.",
  },
  {
    glyph: "🚀",
    title: "C'est parti !",
    body: "Marche vers un portail pour entrer dans un jeu. Bonne aventure !",
  },
];

export function PlazaOnboarding() {
  const supabase = useMemo(() => createClient(), []);
  const [shouldShow, setShouldShow] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  // Vérifier si déjà fait.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("onboarding_state")
        .select("steps_done")
        .maybeSingle();
      if (cancelled) return;
      const done = (data?.steps_done as string[] | undefined) ?? [];
      if (!done.includes(STEP_ID)) setShouldShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function finish() {
    setShouldShow(false);
    if (!supabase) return;
    await supabase.rpc("onboarding_done", { p_step: STEP_ID });
  }

  if (!shouldShow) return null;
  const slide = SLIDES[stepIdx];
  const isLast = stepIdx === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-amber-400/40 bg-zinc-950 p-6 shadow-2xl shadow-amber-500/20">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full ${
                  i === stepIdx
                    ? "bg-amber-400"
                    : i < stepIdx
                      ? "bg-amber-400/40"
                      : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <button
            onClick={finish}
            className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
          >
            Passer
          </button>
        </div>

        <div className="text-center">
          <div className="text-6xl">{slide.glyph}</div>
          <div className="mt-3 text-xl font-bold text-amber-200">
            {slide.title}
          </div>
          <div className="mt-2 text-sm text-zinc-300">{slide.body}</div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
            className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.07] disabled:opacity-30"
          >
            ← Précédent
          </button>
          {isLast ? (
            <button
              onClick={finish}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400"
            >
              Commencer 🚀
            </button>
          ) : (
            <button
              onClick={() => setStepIdx((i) => i + 1)}
              className="rounded-md bg-amber-500/80 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400"
            >
              Suivant →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
