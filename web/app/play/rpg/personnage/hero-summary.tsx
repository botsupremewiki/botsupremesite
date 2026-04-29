"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
  ETERNUM_JOBS,
  ETERNUM_LEVEL_MAX,
  type EternumElementId,
  type EternumHero,
  eternumHeroStats,
  eternumPrestigeStonesOwned,
  eternumXpForNextLevel,
  eternumXpMultiplier,
} from "@shared/types";
import { createClient } from "@/lib/supabase/client";

export function HeroSummary({ hero }: { hero: EternumHero }) {
  const cls = ETERNUM_CLASSES[hero.classId];
  const elt = ETERNUM_ELEMENTS[hero.elementId];
  const stats = eternumHeroStats(hero.classId, hero.level);
  const xpNeeded = eternumXpForNextLevel(hero.level);
  const xpProgress = Math.min(1, hero.xp / xpNeeded);
  const job = hero.jobId ? ETERNUM_JOBS[hero.jobId] : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      {/* Identité */}
      <div
        className={`rounded-2xl border ${cls.border} bg-black/40 p-5 ${cls.gradient}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-5xl">
              {cls.glyph}
              {elt.glyph}
            </div>
            <div>
              <div className={`text-2xl font-bold ${cls.accent}`}>
                {cls.name} de {elt.name}
              </div>
              <div className="text-xs text-zinc-400">{cls.role}</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
                <span>
                  Niveau {hero.level} / {ETERNUM_LEVEL_MAX}
                </span>
                {hero.prestigeCount > 0 && (
                  <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-amber-300">
                    Prestige {hero.prestigeCount}
                  </span>
                )}
                {hero.evolutionStage > 0 && (
                  <span className="rounded bg-violet-400/20 px-1.5 py-0.5 text-violet-300">
                    Évolution {hero.evolutionStage}
                  </span>
                )}
                {eternumPrestigeStonesOwned(hero.prestigeStones).length >
                  0 && (
                  <span className="rounded bg-fuchsia-400/20 px-1.5 py-0.5 text-fuchsia-300 shadow-[0_0_8px_rgba(232,121,249,0.3)]">
                    💎 {eternumPrestigeStonesOwned(hero.prestigeStones).length}/10
                    pierres · ×{eternumXpMultiplier(hero.prestigeStones).toFixed(2)} XP
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              XP suivante
            </div>
            <div className="w-44 rounded-full bg-white/5">
              <div
                className="h-2 rounded-full bg-amber-400/80"
                style={{ width: `${xpProgress * 100}%` }}
              />
            </div>
            <div className="text-[10px] tabular-nums text-zinc-400">
              {hero.xp.toLocaleString("fr-FR")} /{" "}
              {xpNeeded.toLocaleString("fr-FR")}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          Stats au niveau {hero.level} (sans équipement)
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="HP" value={stats.hp} />
          <Stat label="Attaque" value={stats.atk} />
          <Stat label="Défense" value={stats.def} />
          <Stat label="Vitesse" value={stats.spd} />
        </div>
      </section>

      {/* Sorts */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          Sorts &amp; passif
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SkillCard
            badge="PASSIF"
            name={cls.passiveName}
            text={cls.passiveText}
          />
          <SkillCard badge="SORT 1" name={cls.spell1Name} />
          <SkillCard badge="SORT 2" name={cls.spell2Name} />
          <SkillCard
            badge="ULTIME"
            name={cls.ultimateName}
            text="Charge requise — pas utilisable au début du combat."
            accent
          />
        </div>
      </section>

      {/* Métier */}
      <Link
        href="/play/rpg/personnage/metiers"
        className="block rounded-xl border border-white/10 bg-black/40 p-4 transition-colors hover:bg-white/[0.04]"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-widest text-zinc-400">
            Métier
          </div>
          <span className="text-[10px] text-amber-300">
            Cliquer pour gérer →
          </span>
        </div>
        {job ? (
          <div className="flex items-center gap-3">
            <div className="text-3xl">{job.glyph}</div>
            <div>
              <div className="text-base font-semibold text-zinc-100">
                {job.name}
              </div>
              <div className="text-[11px] text-zinc-400">{job.description}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-white/10 p-4 text-center text-xs text-zinc-500">
            Aucun métier choisi — clique pour en sélectionner un.
          </div>
        )}
      </Link>

      {/* Quêtes / Pass / Bestiaire / Prestige / Équipement */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Link
          href="/play/rpg/personnage/equipement"
          className="flex items-center justify-between rounded-md border border-amber-400/30 bg-black/40 p-3 hover:bg-white/[0.04]"
        >
          <span className="flex items-center gap-2">
            <span className="text-xl">⚒️</span>
            <span className="text-sm text-amber-200">Équipement</span>
          </span>
        </Link>
        <Link
          href="/play/rpg/personnage/quetes"
          className="flex items-center justify-between rounded-md border border-amber-400/30 bg-black/40 p-3 hover:bg-white/[0.04]"
        >
          <span className="flex items-center gap-2">
            <span className="text-xl">📜</span>
            <span className="text-sm text-amber-200">Quêtes</span>
          </span>
        </Link>
        <Link
          href="/play/rpg/personnage/pass"
          className="flex items-center justify-between rounded-md border border-amber-400/30 bg-black/40 p-3 hover:bg-white/[0.04]"
        >
          <span className="flex items-center gap-2">
            <span className="text-xl">🎟️</span>
            <span className="text-sm text-amber-200">Pass</span>
          </span>
        </Link>
        <Link
          href="/play/rpg/personnage/bestiaire"
          className="flex items-center justify-between rounded-md border border-amber-400/30 bg-black/40 p-3 hover:bg-white/[0.04]"
        >
          <span className="flex items-center gap-2">
            <span className="text-xl">📖</span>
            <span className="text-sm text-amber-200">Bestiaire</span>
          </span>
        </Link>
        <Link
          href="/play/rpg/personnage/prestige"
          className={`flex items-center justify-between rounded-md border p-3 ${
            hero.level >= 100
              ? "border-fuchsia-400/40 bg-fuchsia-400/10 ring-1 ring-fuchsia-400/30 hover:bg-fuchsia-400/20"
              : "border-white/10 bg-black/40 hover:bg-white/[0.04]"
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <span className="text-sm text-fuchsia-200">Prestige</span>
          </span>
          {eternumPrestigeStonesOwned(hero.prestigeStones).length > 0 && (
            <span className="text-xs text-fuchsia-300">
              💎 {eternumPrestigeStonesOwned(hero.prestigeStones).length}/10
            </span>
          )}
        </Link>
      </section>

      {/* Lumière/Ombre unlock — visible uniquement si éligible */}
      {hero.evolutionStage >= 4 && hero.level >= 100 && (
        <ElementSwitcher hero={hero} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3 text-center">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-zinc-100">
        {value}
      </div>
    </div>
  );
}

function SkillCard({
  badge,
  name,
  text,
  accent,
}: {
  badge: string;
  name: string;
  text?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-md border bg-white/[0.03] p-3 ${
        accent
          ? "border-amber-400/40 bg-amber-400/[0.04]"
          : "border-white/10"
      }`}
    >
      <div
        className={`text-[9px] uppercase tracking-widest ${
          accent ? "text-amber-300" : "text-zinc-500"
        }`}
      >
        {badge}
      </div>
      <div className="text-sm font-semibold text-zinc-100">{name}</div>
      {text && <div className="mt-1 text-[11px] text-zinc-400">{text}</div>}
    </div>
  );
}

function ElementSwitcher({ hero }: { hero: EternumHero }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function changeTo(el: EternumElementId) {
    const supabase = createClient();
    if (!supabase) return;
    setError(null);
    const { error: rpcErr } = await supabase.rpc("eternum_change_element", {
      p_new_element: el,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-yellow-400/40 bg-yellow-400/[0.04] p-4">
      <div className="text-[11px] uppercase tracking-widest text-yellow-300">
        🌟 Élément débloqué
      </div>
      <div className="mt-1 text-xs text-zinc-400">
        Niveau 100 + évolution 4 atteints. Tu peux switch vers Lumière /
        Ombre librement (ou retour aux 4 éléments de base).
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {(["fire", "water", "wind", "earth", "light", "dark"] as EternumElementId[]).map((el) => {
          const e = ETERNUM_ELEMENTS[el];
          const active = hero.elementId === el;
          return (
            <button
              key={el}
              onClick={() => !active && changeTo(el)}
              disabled={active}
              className={`rounded-md border px-2 py-1 text-xs ${
                active
                  ? "border-yellow-400/60 bg-yellow-400/10 text-yellow-200 cursor-default"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
              }`}
            >
              {e.glyph} {e.name}
            </button>
          );
        })}
      </div>
      {error && (
        <div className="mt-2 text-xs text-rose-300">{error}</div>
      )}
    </section>
  );
}

function PlaceholderTile({
  icon,
  label,
  phase,
}: {
  icon: string;
  label: string;
  phase: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] p-3 opacity-60">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <span className="text-sm text-zinc-300">{label}</span>
      </div>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-300">
        {phase}
      </span>
    </div>
  );
}
