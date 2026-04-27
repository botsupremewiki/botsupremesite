"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  type EternumElementId,
  type EternumHero,
} from "@shared/types";
import {
  ETERNUM_FAMILIERS_BY_ID,
  familierDisplayName,
} from "@shared/eternum-familiers";
import {
  ETERNUM_DUNGEONS,
  type DungeonConfig,
} from "@shared/eternum-content";
import {
  buildFamilierUnit,
  buildHeroUnit,
  type CombatUnit,
} from "@shared/eternum-combat";
import { AtbBattleModal } from "@/components/eternum/atb-battle";
import { createClient } from "@/lib/supabase/client";
import type { OwnedFamilier } from "../../familiers/page";

type FightSession = {
  dungeon: DungeonConfig;
  teamA: CombatUnit[];
  teamB: CombatUnit[];
  forcedWinner: "A" | "B";
  unitRarities: Record<string, "common" | "rare" | "epic" | "legendary" | "prismatic">;
  unitDisplayGlyphs: Record<string, string>;
  rewards?: { os: number; xp: number; resources: string[] };
};

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
  const [session, setSession] = useState<FightSession | null>(null);
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
      const elt = f.element_id as EternumElementId;
      units.push(
        buildFamilierUnit(
          `fam-${f.id}`,
          familierDisplayName(base, elt), // "Loup-Alpha igné", "Tigron glacial", etc.
          base.classId,
          elt,
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
    setSession(null);
    if (!supabase) return;

    // ⚠️ Server-authoritative : on demande "j'attaque ce donjon",
    // le serveur calcule l'outcome + les rewards.
    const { data, error: rpcErr } = await supabase.rpc(
      "eternum_attempt_dungeon",
      { p_dungeon_id: d.id },
    );
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as
      | {
          ok: true;
          won: boolean;
          os_gained?: number;
          xp_gained?: number;
          resources_gained?: { resource_id: string; count: number }[];
          player_power?: number;
          required_power?: number;
        }
      | { ok: false; error: string };
    if (!r.ok) {
      setError(r.error);
      return;
    }

    // Map id → rareté pour cadres précis + glyph familier custom
    const rarities: Record<string, "common" | "rare" | "epic" | "legendary" | "prismatic"> = {
      hero: "legendary",
    };
    const glyphs: Record<string, string> = {};
    for (const f of team) {
      const base = ETERNUM_FAMILIERS_BY_ID.get(f.familier_id);
      if (base) {
        rarities[`fam-${f.id}`] = base.rarity;
        glyphs[`fam-${f.id}`] = base.glyph; // 🐺 🐉 🦁 ... unique par familier_id
      }
    }

    // Lance le combat ATB tactique avec le résultat serveur en input.
    setSession({
      dungeon: d,
      teamA: buildPlayerTeam(),
      teamB: buildEnemyTeam(d),
      forcedWinner: r.won ? "A" : "B",
      unitRarities: rarities,
      unitDisplayGlyphs: glyphs,
      rewards: r.won
        ? {
            os: r.os_gained ?? 0,
            xp: r.xp_gained ?? 0,
            resources: (r.resources_gained ?? []).map(
              (rs) => `${rs.count} × ${rs.resource_id}`,
            ),
          }
        : undefined,
    });
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
                onClick={() => fight(d)}
                disabled={team.length === 0 || hero.energy < d.energyCost}
                className="mt-1 rounded-md bg-amber-500 px-3 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-40"
              >
                ⚔️ Combattre
              </button>
            </div>
          );
        })}
      </div>

      <AtbBattleModal
        open={session !== null}
        teamA={session?.teamA ?? []}
        teamB={session?.teamB ?? []}
        forcedWinner={session?.forcedWinner}
        ambiance="dungeon"
        unitRarities={session?.unitRarities}
        unitDisplayGlyphs={session?.unitDisplayGlyphs}
        title={session ? `${session.dungeon.glyph} ${session.dungeon.name}` : ""}
        rewards={
          session?.rewards
            ? {
                os: session.rewards.os,
                xp: session.rewards.xp,
                resources: session.rewards.resources,
              }
            : undefined
        }
        onComplete={() => {
          setSession(null);
          router.refresh();
        }}
        closeLabel="Récupérer & continuer"
      />
    </div>
  );
}
