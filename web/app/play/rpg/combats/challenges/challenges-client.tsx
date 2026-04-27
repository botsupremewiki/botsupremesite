"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  type EternumElementId,
  type EternumHero,
} from "@shared/types";
import { ETERNUM_FAMILIERS_BY_ID } from "@shared/eternum-familiers";
import {
  ETERNUM_WEEKLY_CHALLENGES,
  type ChallengeConfig,
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

export function ChallengesClient({
  hero,
  team,
  doneIds,
}: {
  hero: EternumHero;
  team: OwnedFamilier[];
  doneIds: string[];
}) {
  const router = useRouter();
  const [done, setDone] = useState<string[]>(doneIds);
  const [result, setResult] = useState<{
    challenge: ChallengeConfig;
    winner: "A" | "B" | "draw";
    log: CombatLog[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  function buildPlayerTeam(c: ChallengeConfig): {
    units: CombatUnit[];
    error?: string;
  } {
    // Pour solo-element : tous les familiers même élément.
    if (c.id === "solo-element" && team.length > 0) {
      const elt = team[0]?.element_id;
      const ok = team.every((f) => f.element_id === elt);
      if (!ok)
        return {
          units: [],
          error: "Restriction violée : tous tes familiers doivent partager le même élément.",
        };
    }

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

    // no-heal : interdit Vampire/Paladin (ils heal en passive).
    if (c.id === "no-heal") {
      if (hero.classId === "vampire" || hero.classId === "paladin") {
        return {
          units: [],
          error: "Restriction : pas de classe avec heal (Vampire / Paladin).",
        };
      }
    }

    for (const f of team) {
      const base = ETERNUM_FAMILIERS_BY_ID.get(f.familier_id);
      if (!base) continue;
      if (c.id === "no-heal" && (base.classId === "vampire" || base.classId === "paladin")) {
        return {
          units: [],
          error: "Restriction : pas de familier avec heal (Vampire / Paladin).",
        };
      }
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
    return { units };
  }

  function buildEnemy(): CombatUnit[] {
    return [
      buildFamilierUnit(
        "challenge-boss",
        "Champion hebdo",
        "warrior",
        "dark",
        50,
        { hp: 5000, atk: 100, def: 50, spd: 20 },
        "B",
      ),
    ];
  }

  async function fight(c: ChallengeConfig) {
    setError(null);
    setResult(null);
    if (done.includes(c.id)) {
      setError("Déjà complété cette semaine.");
      return;
    }

    const built = buildPlayerTeam(c);
    if (built.error) {
      setError(built.error);
      return;
    }
    const enemy = buildEnemy();
    // Pour speed-run : cap 8 tours.
    const maxT = c.id === "speed-run" ? 8 : 50;
    const battle = simulateBattle(built.units, enemy, maxT);

    // Pour no-ult : on simule différemment (engine ne supporte pas désactiver
    // les ultimates dynamiquement, on suppose victoire si winner=A).
    if (battle.winner !== "A") {
      setResult({ challenge: c, winner: battle.winner, log: battle.log });
      return;
    }

    if (!supabase) return;
    const { error: rpcErr } = await supabase.rpc("eternum_complete_challenge", {
      p_challenge_id: c.id,
      p_os_reward: c.rewardOs,
      p_resources: c.rewardResources.map((r) => ({
        resource_id: r.id,
        count: r.count,
      })),
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setDone([...done, c.id]);
    setResult({ challenge: c, winner: battle.winner, log: battle.log });
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 text-sm text-zinc-400">
        4 défis hebdo avec restrictions imposées. Récompenses massives. 1
        complétion par semaine par défi.
      </div>

      {error && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2">
        {ETERNUM_WEEKLY_CHALLENGES.map((c) => {
          const isDone = done.includes(c.id);
          return (
            <div
              key={c.id}
              className={`flex flex-col gap-2 rounded-xl border p-4 ${
                isDone
                  ? "border-emerald-400/40 bg-emerald-400/[0.04]"
                  : "border-yellow-400/30 bg-black/40"
              }`}
            >
              <div className="text-3xl">{c.glyph}</div>
              <div className="text-base font-bold text-yellow-200">
                {c.name} {isDone && <span className="text-emerald-300 text-xs">(✅ fait)</span>}
              </div>
              <div className="text-[11px] text-zinc-400">{c.description}</div>
              <div className="rounded bg-white/5 p-2 text-[10px] text-zinc-300">
                📜 {c.rule}
              </div>
              <div className="text-[11px] text-amber-300">
                🎁 +{c.rewardOs.toLocaleString("fr-FR")} OS
                {c.rewardResources.map((r) => ` · ${r.count}× ${r.id}`).join("")}
              </div>
              <button
                onClick={() => fight(c)}
                disabled={isDone || team.length === 0}
                className="mt-1 rounded-md bg-yellow-500 px-3 py-2 text-sm font-bold text-yellow-950 hover:bg-yellow-400 disabled:opacity-40"
              >
                {isDone ? "Complété" : "⚔️ Tenter"}
              </button>
            </div>
          );
        })}
      </div>

      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setResult(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-yellow-400/40 bg-zinc-950 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`text-2xl font-bold ${result.winner === "A" ? "text-emerald-300" : "text-rose-300"}`}
            >
              {result.winner === "A" ? "🏆 Défi relevé" : "💀 Échec"} — {result.challenge.name}
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
