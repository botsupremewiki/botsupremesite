"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type EternumHero } from "@shared/types";
import { ETERNUM_RAIDS, type RaidConfig } from "@shared/eternum-content";
import {
  buildFamilierUnit,
  type CombatUnit,
} from "@shared/eternum-combat";
import {
  buildPlayerCombatLoadout,
  type OwnedEquippedItem,
} from "@shared/eternum-loadout";
import { AtbBattleModal } from "@/components/eternum/atb-battle";
import { createClient } from "@/lib/supabase/client";

function generateRoomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

type FightSession = {
  raid: RaidConfig;
  teamA: CombatUnit[];
  teamB: CombatUnit[];
  forcedWinner: "A" | "B";
  rewards?: { os: number; xp: number };
};

export function RaidsClient({
  hero,
  items,
}: {
  hero: EternumHero;
  items: OwnedEquippedItem[];
}) {
  const router = useRouter();
  const [session, setSession] = useState<FightSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  async function fight(r: RaidConfig) {
    setError(null);
    setSession(null);
    if (!supabase) return;

    const { data, error: rpcErr } = await supabase.rpc(
      "eternum_attempt_raid",
      { p_raid_id: r.id },
    );
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const res = data as
      | { ok: true; won: boolean; os_gained?: number; xp_gained?: number }
      | { ok: false; error: string };
    if (!res.ok) {
      setError(res.error);
      return;
    }

    // Raid = héros only. Helper retourne juste le héros avec ses items.
    const playerLoadout = buildPlayerCombatLoadout(hero, [], items);
    const teamA: CombatUnit[] = playerLoadout.units;
    const teamB: CombatUnit[] = [
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

    setSession({
      raid: r,
      teamA,
      teamB,
      forcedWinner: res.won ? "A" : "B",
      rewards: res.won
        ? { os: res.os_gained ?? 0, xp: res.xp_gained ?? 0 }
        : undefined,
    });
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
            <div className="flex gap-1">
              <button
                onClick={() => fight(r)}
                disabled={hero.energy < r.energyCost}
                className="flex-1 rounded-md bg-emerald-500 px-3 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                ⚔️ Solo
              </button>
              <button
                onClick={() => router.push(`/play/rpg/combats/raids/coop/raid-${r.id}-${generateRoomId()}?raid=${r.id}`)}
                className="flex-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-500/20"
                title="Crée une room coop. Partage l'URL avec tes amis."
              >
                🤝 Coop
              </button>
            </div>
          </div>
        ))}
      </div>

      <AtbBattleModal
        open={session !== null}
        teamA={session?.teamA ?? []}
        teamB={session?.teamB ?? []}
        forcedWinner={session?.forcedWinner}
        ambiance="boss"
        title={session ? `${session.raid.glyph} ${session.raid.name}` : ""}
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
