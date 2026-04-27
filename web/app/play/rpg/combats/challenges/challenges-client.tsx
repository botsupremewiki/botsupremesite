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
  ETERNUM_WEEKLY_CHALLENGES,
  type ChallengeConfig,
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
  challenge: ChallengeConfig;
  teamA: CombatUnit[];
  teamB: CombatUnit[];
  forcedWinner: "A" | "B";
  unitRarities: Record<string, "common" | "rare" | "epic" | "legendary" | "prismatic">;
  unitDisplayGlyphs: Record<string, string>;
  rewards?: { os: number; resources: string[] };
};

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
  const [session, setSession] = useState<FightSession | null>(null);
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
      const elt = f.element_id as EternumElementId;
      units.push(
        buildFamilierUnit(
          `fam-${f.id}`,
          familierDisplayName(base, elt),
          base.classId,
          elt,
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
    setSession(null);
    if (!supabase) return;

    const built = buildPlayerTeam(c);
    if (built.error) {
      setError(built.error);
      return;
    }

    // ⚠️ Server-authoritative — restrictions vérifiées server-side.
    const { data, error: rpcErr } = await supabase.rpc(
      "eternum_attempt_challenge",
      { p_challenge_id: c.id },
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
          resources_gained?: { resource_id: string; count: number }[];
        }
      | { ok: false; error: string };
    if (!r.ok) {
      setError(r.error);
      return;
    }

    if (r.won) setDone([...done, c.id]);

    const rarities: Record<string, "common" | "rare" | "epic" | "legendary" | "prismatic"> = {
      hero: "legendary",
    };
    const glyphs: Record<string, string> = {};
    for (const f of team) {
      const base = ETERNUM_FAMILIERS_BY_ID.get(f.familier_id);
      if (base) {
        rarities[`fam-${f.id}`] = base.rarity;
        glyphs[`fam-${f.id}`] = base.glyph;
      }
    }

    setSession({
      challenge: c,
      teamA: built.units,
      teamB: buildEnemy(),
      forcedWinner: r.won ? "A" : "B",
      unitRarities: rarities,
      unitDisplayGlyphs: glyphs,
      rewards: r.won
        ? {
            os: r.os_gained ?? c.rewardOs,
            resources: (r.resources_gained ?? []).map(
              (rs) => `${rs.count}× ${rs.resource_id}`,
            ),
          }
        : undefined,
    });
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

      <AtbBattleModal
        open={session !== null}
        teamA={session?.teamA ?? []}
        teamB={session?.teamB ?? []}
        forcedWinner={session?.forcedWinner}
        ambiance="boss"
        unitRarities={session?.unitRarities}
        unitDisplayGlyphs={session?.unitDisplayGlyphs}
        title={session ? `${session.challenge.glyph} ${session.challenge.name}` : ""}
        rewards={session?.rewards}
        onComplete={() => {
          setSession(null);
          router.refresh();
        }}
        closeLabel="Continuer"
      />
    </div>
  );
}
