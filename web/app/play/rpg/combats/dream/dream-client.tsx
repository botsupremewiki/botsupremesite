"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  type EternumElementId,
  type EternumHero,
  type EternumRarity,
} from "@shared/types";
import { ETERNUM_FAMILIERS_BY_ID } from "@shared/eternum-familiers";
import { ETERNUM_DREAMS, type DreamConfig } from "@shared/eternum-content";
import {
  buildFamilierUnit,
  buildHeroUnit,
  simulateBattle,
  type CombatLog,
  type CombatUnit,
} from "@shared/eternum-combat";
import { createClient } from "@/lib/supabase/client";
import type { OwnedFamilier } from "../../familiers/page";

export function DreamClient({
  hero,
  team,
}: {
  hero: EternumHero;
  team: OwnedFamilier[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<{
    winner: "A" | "B" | "draw";
    log: CombatLog[];
    shards?: { rarity: string; count: number }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  function buildPlayerTeam(): CombatUnit[] {
    const units: CombatUnit[] = [
      buildHeroUnit(
        "hero",
        ETERNUM_CLASSES[hero.classId].name,
        hero.classId,
        hero.elementId,
        hero.level,
        "A",
      ),
    ];
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

  function buildEnemy(d: DreamConfig): CombatUnit[] {
    // Boss + 2 minions, scale par recommendedLevel.
    const lv = d.recommendedLevel;
    return [
      buildFamilierUnit(`dream-mob1`, "Cauchemar mineur", "assassin", "dark", lv, { hp: 200 + lv * 10, atk: 40 + lv, def: 15, spd: 18 }, "B"),
      buildFamilierUnit(`dream-mob2`, "Songe maudit", "mage", "dark", lv, { hp: 250 + lv * 12, atk: 50 + lv, def: 18, spd: 16 }, "B"),
      buildFamilierUnit(`dream-boss`, "Maître des Rêves", "vampire", "dark", lv + 5, { hp: 800 + lv * 30, atk: 80 + lv * 2, def: 30, spd: 20 }, "B"),
    ];
  }

  async function fight(d: DreamConfig) {
    setError(null);
    setResult(null);
    if (hero.energy < d.energyCost) {
      setError(`Énergie insuffisante (${hero.energy}/${d.energyCost}).`);
      return;
    }
    if (team.length === 0) {
      setError("Configure ton équipe de familiers d'abord.");
      return;
    }

    const playerTeam = buildPlayerTeam();
    const enemy = buildEnemy(d);
    const battle = simulateBattle(playerTeam, enemy, 50);

    if (!supabase) return;
    await supabase.rpc("eternum_consume_my_energy", { p_amount: d.energyCost });

    if (battle.winner !== "A") {
      setResult({ winner: battle.winner, log: battle.log });
      return;
    }

    // Drops shards selon shardsByRarity (chance par rareté).
    const drops: { rarity: string; count: number }[] = [];
    for (const [rarity, chance] of Object.entries(d.shardsByRarity)) {
      if (Math.random() < chance) {
        const count = 1 + Math.floor(Math.random() * 3);
        drops.push({ rarity, count });
      }
    }

    if (drops.length > 0) {
      await supabase.rpc("eternum_record_dream", {
        p_dream_id: d.id,
        p_shards: drops.map((dr) => ({
          shard_rarity: dr.rarity,
          count: dr.count,
        })),
      });
    }

    setResult({
      winner: battle.winner,
      log: battle.log,
      shards: drops,
    });
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 text-sm text-zinc-400">
        Mode Rêve — combats hardcore qui drop des <strong>shards</strong> pour
        évoluer tes familiers (5 commun → 100 prismatique par étoile).
      </div>

      {error && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-3">
        {ETERNUM_DREAMS.map((d) => (
          <div key={d.id} className="flex flex-col gap-2 rounded-xl border border-indigo-400/30 bg-black/40 p-4">
            <div className="text-3xl">{d.glyph}</div>
            <div className="text-base font-bold text-indigo-200">{d.name}</div>
            <div className="text-[11px] text-zinc-400">
              Niv recommandé : {d.recommendedLevel} · ⚡ {d.energyCost}
            </div>
            <div className="text-[11px] text-zinc-400">{d.description}</div>
            <div className="rounded bg-white/5 p-2 text-[10px] text-amber-200">
              Drops :{" "}
              {Object.entries(d.shardsByRarity)
                .map(([r, c]) => `${r} ${Math.round(c * 100)}%`)
                .join(" · ")}
            </div>
            <button
              onClick={() => fight(d)}
              disabled={hero.energy < d.energyCost || team.length === 0}
              className="mt-1 rounded-md bg-indigo-500 px-3 py-2 text-sm font-bold text-indigo-950 hover:bg-indigo-400 disabled:opacity-40"
            >
              ⚔️ Affronter
            </button>
          </div>
        ))}
      </div>

      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setResult(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-indigo-400/40 bg-zinc-950 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`text-2xl font-bold ${result.winner === "A" ? "text-emerald-300" : "text-rose-300"}`}
            >
              {result.winner === "A" ? "🌙 Rêve maîtrisé" : "💀 Englouti par le rêve"}
            </div>
            {result.shards && result.shards.length > 0 && (
              <div className="mt-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-200">
                💎 Shards drops :{" "}
                {result.shards.map((s) => `${s.count}× shard-${s.rarity}`).join(" · ")}
              </div>
            )}
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-md bg-black/40 p-3 text-xs">
              {result.log.map((l, i) => (
                <div key={i}>
                  <span className="mr-1 text-zinc-600">[T{l.turn}]</span>
                  {l.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
