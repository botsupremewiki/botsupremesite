"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Milestone = {
  milestone: number;
  rewards: { gold: number; label: string };
  unlocked: boolean;
  claimed: boolean;
};

type ChainData = {
  streak: number;
  milestones: Milestone[];
};

/** Coffres bonus à 7 / 14 / 30 jours de streak. À afficher SOUS la
 * DailyRewardCard. Lit get_my_daily_chain et claim_daily_chain_milestone. */
export function DailyChainCard() {
  const [data, setData] = useState<ChainData | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "get_my_daily_chain",
    );
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setData(rpcData as ChainData);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function claim(m: number) {
    setBusy(m);
    setError(null);
    setToast(null);
    const supabase = createClient();
    if (!supabase) {
      setBusy(null);
      return;
    }
    const { data: r, error: rpcErr } = await supabase.rpc(
      "claim_daily_chain_milestone",
      { p_milestone: m },
    );
    setBusy(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setToast(`+${(r as { gold: number }).gold} OS reçus !`);
    refresh();
  }

  if (!data) return null;

  return (
    <section className="rounded-xl border border-violet-300/30 bg-gradient-to-br from-violet-500/[0.05] to-fuchsia-500/[0.05] p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold text-violet-100">
          🎁 Coffres de fidélité
        </h2>
        <div className="text-xs text-violet-200">
          Streak actuelle :{" "}
          <span className="font-bold tabular-nums">{data.streak}j</span>
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-400">
        Coffres bonus à 7 / 14 / 30 jours de connexion consécutive (en plus
        de l&apos;OS quotidien). Reset si tu sautes un jour.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {data.milestones.map((m) => (
          <div
            key={m.milestone}
            className={`rounded-lg border p-3 ${
              m.claimed
                ? "border-zinc-400/20 bg-zinc-400/5 opacity-60"
                : m.unlocked
                  ? "border-emerald-400/40 bg-emerald-400/5"
                  : "border-white/10 bg-black/30"
            }`}
          >
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              {m.milestone} jours
            </div>
            <div className="mt-0.5 text-lg font-bold text-amber-200">
              +{m.rewards.gold.toLocaleString()} OS
            </div>
            <div className="mt-2">
              {m.claimed ? (
                <span className="text-[11px] uppercase tracking-widest text-zinc-500">
                  ✅ Ouvert
                </span>
              ) : m.unlocked ? (
                <button
                  type="button"
                  disabled={busy === m.milestone}
                  onClick={() => claim(m.milestone)}
                  className="w-full rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
                >
                  {busy === m.milestone ? "…" : "Ouvrir le coffre"}
                </button>
              ) : (
                <span className="text-[10px] uppercase tracking-widest text-zinc-600">
                  🔒 {m.milestone - data.streak}j restants
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {error ? (
        <div className="mt-2 text-xs text-rose-300">{error}</div>
      ) : null}
      {toast ? (
        <div className="mt-2 text-xs text-emerald-300">{toast}</div>
      ) : null}
    </section>
  );
}
