"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
  type EternumHero,
  eternumHeroStats,
  eternumXpForNextLevel,
} from "@shared/types";
import {
  ADVENTURE_CAP_HOURS,
  ADVENTURE_CAP_TICKS,
  ADVENTURE_MAX_STAGE,
  ADVENTURE_TICK_SECONDS,
  STAGE_PHASE_ACCENT,
  STAGE_PHASE_LABEL,
  getStageComposition,
  nextStageComposition,
  osPerTick,
  xpPerTick,
} from "@shared/eternum-adventure";
import { RARITY_LABEL } from "@shared/eternum-familiers";
import { createClient } from "@/lib/supabase/client";
import { IdleBattleScene } from "@/components/eternum/idle-battle-scene";

export function IdleClient({
  initialHero,
  initialGold,
  userId,
}: {
  initialHero: EternumHero;
  initialGold: number;
  userId: string;
}) {
  const router = useRouter();
  const [hero, setHero] = useState<EternumHero>(initialHero);
  const [gold, setGold] = useState<number>(initialGold);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const cls = ETERNUM_CLASSES[hero.classId];
  const elt = ETERNUM_ELEMENTS[hero.elementId];
  const stats = eternumHeroStats(hero.classId, hero.level);
  const xpNeeded = eternumXpForNextLevel(hero.level);

  // Compositions stage actuel + suivant
  const currentComp = useMemo(
    () => getStageComposition(hero.idleStage),
    [hero.idleStage],
  );
  const nextComp = useMemo(
    () => nextStageComposition(hero.idleStage),
    [hero.idleStage],
  );

  // Taux courant
  const currentOsPerTick = useMemo(
    () => osPerTick(hero.idleStage),
    [hero.idleStage],
  );

  // Pending OS depuis dernière collecte. Formule SQL :
  //   OS = ticks × osPerTick(stage), XP = OS / 4, tick = 10 min, cap 8h.
  const pending = useMemo(() => {
    const elapsedSec = Math.max(
      0,
      Math.floor((now - hero.idleUpdatedAt) / 1000),
    );
    const ticks = Math.min(
      ADVENTURE_CAP_TICKS,
      Math.floor(elapsedSec / ADVENTURE_TICK_SECONDS),
    );
    const os = ticks * osPerTick(hero.idleStage);
    const xp = ticks * xpPerTick(hero.idleStage);
    return { ticks, os, xp, seconds: elapsedSec };
  }, [now, hero.idleUpdatedAt, hero.idleStage]);

  // Régen énergie estimée live.
  const liveEnergy = useMemo(() => {
    const elapsedMin = Math.max(
      0,
      Math.floor((now - hero.energyUpdatedAt) / 60_000),
    );
    return Math.min(100, hero.energy + elapsedMin);
  }, [now, hero.energy, hero.energyUpdatedAt]);

  async function collect() {
    const supabase = createClient();
    if (!supabase) return;
    setError(null);
    setOkMsg(null);
    const { data, error: rpcErr } = await supabase.rpc(
      "eternum_collect_idle",
      { p_user_id: userId },
    );
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as {
      os_gained: number;
      xp_gained: number;
      stage: number;
      ticks: number;
      os_per_tick?: number;
    };
    if (r.ticks > 0) {
      if (r.os_gained > 0) setGold((g) => g + r.os_gained);
      setHero((h) => ({
        ...h,
        xp: h.xp + r.xp_gained,
        idleUpdatedAt: Date.now(),
      }));
      setOkMsg(
        `+${r.os_gained.toLocaleString("fr-FR")} OS · +${r.xp_gained.toLocaleString(
          "fr-FR",
        )} XP (${r.ticks} ticks)`,
      );
    } else {
      setOkMsg("Rien à récolter pour l'instant.");
    }
    startTransition(() => router.refresh());
  }

  async function advance() {
    const supabase = createClient();
    if (!supabase) return;
    setError(null);
    setOkMsg(null);
    const { data, error: rpcErr } = await supabase.rpc(
      "eternum_advance_stage",
      { p_user_id: userId },
    );
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as { ok: boolean; error?: string; new_stage?: number };
    if (!r.ok) {
      setError(r.error ?? "Échec.");
      return;
    }
    setHero((h) => ({
      ...h,
      idleStage: r.new_stage!,
      idleUpdatedAt: Date.now(),
      energy: Math.max(0, h.energy - 5),
      energyUpdatedAt: Date.now(),
    }));
    setOkMsg(`Stage ${r.new_stage} atteint !`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {/* Bandeau héros */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-3xl">
              {cls.glyph}
              {elt.glyph}
            </div>
            <div>
              <div className={`text-lg font-bold ${cls.accent}`}>
                {cls.name} de {elt.name}
              </div>
              <div className="text-[11px] text-zinc-400">
                Niveau {hero.level} · HP {stats.hp} · ATK {stats.atk}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Mini label="OS" value={gold.toLocaleString("fr-FR")} accent="text-amber-300" />
            <Mini
              label="Énergie"
              value={`${liveEnergy}/100`}
              accent={liveEnergy >= 50 ? "text-emerald-300" : "text-zinc-100"}
            />
            <Mini
              label="XP"
              value={`${hero.xp}/${xpNeeded}`}
              accent="text-violet-300"
            />
          </div>
        </div>
      </div>

      {/* Stage actuel + idle */}
      <div className="rounded-2xl border border-sky-400/30 bg-black/50 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-sky-300">
              Carte du monde — Eternum
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <div className="text-4xl font-bold text-zinc-100">
                Stage {hero.idleStage}
              </div>
              <div className="text-xs text-zinc-500">
                / {ADVENTURE_MAX_STAGE}
              </div>
            </div>
            <div
              className={`mt-1 inline-block rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                STAGE_PHASE_ACCENT[currentComp.phase]
              }`}
            >
              {STAGE_PHASE_LABEL[currentComp.phase]} · {currentComp.label}
            </div>
          </div>
          {/* Taux actuel */}
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.04] p-2 text-right">
            <div className="text-[9px] uppercase tracking-widest text-amber-300">
              Taux actuel
            </div>
            <div className="text-sm font-bold tabular-nums text-amber-200">
              {currentOsPerTick} OS / tick
            </div>
            <div className="text-[9px] text-zinc-400">
              soit {(currentOsPerTick * ADVENTURE_CAP_TICKS).toLocaleString(
                "fr-FR",
              )}{" "}
              OS / 8h max
            </div>
            <div className="mt-1 text-[9px] text-zinc-500">
              Prochain palier : stage{" "}
              {Math.min(
                ADVENTURE_MAX_STAGE,
                Math.floor(hero.idleStage / 10) * 10 + 11,
              )}
            </div>
          </div>
        </div>

        {/* Animation combat idle */}
        <div className="mt-4">
          <IdleBattleScene
            classId={hero.classId}
            elementId={hero.elementId}
            stage={hero.idleStage}
          />
        </div>

        {/* Composition ennemie actuelle / suivante */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500">
              Adversaires actuels
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {currentComp.enemies.map((e, i) => (
                <span
                  key={i}
                  className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]"
                >
                  {RARITY_LABEL[e.rarity]} · niv {e.level}
                </span>
              ))}
            </div>
          </div>
          {nextComp && (
            <div className="rounded-lg border border-sky-400/20 bg-sky-400/[0.04] p-3">
              <div className="text-[9px] uppercase tracking-widest text-sky-300">
                Stage {nextComp.stage} → {nextComp.label}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {nextComp.enemies.map((e, i) => (
                  <span
                    key={i}
                    className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]"
                  >
                    {RARITY_LABEL[e.rarity]} · niv {e.level}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!nextComp && (
            <div className="rounded-lg border border-fuchsia-400/40 bg-fuchsia-400/[0.05] p-3 text-center text-[11px] text-fuchsia-200">
              🌟 Stage final atteint — tu es au sommet d&apos;Eternum
            </div>
          )}
        </div>

        {/* AFK pending */}
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            En attente (AFK depuis {formatDuration(pending.seconds)})
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xl font-bold tabular-nums text-amber-300">
              +{pending.os.toLocaleString("fr-FR")} OS
              <span className="ml-2 text-sm font-normal text-violet-300">
                +{pending.xp.toLocaleString("fr-FR")} XP
              </span>
            </div>
            <button
              onClick={collect}
              disabled={pending.ticks === 0 || isPending}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-40"
            >
              💰 Récolter
            </button>
          </div>
          <div className="mt-1 text-[10px] text-zinc-500">
            Tick toutes les 10 min · cap AFK {ADVENTURE_CAP_HOURS}h · taux augmente
            tous les 10 niveaux · stage 1000 = 100 OS/tick = 4 800 OS / 8h
          </div>
        </div>

        {/* Avancer */}
        {nextComp && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div>
              <div className="text-sm font-semibold text-zinc-200">
                Avancer au stage {hero.idleStage + 1}
              </div>
              <div className="text-[11px] text-zinc-400">
                Coût : 5 énergie · vs {nextComp.label}
              </div>
            </div>
            <button
              onClick={advance}
              disabled={liveEnergy < 5 || isPending}
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-bold text-sky-950 hover:bg-sky-400 disabled:opacity-40"
            >
              ⚔️ Combattre &amp; avancer
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm text-emerald-200">
          {okMsg}
        </div>
      )}

      {/* Quêtes / Tour — placeholders */}
      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Placeholder icon="📜" label="Quêtes globales" phase="P11" />
        <Placeholder icon="🗼" label="Tour Infinie" phase="P9" />
      </section>
    </div>
  );
}

function Mini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-center">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className={`text-sm font-semibold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  );
}

function Placeholder({
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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${rm.toString().padStart(2, "0")}m`;
}
