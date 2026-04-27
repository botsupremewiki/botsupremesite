"use client";

import { useState, useTransition } from "react";
import {
  SKYLINE_SKILLS,
  skylineFormatCashFR,
  type SkylineSkill,
} from "@shared/skyline";
import {
  offerSelfToMarketAction,
  playerQuitJobAction,
  withdrawSelfFromMarketAction,
} from "../_lib/actions";

const ALL_SKILLS = Object.keys(SKYLINE_SKILLS) as SkylineSkill[];

export function JobView({
  isSeeking,
  minSalary,
  currentJobCompanyId,
  currentJobSalary,
  currentJobStartedAt,
  playerSkills,
}: {
  isSeeking: boolean;
  minSalary: number;
  currentJobCompanyId: string | null;
  currentJobSalary: number | null;
  currentJobStartedAt: string | null;
  playerSkills: Record<string, number>;
}) {
  const [salary, setSalary] = useState(minSalary);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEmployed = Boolean(currentJobCompanyId);

  const handleOffer = () => {
    if (pending || salary <= 0) return;
    setError(null);
    const fd = new FormData();
    fd.set("min_salary", String(salary));
    startTransition(async () => {
      const res = await offerSelfToMarketAction(fd);
      if (!res.ok) setError(res.error);
    });
  };

  const handleWithdraw = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await withdrawSelfFromMarketAction();
      if (!res.ok) setError(res.error);
    });
  };

  const handleQuit = () => {
    if (pending) return;
    if (!confirm("Démissionner de ce job ?")) return;
    setError(null);
    startTransition(async () => {
      const res = await playerQuitJobAction();
      if (!res.ok) setError(res.error);
    });
  };

  const topSkills = Object.entries(playerSkills)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, 6)
    .filter(([, v]) => Number(v) > 0);

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(96,165,250,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">💼 Salariat joueur</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Tu peux être embauché par d&apos;autres joueurs en exposant tes
            compétences sur le marché de l&apos;emploi. Tu reçois un salaire
            mensuel passif tant que tu es sous contrat.
          </p>
        </div>

        {isEmployed ? (
          <section className="rounded-xl border border-emerald-400/40 bg-emerald-500/5 p-4">
            <h2 className="text-sm font-semibold text-emerald-200">
              ✓ Sous contrat
            </h2>
            <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  Salaire
                </div>
                <div className="text-emerald-300 tabular-nums">
                  {currentJobSalary
                    ? skylineFormatCashFR(currentJobSalary) + " /mois"
                    : "?"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  Embauché depuis
                </div>
                <div className="text-zinc-300">
                  {currentJobStartedAt
                    ? new Date(currentJobStartedAt).toLocaleDateString("fr-FR")
                    : "?"}
                </div>
              </div>
            </div>
            <button
              onClick={handleQuit}
              disabled={pending}
              className="mt-3 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-40"
            >
              {pending ? "..." : "Démissionner"}
            </button>
          </section>
        ) : isSeeking ? (
          <section className="rounded-xl border border-blue-400/40 bg-blue-500/5 p-4">
            <h2 className="text-sm font-semibold text-blue-200">
              🔍 En recherche d&apos;emploi
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Tu es exposé sur le marché de l&apos;emploi avec un salaire min.
              demandé de{" "}
              <strong className="text-blue-200">
                {skylineFormatCashFR(minSalary)} /mois
              </strong>
              . Les employeurs peuvent t&apos;envoyer une offre.
            </p>
            <button
              onClick={handleWithdraw}
              disabled={pending}
              className="mt-3 rounded-md border border-zinc-400/40 bg-zinc-500/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-500/20 disabled:opacity-40"
            >
              {pending ? "..." : "Retirer ma candidature"}
            </button>
          </section>
        ) : (
          <section className="rounded-xl border border-blue-400/40 bg-black/40 p-4">
            <h2 className="text-sm font-semibold text-blue-200">
              Postuler au marché de l&apos;emploi
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Tes compétences seront visibles par tous les employeurs. Plus tu
              en as, plus on te repère vite.
            </p>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Salaire min. demandé ($/mois)
                </label>
                <input
                  type="number"
                  min={500}
                  step={100}
                  value={salary}
                  onChange={(e) =>
                    setSalary(Math.max(500, Number(e.target.value)))
                  }
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/50 tabular-nums"
                />
              </div>
              <button
                onClick={handleOffer}
                disabled={pending || salary <= 0}
                className="rounded-md border border-blue-400/50 bg-blue-500/15 px-4 py-2 text-sm font-semibold text-blue-100 transition-colors hover:bg-blue-500/25 disabled:opacity-40"
              >
                {pending ? "..." : "📤 Postuler"}
              </button>
            </div>
          </section>
        )}

        <section className="rounded-xl border border-white/10 bg-black/40 p-4">
          <h2 className="text-sm font-semibold text-zinc-200">
            Mes compétences exposées
          </h2>
          {topSkills.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              Aucune compétence acquise. Va dans{" "}
              <strong className="text-fuchsia-300">Apprentissage</strong> pour
              te former — sans compétences, peu d&apos;employeurs voudront de
              toi.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_SKILLS.map((sk) => {
                const meta = SKYLINE_SKILLS[sk];
                const lvl = playerSkills[sk] ?? 0;
                const accent =
                  lvl >= 70
                    ? "text-emerald-200"
                    : lvl >= 40
                    ? "text-amber-200"
                    : lvl > 0
                    ? "text-zinc-300"
                    : "text-zinc-500";
                return (
                  <div
                    key={sk}
                    className="rounded border border-white/5 bg-white/[0.02] p-2 text-xs"
                  >
                    <div className="text-zinc-200">
                      {meta.glyph} {meta.name}
                    </div>
                    <div className={`mt-0.5 tabular-nums font-semibold ${accent}`}>
                      {lvl}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {error ? (
          <div className="rounded-md border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </div>
    </main>
  );
}
