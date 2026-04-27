"use client";

import { useState } from "react";

type Step = {
  id: string;
  label: string;
  done: boolean;
  hint: string;
};

export function TutorialBanner({
  hasUpgradedField,
  hasRecruitedUnits,
  hasRaided,
}: {
  hasUpgradedField: boolean;
  hasRecruitedUnits: boolean;
  hasRaided: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  const steps: Step[] = [
    {
      id: "field",
      label: "Monte un champ au niveau 2",
      done: hasUpgradedField,
      hint: "Clique sur un champ (bûcheron, glaisière, mine, ferme) ci-dessous et upgrade-le.",
    },
    {
      id: "recruit",
      label: "Recrute 5 unités d'infanterie de base",
      done: hasRecruitedUnits,
      hint: "Construis une caserne dans le centre, puis va sur ⚔️ Militaire et recrute 5 légionnaires/maraudeurs/templiers.",
    },
    {
      id: "raid",
      label: "Pille une ferme barbare",
      done: hasRaided,
      hint: "Va sur 🗺️ Carte, clique sur une case orange ⚔ proche, sélectionne raid et envoie tes unités.",
    },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone || dismissed) return null;

  return (
    <section className="rounded-xl border border-sky-400/40 bg-sky-500/5 p-4 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold text-sky-200">📚 Premiers pas</span>
        <button
          onClick={() => setDismissed(true)}
          className="text-zinc-500 hover:text-zinc-300"
          title="Masquer"
        >
          ×
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={`flex items-start gap-2 ${
              s.done ? "opacity-50" : ""
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                s.done
                  ? "bg-emerald-500/30 text-emerald-200"
                  : "bg-sky-500/30 text-sky-200"
              }`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <div>
              <div
                className={
                  s.done
                    ? "line-through text-zinc-400"
                    : "text-zinc-100"
                }
              >
                {s.label}
              </div>
              {!s.done && (
                <div className="mt-0.5 text-[10px] text-zinc-500">
                  {s.hint}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
