"use client";

import { useMemo, useState, useTransition } from "react";
import {
  SKYLINE_SKILLS,
  type SkylineCompanyRow,
  type SkylineEmployeeRow,
  type SkylineSkill,
  skylineFormatCashFR,
} from "@shared/skyline";
import { hireEmployeeAction } from "../_lib/actions";

const ALL_SKILLS = Object.keys(SKYLINE_SKILLS) as SkylineSkill[];

export function EmploiView({
  candidates,
  companies,
}: {
  candidates: SkylineEmployeeRow[];
  companies: SkylineCompanyRow[];
}) {
  const [filter, setFilter] = useState<SkylineSkill | "all">("all");
  const [minSkill, setMinSkill] = useState(0);
  const [maxSalary, setMaxSalary] = useState(10000);
  const [selectedCompany, setSelectedCompany] = useState<string>(
    companies[0]?.id ?? "",
  );

  const filtered = useMemo(() => {
    return candidates
      .filter((c) => Number(c.salary_demanded) <= maxSalary)
      .filter((c) => {
        if (filter === "all") return true;
        const skills = (c.skills ?? {}) as Record<string, number>;
        return (skills[filter] ?? 0) >= minSkill;
      })
      .sort((a, b) => {
        if (filter === "all") {
          return Number(a.salary_demanded) - Number(b.salary_demanded);
        }
        const skillsA = (a.skills ?? {}) as Record<string, number>;
        const skillsB = (b.skills ?? {}) as Record<string, number>;
        return (skillsB[filter] ?? 0) - (skillsA[filter] ?? 0);
      });
  }, [candidates, filter, minSkill, maxSalary]);

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(96,165,250,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            💼 Marché de l&apos;emploi
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Pool de candidats PNJ disponibles. Embauche ceux qui collent à tes
            besoins. Plus tard (P9), un employé RH pourra automatiser.
          </p>
        </div>

        {companies.length === 0 ? (
          <div className="rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            Tu n&apos;as pas encore d&apos;entreprise. Crée-en une avant
            d&apos;embaucher.
          </div>
        ) : null}

        {/* Filtres */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                Compétence
              </label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as SkylineSkill | "all")}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/50"
              >
                <option value="all">Toutes</option>
                {ALL_SKILLS.map((sk) => (
                  <option key={sk} value={sk}>
                    {SKYLINE_SKILLS[sk].glyph} {SKYLINE_SKILLS[sk].name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                Niveau min compétence
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={minSkill}
                onChange={(e) =>
                  setMinSkill(Math.max(0, Math.min(100, Number(e.target.value))))
                }
                disabled={filter === "all"}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/50 disabled:opacity-40"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                Salaire max ($/mois)
              </label>
              <input
                type="number"
                min={0}
                value={maxSalary}
                onChange={(e) => setMaxSalary(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/50"
              />
            </div>
          </div>

          {companies.length > 0 ? (
            <div className="mt-3">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                Embaucher dans
              </label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/50"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.sector})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {/* Liste candidats */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">
              {filtered.length} candidat{filtered.length > 1 ? "s" : ""}
              {filter !== "all" ? ` · ${SKYLINE_SKILLS[filter].name}` : ""}
            </h2>
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Aucun candidat ne correspond aux filtres.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filtered.map((c) => (
                <CandidateCard
                  key={c.id}
                  employee={c}
                  selectedCompany={selectedCompany}
                  filterSkill={filter !== "all" ? filter : null}
                  canHire={Boolean(selectedCompany)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function CandidateCard({
  employee,
  selectedCompany,
  filterSkill,
  canHire,
}: {
  employee: SkylineEmployeeRow;
  selectedCompany: string;
  filterSkill: SkylineSkill | null;
  canHire: boolean;
}) {
  const skills = (employee.skills ?? {}) as Record<string, number>;
  const topSkills = Object.entries(skills)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, 3)
    .filter(([, v]) => Number(v) > 30);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hired, setHired] = useState(false);

  const handleHire = () => {
    if (!canHire || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("employee_id", employee.id);
    fd.set("company_id", selectedCompany);
    startTransition(async () => {
      const res = await hireEmployeeAction(fd);
      if (res.ok) setHired(true);
      else setError(res.error);
    });
  };

  if (hired) {
    return (
      <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-3 text-xs text-emerald-200">
        ✓ {employee.full_name} embauché. Va dans l&apos;entreprise pour le voir.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-zinc-100">
            {employee.full_name}
          </div>
          <div className="text-[10px] text-zinc-500">
            Salaire demandé{" "}
            <span className="text-zinc-300 tabular-nums">
              {skylineFormatCashFR(Number(employee.salary_demanded))}
            </span>{" "}
            /mois
          </div>
        </div>
        <div className="text-[10px] text-zinc-500">
          Moral{" "}
          <span className="text-zinc-300 tabular-nums">{employee.morale}</span>
        </div>
      </div>
      {topSkills.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {topSkills.map(([skill, value]) => {
            const meta = SKYLINE_SKILLS[skill as SkylineSkill];
            const highlight = filterSkill === skill;
            return (
              <span
                key={skill}
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  highlight
                    ? "border-blue-400/60 bg-blue-500/15 text-blue-100"
                    : "border-white/10 bg-white/[0.03] text-zinc-300"
                }`}
              >
                {meta?.glyph} {meta?.name ?? skill} · {Number(value)}
              </span>
            );
          })}
        </div>
      ) : null}
      <button
        onClick={handleHire}
        disabled={!canHire || pending}
        className="mt-3 w-full rounded-md border border-blue-400/50 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-200 transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending
          ? "..."
          : canHire
          ? `Embaucher · ${skylineFormatCashFR(Number(employee.salary_demanded))}/mois`
          : "Pas d'entreprise sélectionnée"}
      </button>
      {error ? (
        <div className="mt-1 text-[10px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}
