"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
  type EternumClassId,
  type EternumElementId,
  eternumHeroStats,
} from "@shared/types";
import { createClient } from "@/lib/supabase/client";

const CLASS_IDS: EternumClassId[] = [
  "warrior",
  "paladin",
  "assassin",
  "mage",
  "priest",
  "vampire",
];

// Lumière/Ombre verrouillés au début (unlock après évolution finale).
const STARTER_ELEMENTS: EternumElementId[] = ["fire", "water", "wind", "earth"];

export function CreateHeroForm() {
  const router = useRouter();
  const [classId, setClassId] = useState<EternumClassId>("warrior");
  const [elementId, setElementId] = useState<EternumElementId>("fire");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cls = ETERNUM_CLASSES[classId];
  const elt = ETERNUM_ELEMENTS[elementId];
  const stats = eternumHeroStats(classId, 1);

  async function submit() {
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase indisponible.");
      return;
    }
    setError(null);
    const { error: rpcErr } = await supabase.rpc("eternum_create_hero", {
      p_class_id: classId,
      p_element_id: elementId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    startTransition(() => {
      router.push("/play/rpg");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">
          Crée ton héros Eternum
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Choisis 1 classe parmi 6 + 1 élément parmi 4. Lumière et Ombre
          sont verrouillés et débloqués après l&apos;évolution finale + niveau
          max. Tu pourras tout changer à chaque Prestige.
        </p>
      </div>

      {/* Classes */}
      <section>
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          1. Classe
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CLASS_IDS.map((id) => {
            const c = ETERNUM_CLASSES[id];
            const active = classId === id;
            return (
              <button
                key={id}
                onClick={() => setClassId(id)}
                className={`group flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? `${c.border} bg-white/[0.04] ring-1 ring-amber-400/40`
                    : "border-white/10 bg-black/40 hover:bg-white/[0.04]"
                } ${c.gradient}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{c.glyph}</span>
                  {active && (
                    <span className="text-[10px] uppercase tracking-widest text-amber-300">
                      Sélectionné
                    </span>
                  )}
                </div>
                <div className={`text-base font-bold ${c.accent}`}>{c.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {c.short}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                  {c.role}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Éléments */}
      <section>
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          2. Élément (Lumière / Ombre verrouillés au début)
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          {(
            ["fire", "wind", "earth", "water", "light", "dark"] as EternumElementId[]
          ).map((id) => {
            const e = ETERNUM_ELEMENTS[id];
            const locked = e.unlockable;
            const active = elementId === id && !locked;
            return (
              <button
                key={id}
                disabled={locked}
                onClick={() =>
                  !locked && STARTER_ELEMENTS.includes(id) && setElementId(id)
                }
                className={`relative flex flex-col items-center gap-1 rounded-xl border p-3 transition-colors ${
                  active
                    ? "border-amber-400/60 bg-amber-400/10"
                    : locked
                      ? "border-white/5 bg-white/[0.02] opacity-40"
                      : "border-white/10 bg-black/40 hover:bg-white/[0.04]"
                }`}
              >
                <span className="text-3xl">{e.glyph}</span>
                <span className={`text-xs font-semibold ${e.accent}`}>
                  {e.name}
                </span>
                {locked && (
                  <span className="absolute right-1 top-1 text-[10px] text-zinc-500">
                    🔒
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Récap */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
          Récap
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-3xl">
              {cls.glyph} {elt.glyph}
            </div>
            <div>
              <div className={`text-base font-bold ${cls.accent}`}>
                {cls.name} de {elt.name}
              </div>
              <div className="text-[11px] text-zinc-400">
                Passif : {cls.passiveName} — {cls.passiveText}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs tabular-nums">
            <Stat label="HP" value={stats.hp} />
            <Stat label="ATK" value={stats.atk} />
            <Stat label="DEF" value={stats.def} />
            <Stat label="VIT" value={stats.spd} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-zinc-300">
          <SkillTile label="Sort 1" value={cls.spell1Name} />
          <SkillTile label="Sort 2" value={cls.spell2Name} />
          <SkillTile label="Ultime" value={cls.ultimateName} />
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={isPending}
          className="rounded-md bg-amber-500 px-6 py-3 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {isPending ? "Création…" : "Créer mon héros"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-center">
      <div className="text-[9px] uppercase text-zinc-500">{label}</div>
      <div className="font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function SkillTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/5 bg-white/[0.03] p-2">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="text-zinc-100">{value}</div>
    </div>
  );
}
