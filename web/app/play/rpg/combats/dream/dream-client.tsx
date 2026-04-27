"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  type EternumElementId,
  type EternumHero,
} from "@shared/types";
import { ETERNUM_FAMILIERS_BY_ID } from "@shared/eternum-familiers";
import { ETERNUM_DREAMS, type DreamConfig } from "@shared/eternum-content";
import {
  buildFamilierUnit,
  buildHeroUnit,
  type CombatUnit,
} from "@shared/eternum-combat";
import { AtbBattleModal } from "@/components/eternum/atb-battle";
import { createClient } from "@/lib/supabase/client";
import type { OwnedFamilier } from "../../familiers/page";

type FightSession = {
  dream: DreamConfig;
  teamA: CombatUnit[];
  teamB: CombatUnit[];
  forcedWinner: "A" | "B";
  shards?: { resource_id: string; count: number }[];
};

export function DreamClient({
  hero,
  team,
}: {
  hero: EternumHero;
  team: OwnedFamilier[];
}) {
  const router = useRouter();
  const [session, setSession] = useState<FightSession | null>(null);
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
    setSession(null);
    if (!supabase) return;

    // ⚠️ Server-authoritative.
    const { data, error: rpcErr } = await supabase.rpc(
      "eternum_attempt_dream",
      { p_dream_id: d.id },
    );
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as
      | {
          ok: true;
          won: boolean;
          shards?: { resource_id: string; count: number }[];
        }
      | { ok: false; error: string };
    if (!r.ok) {
      setError(r.error);
      return;
    }

    setSession({
      dream: d,
      teamA: buildPlayerTeam(),
      teamB: buildEnemy(d),
      forcedWinner: r.won ? "A" : "B",
      shards: r.won ? r.shards ?? [] : undefined,
    });
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

      <AtbBattleModal
        open={session !== null}
        teamA={session?.teamA ?? []}
        teamB={session?.teamB ?? []}
        forcedWinner={session?.forcedWinner}
        ambiance="dream"
        title={session ? `${session.dream.glyph} ${session.dream.name}` : ""}
        rewards={
          session?.shards
            ? {
                resources: session.shards.map(
                  (s) => `${s.count}× ${s.resource_id}`,
                ),
                custom: "💎 Shards récoltés",
              }
            : undefined
        }
        onComplete={() => {
          setSession(null);
          router.refresh();
        }}
        closeLabel="Continuer"
      />
    </div>
  );
}
