"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
  ETERNUM_JOBS,
  type EternumClassId,
  type EternumElementId,
  type EternumHero,
  type EternumJobId,
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
const JOB_IDS: EternumJobId[] = [
  "blacksmith",
  "tanner",
  "weaver",
  "jeweler",
  "armorer",
  "baker",
];

export function PrestigeClient({ hero }: { hero: EternumHero }) {
  const router = useRouter();
  const [classId, setClassId] = useState<EternumClassId>(hero.classId);
  const [elementId, setElementId] = useState<EternumElementId>(hero.elementId);
  const [jobId, setJobId] = useState<EternumJobId | null>(hero.jobId);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const ready = hero.level >= 100 && hero.evolutionStage >= 4;
  const lightDarkUnlocked = ready;

  async function prestige() {
    if (!supabase) return;
    setError(null);
    const { error: rpcErr } = await supabase.rpc("eternum_prestige", {
      p_new_class: classId,
      p_new_element: elementId,
      p_new_job: jobId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    router.push("/play/rpg/personnage");
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/[0.04] p-5">
        <div className="text-2xl font-bold text-fuchsia-200">
          ✨ Prestige #{hero.prestigeCount + 1}
        </div>
        <div className="mt-1 text-xs text-zinc-400">
          Reset complet de ton héros (niveau 1, XP 0, évolution 0). Gagne :
          <br /> · +1 au compteur prestige (bonus permanents post-MVP)
          <br /> · 2 000 Pass XP
          <br /> · Possibilité de changer classe + élément + métier
          <br /> · Lumière/Ombre disponibles à partir du 1er Prestige (atteint level 100 + évolution 4)
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Stat label="Niveau" value={`${hero.level}/100`} ok={hero.level >= 100} />
          <Stat label="Évolution" value={`${hero.evolutionStage}/4`} ok={hero.evolutionStage >= 4} />
          <Stat label="Prestige" value={`#${hero.prestigeCount}`} ok={true} />
        </div>
        {!ready && (
          <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-200">
            Prestige requiert <strong>niveau 100</strong> + <strong>évolution 4</strong>.
            Continue à grinder !
          </div>
        )}
      </div>

      {/* Choix classe */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
          1. Classe pour le prestige #{hero.prestigeCount + 1}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CLASS_IDS.map((id) => {
            const c = ETERNUM_CLASSES[id];
            const active = classId === id;
            return (
              <button
                key={id}
                onClick={() => setClassId(id)}
                className={`rounded-md border p-2 text-left transition-colors ${
                  active
                    ? "border-fuchsia-400/60 bg-fuchsia-400/10"
                    : "border-white/10 hover:bg-white/[0.04]"
                }`}
              >
                <div className="text-sm">
                  {c.glyph} <span className={c.accent}>{c.name}</span>
                </div>
                <div className="text-[10px] text-zinc-500">{c.short}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Choix élément */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
          2. Élément
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(["fire", "wind", "earth", "water", "light", "dark"] as EternumElementId[]).map((id) => {
            const e = ETERNUM_ELEMENTS[id];
            const locked = e.unlockable && !lightDarkUnlocked;
            const active = elementId === id;
            return (
              <button
                key={id}
                disabled={locked}
                onClick={() => !locked && setElementId(id)}
                className={`flex flex-col items-center gap-1 rounded-md border p-2 ${
                  active
                    ? "border-fuchsia-400/60 bg-fuchsia-400/10"
                    : locked
                      ? "border-white/5 bg-white/[0.02] opacity-40"
                      : "border-white/10 hover:bg-white/[0.04]"
                }`}
              >
                <span className="text-2xl">{e.glyph}</span>
                <span className="text-[10px]">{e.name}</span>
                {locked && <span className="text-[9px]">🔒</span>}
              </button>
            );
          })}
        </div>
      </section>

      {/* Choix métier */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
          3. Métier
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {JOB_IDS.map((id) => {
            const j = ETERNUM_JOBS[id];
            const active = jobId === id;
            return (
              <button
                key={id}
                onClick={() => setJobId(id)}
                className={`rounded-md border p-2 text-left transition-colors ${
                  active
                    ? "border-fuchsia-400/60 bg-fuchsia-400/10"
                    : "border-white/10 hover:bg-white/[0.04]"
                }`}
              >
                <div className="text-sm">
                  {j.glyph} {j.name}
                </div>
                <div className="text-[10px] text-zinc-500">{j.description}</div>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={!ready}
          className="rounded-md bg-fuchsia-500 px-6 py-3 text-sm font-bold text-fuchsia-950 hover:bg-fuchsia-400 disabled:opacity-40"
        >
          ✨ Prestige
        </button>
      ) : (
        <div className="rounded-md border border-rose-400/40 bg-rose-400/10 p-3 text-sm">
          <div className="font-bold text-rose-200">⚠️ Confirmer Prestige ?</div>
          <div className="mt-1 text-xs text-zinc-300">
            Ton héros sera reset au niveau 1. Tes familiers + items restent.
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={prestige}
              className="flex-1 rounded-md bg-fuchsia-500 px-4 py-2 text-sm font-bold text-fuchsia-950 hover:bg-fuchsia-400"
            >
              Oui, faire Prestige
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Lumière/Ombre quick-switch hors Prestige (si déjà unlock) */}
      {ready && (hero.elementId !== "light" && hero.elementId !== "dark") && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/[0.04] p-4 text-xs text-amber-200">
          🌟 Lumière / Ombre débloquées ! Tu peux changer ton élément
          actuel sans Prestige depuis la page principale Personnage (en bas).
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-2 py-1 text-center ${
        ok ? "border-emerald-400/40 bg-emerald-400/10" : "border-amber-400/40 bg-amber-400/10"
      }`}
    >
      <div className="text-[9px] uppercase text-zinc-500">{label}</div>
      <div className={`font-semibold ${ok ? "text-emerald-300" : "text-amber-300"}`}>
        {value}
      </div>
    </div>
  );
}
