"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TutorialStep = {
  id: string;
  glyph: string;
  title: string;
  description: string;
  href?: string;
  isComplete: boolean;
};

export function TutorialPanel({
  companiesCount,
  cash,
  hasEmployee,
  hasIpo,
  hasHolding,
  hasTrainedSkill,
}: {
  companiesCount: number;
  cash: number;
  hasEmployee: boolean;
  hasIpo: boolean;
  hasHolding: boolean;
  hasTrainedSkill: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tid = setTimeout(() => {
      if (localStorage.getItem("skyline-tutorial-hidden") === "1") {
        setHidden(true);
      }
      if (localStorage.getItem("skyline-tutorial-collapsed") === "1") {
        setCollapsed(true);
      }
    }, 0);
    return () => clearTimeout(tid);
  }, []);

  const handleHide = () => {
    setHidden(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("skyline-tutorial-hidden", "1");
    }
  };

  const handleToggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("skyline-tutorial-collapsed", next ? "1" : "0");
    }
  };

  const steps: TutorialStep[] = [
    {
      id: "create_company",
      glyph: "🏢",
      title: "Créer ta première entreprise",
      description: "Choisis un secteur (commerce, usine, matière 1ère ou service) et démarre.",
      href: "/play/skyline/creation",
      isComplete: companiesCount > 0,
    },
    {
      id: "hire_employee",
      glyph: "👥",
      title: "Embaucher ton premier employé",
      description: "Va sur le marché de l'emploi pour booster ta capacité.",
      href: "/play/skyline/emploi",
      isComplete: hasEmployee,
    },
    {
      id: "train_skill",
      glyph: "🎓",
      title: "Te former à une compétence",
      description: "Apprends pour augmenter la qualité de tes services.",
      href: "/play/skyline/apprentissage",
      isComplete: hasTrainedSkill,
    },
    {
      id: "5_companies",
      glyph: "🏗️",
      title: "Posséder 5 entreprises",
      description: "Diversifie ton empire pour débloquer les holdings.",
      href: "/play/skyline/creation",
      isComplete: companiesCount >= 5,
    },
    {
      id: "create_holding",
      glyph: "🏛️",
      title: "Créer une holding",
      description: "Centralise ta trésorerie et transfère du cash entre filiales.",
      href: "/play/skyline/holdings",
      isComplete: hasHolding,
    },
    {
      id: "ipo",
      glyph: "📈",
      title: "Introduire une boîte en bourse",
      description: "Vise une valorisation > 5M$ pour ton IPO.",
      href: "/play/skyline/bourse",
      isComplete: hasIpo,
    },
    {
      id: "millionaire",
      glyph: "💎",
      title: "Devenir millionnaire",
      description: "Atteindre 1M$ de patrimoine total.",
      href: "/play/skyline/classement",
      isComplete: cash >= 1000000,
    },
  ];

  if (hidden) return null;

  const completed = steps.filter((s) => s.isComplete).length;
  const total = steps.length;
  const nextStep = steps.find((s) => !s.isComplete);

  return (
    <div className="rounded-xl border border-fuchsia-400/40 bg-black/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fuchsia-200">
          🎓 Tutoriel ({completed} / {total})
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleToggle}
            className="text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            {collapsed ? "Déplier" : "Replier"}
          </button>
          <button
            onClick={handleHide}
            className="text-[10px] text-zinc-500 hover:text-rose-300"
          >
            Masquer
          </button>
        </div>
      </div>

      {/* Progression */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-400"
          style={{ width: `${(completed / total) * 100}%` }}
        />
      </div>

      {!collapsed ? (
        <>
          {nextStep ? (
            <Link
              href={nextStep.href ?? "/play/skyline"}
              className="mt-3 flex items-center gap-3 rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/10 p-3 transition-colors hover:bg-fuchsia-500/20"
            >
              <span className="text-2xl">{nextStep.glyph}</span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-fuchsia-100">
                  Prochaine étape : {nextStep.title}
                </div>
                <div className="text-[11px] text-zinc-400">
                  {nextStep.description}
                </div>
              </div>
              <span className="text-[10px] text-fuchsia-300">→</span>
            </Link>
          ) : (
            <div className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              🎉 Tutoriel terminé. Tu maîtrises Skyline !
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
            {steps.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-2 rounded px-2 py-1 ${
                  s.isComplete
                    ? "bg-emerald-500/5 text-emerald-300"
                    : "text-zinc-500"
                }`}
              >
                <span>{s.isComplete ? "✓" : "○"}</span>
                <span>
                  {s.glyph} {s.title}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
