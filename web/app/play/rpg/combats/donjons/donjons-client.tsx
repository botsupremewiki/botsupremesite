"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
  type EternumElementId,
  type EternumHero,
} from "@shared/types";
import {
  ETERNUM_FAMILIERS_BY_ID,
  RARITY_ACCENT,
} from "@shared/eternum-familiers";
import {
  ETERNUM_DUNGEONS,
  type DungeonConfig,
} from "@shared/eternum-content";
import {
  buildFamilierUnit,
  buildHeroUnit,
  simulateBattle,
  type CombatLog,
  type CombatUnit,
} from "@shared/eternum-combat";
import { createClient } from "@/lib/supabase/client";
import type { OwnedFamilier } from "../../familiers/page";

export function DonjonsClient({
  hero,
  team,
  progress,
}: {
  hero: EternumHero;
  team: OwnedFamilier[];
  progress: { dungeon_id: string; best_floor: number }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<DungeonConfig | null>(null);
  const [result, setResult] = useState<{
    winner: "A" | "B" | "draw";
    log: CombatLog[];
    rewards?: { os: number; xp: number; resources: string[] };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const progressMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of progress) m.set(p.dungeon_id, p.best_floor);
    return m;
  }, [progress]);

  function buildPlayerTeam(): CombatUnit[] {
    const units: CombatUnit[] = [];
    units.push(
      buildHeroUnit(
        "hero",
        ETERNUM_CLASSES[hero.classId].name + " (Toi)",
        hero.classId,
        hero.elementId,
        hero.level,
        "A",
      ),
    );
    for (const f of team) {
      const base = ETERNUM_FAMILIERS_BY_ID.get(f.familier_id);
      if (!base) continue;
      units.push(
        buildFamilierUnit(
          `fam-${f.id}`,
          base.name,
          base.classId,
          f.element_id as EternumElementId,
          f.level,
          base.baseStats,
          "A",
        ),
      );
    }
    return units;
  }

  function buildEnemyTeam(d: DungeonConfig): CombatUnit[] {
    return d.enemies.map((e, i) =>
      buildFamilierUnit(
        `enemy-${i}`,
        e.name + (e.isBoss ? " (Boss)" : ""),
        e.classId,
        e.element,
        e.level,
        { hp: e.hp, atk: e.atk, def: e.def, spd: e.spd },
        "B",
      ),
    );
  }

  async function fight(d: DungeonConfig) {
    setError(null);
    setResult(null);
    if (hero.energy < d.energyCost) {
      setError(`Énergie insuffisante (${hero.energy}/${d.energyCost}).`);
      return;
    }

    // Simulate combat client-side (engine pure-fonction).
    const playerTeam = buildPlayerTeam();
    const enemyTeam = buildEnemyTeam(d);
    const battle = simulateBattle(playerTeam, enemyTeam);

    if (battle.winner !== "A") {
      setResult({ winner: battle.winner, log: battle.log });
      // Pas de reward, mais on consomme énergie
      if (supabase) {
        await supabase.rpc("eternum_consume_my_energy", {
          p_amount: d.energyCost,
        });
      }
      return;
    }

    // Victoire — applique rewards.
    const osReward =
      d.rewards.osMin +
      Math.floor(Math.random() * (d.rewards.osMax - d.rewards.osMin + 1));
    const xpReward =
      d.rewards.xpMin +
      Math.floor(Math.random() * (d.rewards.xpMax - d.rewards.xpMin + 1));
    const dropped: { resource_id: string; count: number }[] = [];
    for (const r of d.rewards.resources) {
      if (Math.random() < r.chance) {
        const n = r.min + Math.floor(Math.random() * (r.max - r.min + 1));
        dropped.push({ resource_id: r.id, count: n });
      }
    }

    if (!supabase) {
      setResult({ winner: battle.winner, log: battle.log });
      return;
    }

    // Consomme énergie via RPC dédié + applique récompenses
    const { data: energyOk } = await supabase.rpc(
      "eternum_consume_my_energy",
      { p_amount: d.energyCost },
    );
    void energyOk;

    const { error: rpcErr } = await supabase.rpc(
      "eternum_record_dungeon_win",
      {
        p_dungeon_id: d.id,
        p_floor: 1,
        p_os_reward: osReward,
        p_xp_reward: xpReward,
        p_resources: dropped,
      },
    );
    if (rpcErr) {
      setError(rpcErr.message);
    }

    setResult({
      winner: battle.winner,
      log: battle.log,
      rewards: {
        os: osReward,
        xp: xpReward,
        resources: dropped.map((r) => `${r.count} × ${r.resource_id}`),
      },
    });
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 text-sm text-zinc-400">
        Donjons solo : héros + 5 familiers actifs. Tour-par-tour
        auto-résolu. Choisis ton donjon.
      </div>

      {error && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2">
        {ETERNUM_DUNGEONS.map((d) => {
          const best = progressMap.get(d.id) ?? 0;
          return (
            <div
              key={d.id}
              className="flex flex-col gap-2 rounded-xl border border-amber-400/30 bg-black/40 p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-base font-bold text-amber-200">
                    {d.glyph} {d.name}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Niv recommandé : {d.recommendedLevel} · {d.energyCost} ⚡
                  </div>
                </div>
                {best > 0 && (
                  <span className="rounded bg-emerald-400/20 px-2 py-0.5 text-[10px] text-emerald-300">
                    Best floor {best}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-400">{d.description}</div>
              <div className="text-[10px] text-zinc-500">
                Ennemis : {d.enemies.length} ·{" "}
                Drops : {d.rewards.osMin}-{d.rewards.osMax} OS, {d.rewards.xpMin}-
                {d.rewards.xpMax} XP, ressources
              </div>
              <button
                onClick={() => {
                  setSelected(d);
                  fight(d);
                }}
                disabled={team.length === 0 || hero.energy < d.energyCost}
                className="mt-1 rounded-md bg-amber-500 px-3 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-40"
              >
                ⚔️ Combattre
              </button>
            </div>
          );
        })}
      </div>

      {result && selected && (
        <CombatResultOverlay
          dungeon={selected}
          result={result}
          onClose={() => {
            setResult(null);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function CombatResultOverlay({
  dungeon,
  result,
  onClose,
}: {
  dungeon: DungeonConfig;
  result: {
    winner: "A" | "B" | "draw";
    log: CombatLog[];
    rewards?: { os: number; xp: number; resources: string[] };
  };
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-amber-400/40 bg-zinc-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between">
          <div>
            <div
              className={`text-2xl font-bold ${
                result.winner === "A"
                  ? "text-emerald-300"
                  : result.winner === "B"
                    ? "text-rose-300"
                    : "text-zinc-300"
              }`}
            >
              {result.winner === "A"
                ? "🏆 Victoire !"
                : result.winner === "B"
                  ? "💀 Défaite"
                  : "🤝 Égalité"}
            </div>
            <div className="text-xs text-zinc-400">
              {dungeon.name} · {result.log.length} actions
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            ✕
          </button>
        </div>

        {result.rewards && (
          <div className="mt-3 shrink-0 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
            <div className="font-bold text-amber-200">🎁 Récompenses</div>
            <div className="mt-1 text-amber-100">
              +{result.rewards.os.toLocaleString("fr-FR")} OS · +
              {result.rewards.xp.toLocaleString("fr-FR")} XP
            </div>
            {result.rewards.resources.length > 0 && (
              <div className="mt-1 text-xs text-amber-100">
                {result.rewards.resources.join(" · ")}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-md bg-black/40 p-3 text-xs text-zinc-300">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
            Journal de combat
          </div>
          {result.log.map((l, i) => (
            <div key={i} className="leading-snug">
              <span className="mr-1 text-zinc-600">[T{l.turn}]</span>
              {l.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
