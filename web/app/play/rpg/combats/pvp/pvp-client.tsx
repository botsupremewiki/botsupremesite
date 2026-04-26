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
  simulateBattle,
  type CombatLog,
} from "@shared/eternum-combat";
import { createClient } from "@/lib/supabase/client";

type Opponent = {
  user_id: string;
  class_id: string;
  element_id: string;
  level: number;
  pvp_elo: number;
};

export function PvpClient({
  hero,
  opponents,
  selfId,
}: {
  hero: EternumHero;
  opponents: Opponent[];
  selfId: string;
}) {
  void selfId;
  const router = useRouter();
  const [result, setResult] = useState<{
    winner: "A" | "B" | "draw";
    log: CombatLog[];
    eloAfter?: number;
    opp?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  async function challenge(opp: Opponent) {
    setError(null);
    setResult(null);

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
    const oppTeam = [
      buildHeroUnit(
        `opp-${opp.user_id}`,
        `${ETERNUM_CLASSES[opp.class_id as EternumClassId].name} adverse`,
        opp.class_id as EternumClassId,
        opp.element_id as EternumElementId,
        opp.level,
        "B",
      ),
    ];
    const battle = simulateBattle(playerTeam, oppTeam, 50);

    const winnerId = battle.winner === "A" ? selfId : opp.user_id;
    if (!supabase) return;
    const { data, error: rpcErr } = await supabase.rpc("eternum_record_pvp", {
      p_defender_id: opp.user_id,
      p_winner_id: winnerId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as { attacker_elo_after: number; defender_elo_after: number };
    setResult({
      winner: battle.winner,
      log: battle.log,
      eloAfter: r.attacker_elo_after,
      opp: ETERNUM_CLASSES[opp.class_id as EternumClassId].name,
    });
    router.refresh();
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

      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setResult(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border-2 border-violet-400/40 bg-zinc-950 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`text-2xl font-bold ${result.winner === "A" ? "text-emerald-300" : "text-rose-300"}`}
            >
              {result.winner === "A" ? "🏆 Victoire" : "💀 Défaite"} vs {result.opp}
            </div>
            {result.eloAfter !== undefined && (
              <div className="text-sm text-violet-300">ELO : {result.eloAfter}</div>
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
