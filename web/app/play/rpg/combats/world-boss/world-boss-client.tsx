"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_WORLD_BOSS,
} from "@shared/eternum-content";
import {
  ETERNUM_FAMILIERS_BY_ID,
} from "@shared/eternum-familiers";
import {
  buildFamilierUnit,
  type CombatUnit,
} from "@shared/eternum-combat";
import type { EternumElementId } from "@shared/types";
import { AtbBattleModal } from "@/components/eternum/atb-battle";
import { createClient } from "@/lib/supabase/client";
import type { OwnedFamilier } from "../../familiers/page";
import type { LeaderboardRow } from "./page";

type FightSession = {
  teamA: CombatUnit[];
  teamB: CombatUnit[];
  damage: number;
  osGained: number;
};

export function WorldBossClient({
  team,
  leaderboard,
  attemptsToday,
  selfId,
}: {
  team: OwnedFamilier[];
  leaderboard: LeaderboardRow[];
  attemptsToday: number;
  selfId: string;
}) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(attemptsToday);
  const [session, setSession] = useState<FightSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  function buildPlayerTeam(): CombatUnit[] {
    const units: CombatUnit[] = [];
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

  function buildBoss(): CombatUnit[] {
    return [
      buildFamilierUnit(
        "boss",
        ETERNUM_WORLD_BOSS.name,
        "warrior",
        ETERNUM_WORLD_BOSS.element,
        100,
        {
          hp: ETERNUM_WORLD_BOSS.hp,
          atk: ETERNUM_WORLD_BOSS.atk,
          def: ETERNUM_WORLD_BOSS.def,
          spd: ETERNUM_WORLD_BOSS.spd,
        },
        "B",
      ),
    ];
  }

  async function attack() {
    setError(null);
    setSession(null);
    if (!supabase) return;

    // ⚠️ Server-authoritative : le serveur calcule les dégâts à partir du
    // power du joueur, on n'envoie rien.
    const { data, error: rpcErr } = await supabase.rpc(
      "eternum_attempt_world_boss",
    );
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as
      | { ok: true; damage: number; os_gained: number; attempts_used: number }
      | { ok: false; error: string };
    if (!r.ok) {
      setError(r.error);
      return;
    }

    setAttempts(r.attempts_used);
    // Le boss "gagne" toujours côté narratif (HP énorme), on inflige juste
    // un score de dégâts côté serveur.
    setSession({
      teamA: buildPlayerTeam(),
      teamB: buildBoss(),
      damage: r.damage,
      osGained: r.os_gained,
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 rounded-2xl border border-fuchsia-400/40 bg-black/50 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-3xl">🤖 {ETERNUM_WORLD_BOSS.name}</div>
            <div className="mt-1 text-xs text-zinc-400">
              World Boss · familiers only · 3 attempts/jour ·{" "}
              <span className="text-fuchsia-300">
                {attempts} / 3 utilisés aujourd&apos;hui
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <Stat label="ATK" value={ETERNUM_WORLD_BOSS.atk} />
              <Stat label="DEF" value={ETERNUM_WORLD_BOSS.def} />
              <Stat label="SPD" value={ETERNUM_WORLD_BOSS.spd} />
            </div>
            <div className="mt-2 text-[10px] text-zinc-500">
              Récompense : 1 OS pour 100 dégâts infligés. Top 10% du jour =
              pierres prismatiques (P10).
            </div>
          </div>
          <button
            onClick={attack}
            disabled={attempts >= 3 || team.length === 0}
            className="rounded-md bg-fuchsia-500 px-5 py-3 text-sm font-bold text-fuchsia-950 hover:bg-fuchsia-400 disabled:opacity-40"
          >
            ⚔️ Attaquer
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2">
        <section className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <div className="shrink-0 border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-400">
            🏆 Leaderboard du jour (top 20)
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {leaderboard.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
                Aucune attaque aujourd&apos;hui. Sois le premier !
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {leaderboard.map((row, i) => (
                  <div
                    key={`${row.user_id}-${i}`}
                    className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${
                      row.user_id === selfId
                        ? "border-fuchsia-400/50 bg-fuchsia-400/10"
                        : "border-white/5 bg-white/[0.03]"
                    }`}
                  >
                    <span className="text-zinc-300">
                      #{i + 1} {row.user_id === selfId ? "(toi)" : `Joueur ${row.user_id.slice(0, 6)}`}
                    </span>
                    <span className="font-bold tabular-nums text-fuchsia-300">
                      {row.damage.toLocaleString("fr-FR")} dmg
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </div>

      <AtbBattleModal
        open={session !== null}
        teamA={session?.teamA ?? []}
        teamB={session?.teamB ?? []}
        forcedWinner="B"
        title={session ? `🤖 ${ETERNUM_WORLD_BOSS.name}` : ""}
        rewards={
          session
            ? {
                os: session.osGained,
                custom: `⚔️ ${session.damage.toLocaleString("fr-FR")} dégâts infligés`,
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-center">
      <div className="text-[9px] uppercase text-zinc-500">{label}</div>
      <div className="font-semibold tabular-nums text-zinc-100">{value}</div>
    </div>
  );
}
