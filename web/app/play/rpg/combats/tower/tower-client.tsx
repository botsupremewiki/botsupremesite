"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  type EternumElementId,
  type EternumHero,
} from "@shared/types";
import {
  buildFamilierUnit,
  buildHeroUnit,
  simulateBattle,
  type CombatLog,
  type CombatUnit,
} from "@shared/eternum-combat";
import { createClient } from "@/lib/supabase/client";

const ELEMENTS: EternumElementId[] = ["fire", "water", "wind", "earth"];

export function TowerClient({
  hero,
  startFloor,
  leaderboard,
  selfId,
}: {
  hero: EternumHero;
  startFloor: number;
  leaderboard: { user_id: string; best_floor: number }[];
  selfId: string;
}) {
  const router = useRouter();
  const [floor, setFloor] = useState(Math.max(1, startFloor));
  const [result, setResult] = useState<{
    winner: "A" | "B" | "draw";
    log: CombatLog[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  function buildEnemy(f: number): CombatUnit[] {
    // Stats croissantes par étage.
    const lv = Math.min(100, 1 + f);
    const enemyClass = ["warrior", "mage", "assassin"][f % 3] as
      | "warrior"
      | "mage"
      | "assassin";
    const enemyElement = ELEMENTS[f % ELEMENTS.length];
    return [
      buildFamilierUnit(
        `tower-${f}`,
        `Sentinelle ${f}`,
        enemyClass,
        enemyElement,
        lv,
        {
          hp: 100 + f * 30,
          atk: 15 + f * 4,
          def: 5 + f * 2,
          spd: 10 + Math.floor(f * 0.5),
        },
        "B",
      ),
    ];
  }

  async function fight() {
    setError(null);
    setResult(null);
    if (!supabase) return;

    const { data, error: rpcErr } = await supabase.rpc("eternum_attempt_tower", {
      p_floor: floor,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as
      | { ok: true; won: boolean; floor?: number }
      | { ok: false; error: string };
    if (!r.ok) {
      setError(r.error);
      return;
    }

    // Log cosmétique
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
    const enemy = buildEnemy(floor);
    const battle = simulateBattle(playerTeam, enemy, 30);
    setResult({ winner: r.won ? "A" : "B", log: battle.log });

    if (r.won) {
      setFloor(floor + 1);
      router.refresh();
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 rounded-2xl border border-sky-400/40 bg-black/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-3xl">🗼 Tour Infinie</div>
            <div className="mt-1 text-xs text-zinc-400">
              Étage actuel : <span className="text-sky-300">{floor}</span> · Best floor :{" "}
              <span className="text-emerald-300">{startFloor - 1}</span>
            </div>
            <div className="mt-2 text-[10px] text-zinc-500">
              Difficulté croissante. Pas de coût d&apos;énergie. Si tu perds,
              tu peux retenter.
            </div>
          </div>
          <button
            onClick={fight}
            className="rounded-md bg-sky-500 px-5 py-3 text-sm font-bold text-sky-950 hover:bg-sky-400"
          >
            ⚔️ Étage {floor}
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40">
        <div className="shrink-0 border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-400">
          🏆 Leaderboard Tour
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {leaderboard.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
              Soit le premier à grimper !
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {leaderboard.map((row, i) => (
                <div
                  key={row.user_id}
                  className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${
                    row.user_id === selfId
                      ? "border-sky-400/50 bg-sky-400/10"
                      : "border-white/5 bg-white/[0.03]"
                  }`}
                >
                  <span>
                    #{i + 1} {row.user_id === selfId ? "(toi)" : `Joueur ${row.user_id.slice(0, 6)}`}
                  </span>
                  <span className="font-bold tabular-nums text-sky-300">
                    Étage {row.best_floor}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setResult(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border-2 border-sky-400/40 bg-zinc-950 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`text-2xl font-bold ${result.winner === "A" ? "text-emerald-300" : "text-rose-300"}`}
            >
              {result.winner === "A" ? "🏆 Étage validé !" : "💀 Échec"}
            </div>
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
