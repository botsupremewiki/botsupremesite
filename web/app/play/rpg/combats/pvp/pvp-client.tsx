"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
  type EternumClassId,
  type EternumElementId,
  type EternumHero,
} from "@shared/types";
import {
  buildHeroUnit,
  type CombatUnit,
} from "@shared/eternum-combat";
import {
  buildPlayerCombatLoadout,
  type OwnedEquippedItem,
} from "@shared/eternum-loadout";
import { AtbBattleModal } from "@/components/eternum/atb-battle";
import { createClient } from "@/lib/supabase/client";

type Opponent = {
  user_id: string;
  class_id: string;
  element_id: string;
  level: number;
  pvp_elo: number;
};

type FightSession = {
  opp: Opponent;
  teamA: CombatUnit[];
  teamB: CombatUnit[];
  forcedWinner: "A" | "B";
  eloAfter: number;
  won: boolean;
};

export function PvpClient({
  hero,
  items,
  opponents,
  selfId,
}: {
  hero: EternumHero;
  items: OwnedEquippedItem[];
  opponents: Opponent[];
  selfId: string;
}) {
  void selfId;
  const router = useRouter();
  const [session, setSession] = useState<FightSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  async function challenge(opp: Opponent) {
    setError(null);
    setSession(null);
    if (!supabase) return;

    // ⚠️ Server décide le winner basé sur power comparison.
    const { data, error: rpcErr } = await supabase.rpc("eternum_attempt_pvp", {
      p_defender_id: opp.user_id,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as
      | {
          ok: true;
          won: boolean;
          attacker_elo_after: number;
          defender_elo_after: number;
        }
      | { ok: false; error: string };
    if (!r.ok) {
      setError(r.error);
      return;
    }

    // PvP = héros vs héros. Helper applique les items équipés sur héros.
    const playerLoadout = buildPlayerCombatLoadout(hero, [], items);
    const teamA: CombatUnit[] = playerLoadout.units;
    const teamB: CombatUnit[] = [
      buildHeroUnit(
        `opp-${opp.user_id}`,
        `${ETERNUM_CLASSES[opp.class_id as EternumClassId].name} adverse`,
        opp.class_id as EternumClassId,
        opp.element_id as EternumElementId,
        opp.level,
        "B",
      ),
    ];

    setSession({
      opp,
      teamA,
      teamB,
      forcedWinner: r.won ? "A" : "B",
      eloAfter: r.attacker_elo_after,
      won: r.won,
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 rounded-xl border border-violet-400/40 bg-black/40 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-bold text-violet-200">⚔️ Arène PvP</div>
            <div className="text-xs text-zinc-400">
              Défie un autre joueur — combat héros vs héros (familiers à venir).
              ELO actuel : <span className="font-bold text-violet-300">N/A</span>{" "}
              (lazy-init au 1er match).
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {opponents.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
            Aucun adversaire encore. Sois le premier joueur Eternum !
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {opponents.map((o) => {
              const cls = ETERNUM_CLASSES[o.class_id as EternumClassId];
              const elt = ETERNUM_ELEMENTS[o.element_id as EternumElementId];
              return (
                <div
                  key={o.user_id}
                  className="flex items-center justify-between rounded-md border border-violet-400/30 bg-black/40 p-3"
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {cls.glyph} {elt.glyph} {cls.name} de {elt.name}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      Niveau {o.level} · ELO {o.pvp_elo}
                    </div>
                  </div>
                  <button
                    onClick={() => challenge(o)}
                    className="rounded-md bg-violet-500 px-3 py-1.5 text-xs font-bold text-violet-950 hover:bg-violet-400"
                  >
                    Défier
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AtbBattleModal
        open={session !== null}
        teamA={session?.teamA ?? []}
        teamB={session?.teamB ?? []}
        forcedWinner={session?.forcedWinner}
        ambiance="pvp"
        title={
          session
            ? `⚔️ PvP vs ${ETERNUM_CLASSES[session.opp.class_id as EternumClassId].name}`
            : ""
        }
        rewards={
          session
            ? {
                custom: `ELO : ${session.eloAfter} ${session.won ? "📈" : "📉"}`,
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
