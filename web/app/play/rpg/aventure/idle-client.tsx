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
  ADVENTURE_CAP_TICKS,
  ADVENTURE_TICK_SECONDS,
  osPerTick,
  xpPerTick,
} from "@shared/eternum-adventure";
import { createClient } from "@/lib/supabase/client";
import { AdventureBattle } from "@/components/eternum/adventure-battle";

type TeamMember = {
  id: string;
  familier_id: string;
  element_id: string;
  level: number;
};

export function IdleClient({
  initialHero,
  initialGold,
  team,
  userId,
}: {
  initialHero: EternumHero;
  initialGold: number;
  team: TeamMember[];
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

  // Taux courant (basé sur stage actuel)
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

  // Quand AdventureBattle avance le stage côté serveur, on sync localement.
  function handleStageChange(newStage: number) {
    setHero((h) => ({ ...h, idleStage: newStage }));
    startTransition(() => router.refresh());
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
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

      {/* Combat automatique d'aventure (auto-loop, layout vertical SW) */}
      <AdventureBattle
        hero={hero}
        team={team}
        initialStage={hero.idleStage}
        userId={userId}
        onStageChange={handleStageChange}
      />

      {/* Récolte passive */}
      <div className="rounded-xl border border-amber-400/30 bg-black/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber-300">
              💰 Récolte passive (timer)
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-400">
              Taux courant : {currentOsPerTick} OS / 10 min · max{" "}
              {(currentOsPerTick * ADVENTURE_CAP_TICKS).toLocaleString("fr-FR")} OS / 8h
            </div>
            <div className="text-[10px] text-zinc-500">
              Indépendant du combat — continue tant que ton stage progresse.
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[11px] text-zinc-400">
            En attente (AFK depuis {formatDuration(pending.seconds)})
          </div>
          <div className="flex items-center gap-3">
            <div className="text-base font-bold tabular-nums text-amber-300">
              +{pending.os.toLocaleString("fr-FR")} OS
              <span className="ml-2 text-xs font-normal text-violet-300">
                +{pending.xp.toLocaleString("fr-FR")} XP
              </span>
            </div>
            <button
              onClick={collect}
              disabled={pending.ticks === 0 || isPending}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-40"
            >
              Récolter
            </button>
          </div>
        </div>
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
