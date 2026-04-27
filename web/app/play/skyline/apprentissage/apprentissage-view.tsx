"use client";

import { useEffect, useState, useTransition } from "react";
import {
  SKYLINE_SKILLS,
  skylineFormatCashFR,
  type SkylineSkill,
} from "@shared/skyline";
import { startPlayerTrainingAction } from "../_lib/actions";

const ALL_SKILLS = Object.keys(SKYLINE_SKILLS) as SkylineSkill[];

export function ApprentissageView({
  playerSkills,
  currentTraining,
  trainingEndsAt,
  cash,
}: {
  playerSkills: Record<string, number>;
  currentTraining: string | null;
  trainingEndsAt: string | null;
  cash: number;
}) {
  const [selectedSkill, setSelectedSkill] = useState<SkylineSkill>(
    ALL_SKILLS[0],
  );
  const [targetLevel, setTargetLevel] = useState(50);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const currentLevel = playerSkills[selectedSkill] ?? 0;
  const cost = 5000 + Math.max(0, targetLevel - currentLevel) * 200;
  const isInTraining = Boolean(currentTraining && trainingEndsAt);
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    const tid = setTimeout(() => setNowMs(Date.now()), 0);
    return () => {
      clearInterval(id);
      clearTimeout(tid);
    };
  }, []);
  const trainingRemainingMs =
    trainingEndsAt && nowMs !== null
      ? new Date(trainingEndsAt).getTime() - nowMs
      : 0;

  const handleStart = () => {
    if (pending || isInTraining) return;
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("skill", selectedSkill);
    fd.set("target_level", String(targetLevel));
    startTransition(async () => {
      const res = await startPlayerTrainingAction(fd);
      if (res.ok) {
        setResult("Formation démarrée. Reviens quand le timer est écoulé.");
      } else {
        setError(res.error);
      }
    });
  };

  // Refresh page quand la formation se termine (une fois le timer atteint).
  useEffect(() => {
    if (!isInTraining || trainingRemainingMs <= 0) return;
    const id = setTimeout(() => {
      window.location.reload();
    }, trainingRemainingMs + 1000);
    return () => clearTimeout(id);
  }, [isInTraining, trainingRemainingMs]);

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            🎓 Apprentissage joueur
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Forme-toi à une compétence à la fois — le joueur apprend 5× plus
            vite qu&apos;un employé. Pendant la formation, tu ne peux pas
            travailler dans tes entreprises, mais tu peux toujours gérer la
            stratégie.
          </p>
        </div>

        {isInTraining ? (
          <section className="rounded-xl border border-amber-400/40 bg-amber-500/5 p-4">
            <h2 className="text-sm font-semibold text-amber-200">
              ⏳ Formation en cours
            </h2>
            <div className="mt-2 text-sm text-zinc-300">
              Compétence :{" "}
              <strong>
                {SKYLINE_SKILLS[currentTraining as SkylineSkill]?.name ??
                  currentTraining}
              </strong>
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Fin :{" "}
              {trainingEndsAt
                ? new Date(trainingEndsAt).toLocaleString("fr-FR")
                : "?"}
              {trainingRemainingMs > 0
                ? ` · dans ${Math.round(trainingRemainingMs / 60000)} min`
                : " · terminée (rafraîchis la page)"}
            </div>
          </section>
        ) : null}

        {/* Compétences actuelles */}
        <section className="rounded-xl border border-white/10 bg-black/40 p-4">
          <h2 className="text-sm font-semibold text-zinc-200">
            Mes compétences
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
            {ALL_SKILLS.map((sk) => {
              const meta = SKYLINE_SKILLS[sk];
              const lvl = playerSkills[sk] ?? 0;
              const tier =
                lvl >= 90
                  ? "Expert"
                  : lvl >= 70
                  ? "Senior"
                  : lvl >= 40
                  ? "Confirmé"
                  : lvl > 0
                  ? "Junior"
                  : "—";
              const accent =
                lvl >= 90
                  ? "text-purple-200"
                  : lvl >= 70
                  ? "text-emerald-200"
                  : lvl >= 40
                  ? "text-amber-200"
                  : "text-zinc-400";
              return (
                <div
                  key={sk}
                  className="rounded border border-white/5 bg-white/[0.02] p-2 text-xs"
                >
                  <div className="text-zinc-200">
                    {meta.glyph} {meta.name}
                  </div>
                  <div className={`mt-0.5 text-base font-semibold tabular-nums ${accent}`}>
                    {lvl}
                  </div>
                  <div className="text-[9px] text-zinc-500">{tier}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Lancer une formation */}
        {!isInTraining ? (
          <section className="rounded-xl border border-purple-400/40 bg-black/40 p-4">
            <h2 className="text-sm font-semibold text-purple-200">
              Lancer une formation
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Compétence à apprendre
                </label>
                <select
                  value={selectedSkill}
                  onChange={(e) =>
                    setSelectedSkill(e.target.value as SkylineSkill)
                  }
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/50"
                >
                  {ALL_SKILLS.map((sk) => {
                    const meta = SKYLINE_SKILLS[sk];
                    const cur = playerSkills[sk] ?? 0;
                    return (
                      <option key={sk} value={sk}>
                        {meta.glyph} {meta.name} (actuel : {cur})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Niveau cible (max 100)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={targetLevel}
                  onChange={(e) =>
                    setTargetLevel(Math.max(1, Math.min(100, Number(e.target.value))))
                  }
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/50"
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-xs tabular-nums">
              <div className="rounded bg-white/[0.03] px-2 py-1.5">
                <div className="text-[10px] text-zinc-500">Coût</div>
                <div className="text-amber-200">{skylineFormatCashFR(cost)}</div>
              </div>
              <div className="rounded bg-white/[0.03] px-2 py-1.5">
                <div className="text-[10px] text-zinc-500">Durée</div>
                <div className="text-zinc-300">14h réelles (2 sem. jeu)</div>
              </div>
              <div className="rounded bg-white/[0.03] px-2 py-1.5">
                <div className="text-[10px] text-zinc-500">Gain attendu</div>
                <div className="text-emerald-300">+25 à +40 points</div>
              </div>
            </div>

            <button
              onClick={handleStart}
              disabled={pending || cash < cost}
              className="mt-3 w-full rounded-md border border-purple-400/50 bg-purple-500/15 px-4 py-2 text-sm font-semibold text-purple-100 transition-colors hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending
                ? "Inscription en cours..."
                : cash < cost
                ? "Cash insuffisant"
                : "🎓 Commencer la formation"}
            </button>
            {result ? (
              <div className="mt-2 text-xs text-emerald-300">{result}</div>
            ) : null}
            {error ? (
              <div className="mt-2 text-xs text-rose-300">{error}</div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
