"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type BpLevel = {
  level: number;
  rewards: { gold: number; packs: number; label: string };
  unlocked: boolean;
  claimed: boolean;
};

const XP_PER_LEVEL = 200;
const MAX_LEVEL = 50;

export function BattlePassClient({
  gameId,
  seasonNumber,
  xp,
  level,
  levels,
}: {
  gameId: string;
  seasonNumber: number;
  xp: number;
  level: number;
  levels: BpLevel[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function claim(lvl: number) {
    setBusy(lvl);
    setError(null);
    setToast(null);
    const supabase = createClient();
    if (!supabase) {
      setBusy(null);
      return;
    }
    const { data, error: rpcErr } = await supabase.rpc(
      "claim_battle_pass_level",
      { p_game_id: gameId, p_level: lvl },
    );
    setBusy(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as { gold: number; packs: number };
    setToast(
      `Niveau ${lvl} : +${r.gold} OS${r.packs > 0 ? ` + ${r.packs} booster` : ""}`,
    );
    startTransition(() => router.refresh());
  }

  const xpToNextLevel = level >= MAX_LEVEL ? 0 : level * XP_PER_LEVEL - xp;
  const progressInLevel =
    level >= MAX_LEVEL
      ? 1
      : (xp - (level - 1) * XP_PER_LEVEL) / XP_PER_LEVEL;
  const claimable = levels.filter((l) => l.unlocked && !l.claimed).length;

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* ── Header progression ──────────────────────────────────── */}
      <div className="rounded-xl border border-amber-300/40 bg-gradient-to-br from-amber-300/10 to-violet-500/10 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-amber-200/70">
              Saison #{seasonNumber}
            </div>
            <div className="text-3xl font-bold text-amber-100">
              Niveau {level}{" "}
              <span className="text-base font-normal text-zinc-400">
                / {MAX_LEVEL}
              </span>
            </div>
          </div>
          <div className="text-right text-xs text-zinc-300">
            <div className="font-bold tabular-nums text-amber-200">
              {xp.toLocaleString()} XP
            </div>
            {xpToNextLevel > 0 ? (
              <div className="text-[10px] text-zinc-500">
                {xpToNextLevel} XP pour niveau {level + 1}
              </div>
            ) : (
              <div className="text-[10px] text-emerald-300">Pass MAX 🏆</div>
            )}
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-400 transition-all"
            style={{ width: `${progressInLevel * 100}%` }}
          />
        </div>
        {claimable > 0 ? (
          <div className="mt-2 text-xs text-amber-200">
            ✨ {claimable} récompense{claimable > 1 ? "s" : ""} à réclamer !
          </div>
        ) : null}
      </div>

      {/* ── Track des paliers ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {levels.map((lvl) => (
          <div
            key={lvl.level}
            className={`rounded-xl border p-3 transition-colors ${
              lvl.claimed
                ? "border-zinc-400/20 bg-zinc-400/5 opacity-50"
                : lvl.unlocked
                  ? "border-emerald-400/40 bg-emerald-400/5"
                  : "border-white/10 bg-black/40"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Niveau
                </div>
                <div className="text-2xl font-bold text-zinc-100">
                  {lvl.level}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {lvl.rewards.label}
                </div>
                <div className="text-sm font-bold text-amber-200">
                  {lvl.rewards.gold > 0
                    ? `+${lvl.rewards.gold} OS`
                    : null}
                  {lvl.rewards.packs > 0
                    ? ` ${lvl.rewards.packs > 0 && lvl.rewards.gold > 0 ? "·" : ""} +${lvl.rewards.packs} 🎴`
                    : null}
                </div>
              </div>
            </div>
            <div className="mt-3">
              {lvl.claimed ? (
                <span className="text-[11px] uppercase tracking-widest text-zinc-500">
                  ✅ Réclamé
                </span>
              ) : lvl.unlocked ? (
                <button
                  type="button"
                  disabled={busy === lvl.level}
                  onClick={() => claim(lvl.level)}
                  className="w-full rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
                >
                  {busy === lvl.level ? "…" : "Réclamer"}
                </button>
              ) : (
                <div className="text-center text-[10px] uppercase tracking-widest text-zinc-600">
                  🔒 {lvl.level * XP_PER_LEVEL} XP requis
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {error ? <div className="text-xs text-rose-300">{error}</div> : null}
      {toast ? <div className="text-xs text-emerald-300">{toast}</div> : null}
    </div>
  );
}
