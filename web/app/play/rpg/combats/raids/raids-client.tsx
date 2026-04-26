"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  type EternumHero,
} from "@shared/types";
import { ETERNUM_RAIDS, type RaidConfig } from "@shared/eternum-content";
import {
  buildFamilierUnit,
  buildHeroUnit,
  simulateBattle,
  type CombatLog,
} from "@shared/eternum-combat";
import { createClient } from "@/lib/supabase/client";

export function RaidsClient({ hero }: { hero: EternumHero }) {
  const router = useRouter();
  const [result, setResult] = useState<{
    winner: "A" | "B" | "draw";
    log: CombatLog[];
    rewards?: { os: number; xp: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RaidConfig | null>(null);
  const supabase = useMemo(() => createClient(), []);

  async function fight(r: RaidConfig) {
    setError(null);
    setResult(null);
    setSelected(r);

    if (hero.energy < r.energyCost) {
      setError(`Énergie insuffisante (${hero.energy}/${r.energyCost}).`);
      return;
    }

    // Héros only en raid (la spec : pas de familiers).
    const playerTeam = [
      buildHeroUnit(
        "hero",
        ETERNUM_CLASSES[hero.classId].name,
        hero.classId,
        hero.elementId,
        hero.level,
        "A",
      ),
    ];
    const boss = [
      buildFamilierUnit(
        "boss",
        r.bossName,
        "warrior",
        r.bossElement,
        100,
        { hp: r.bossHp, atk: r.bossAtk, def: r.bossDef, spd: r.bossSpd },
        "B",
      ),
    ];
    const battle = simulateBattle(playerTeam, boss, 50);

    if (!supabase) return;
    await supabase.rpc("eternum_consume_my_energy", { p_amount: r.energyCost });

    if (battle.winner === "A") {
      // Apply rewards as a dungeon win (réutilise le RPC).
      await supabase.rpc("eternum_record_dungeon_win", {
        p_dungeon_id: `raid-${r.id}`,
        p_floor: 1,
        p_os_reward: r.rewardOs,
        p_xp_reward: r.rewardXp,
        p_resources: [],
      });
      setResult({
        winner: battle.winner,
        log: battle.log,
        rewards: { os: r.rewardOs, xp: r.rewardXp },
      });
    } else {
      setResult({ winner: battle.winner, log: battle.log });
    }
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 text-sm text-zinc-400">
        Raids : héros only (sans familiers). Pour MVP solo — version coop
        multi via PartyKit dans une session future.
      </div>

      {error && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-3">
        {ETERNUM_RAIDS.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-emerald-400/30 bg-black/40 p-4">
            <div className="text-3xl">{r.glyph}</div>
            <div className="text-base font-bold text-emerald-200">{r.name}</div>
            <div className="text-[11px] text-zinc-400">
              {r.bossName} · {r.bossElement} · niv recommandé {r.recommendedLevel}
            </div>
            <div className="text-[10px] text-zinc-500">
              HP : {r.bossHp.toLocaleString("fr-FR")} · ATK {r.bossAtk} · DEF{" "}
              {r.bossDef}
            </div>
            <div className="text-[10px] text-amber-300">
              Reward : {r.rewardOs.toLocaleString("fr-FR")} OS + {r.rewardXp} XP
            </div>
            <div className="text-[10px] text-zinc-500">⚡ {r.energyCost}</div>
            <button
              onClick={() => fight(r)}
              disabled={hero.energy < r.energyCost}
              className="mt-1 rounded-md bg-emerald-500 px-3 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              ⚔️ Affronter
            </button>
          </div>
        ))}
      </div>

      {result && selected && (
        <ResultOverlay
          name={selected.name}
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

function ResultOverlay({
  name,
  result,
  onClose,
}: {
  name: string;
  result: {
    winner: "A" | "B" | "draw";
    log: CombatLog[];
    rewards?: { os: number; xp: number };
  };
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-emerald-400/40 bg-zinc-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between">
          <div>
            <div
              className={`text-2xl font-bold ${result.winner === "A" ? "text-emerald-300" : "text-rose-300"}`}
            >
              {result.winner === "A" ? "🏆 Victoire !" : "💀 Défaite"}
            </div>
            <div className="text-xs text-zinc-400">{name}</div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            ✕
          </button>
        </div>
        {result.rewards && (
          <div className="mt-3 shrink-0 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-amber-100">
            +{result.rewards.os.toLocaleString("fr-FR")} OS · +{result.rewards.xp} XP
          </div>
        )}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-md bg-black/40 p-3 text-xs text-zinc-300">
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
