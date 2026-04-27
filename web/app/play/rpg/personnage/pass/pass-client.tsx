"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_PASS_REWARDS,
  ETERNUM_PASS_TIERS,
  ETERNUM_PASS_XP_PER_TIER,
} from "@shared/eternum-quests";
import { createClient } from "@/lib/supabase/client";

export function PassClient({
  initialPass,
  initialGold,
}: {
  initialPass: { season: string; xp: number; premium: boolean; last_claimed_tier: number } | null;
  initialGold: number;
}) {
  const router = useRouter();
  const [pass, setPass] = useState(
    initialPass ?? { season: "season-1", xp: 0, premium: false, last_claimed_tier: 0 },
  );
  const [gold, setGold] = useState(initialGold);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const currentTier = Math.min(ETERNUM_PASS_TIERS, Math.floor(pass.xp / ETERNUM_PASS_XP_PER_TIER));
  const ratioInTier =
    (pass.xp % ETERNUM_PASS_XP_PER_TIER) / ETERNUM_PASS_XP_PER_TIER;

  async function buyPremium() {
    if (!supabase) return;
    setError(null);
    const { error: rpcErr } = await supabase.rpc("eternum_pass_buy_premium");
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setPass({ ...pass, premium: true });
    setGold(gold - 50000);
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 rounded-xl border border-amber-400/40 bg-black/40 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-bold text-amber-200">
              🎟️ Pass Suprême — {pass.season}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Track gratuit + premium (achetable en OS uniquement, pas
              d&apos;argent réel). 30 paliers, ~1000 XP par palier.
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-amber-200">Tier {currentTier} / {ETERNUM_PASS_TIERS}</span>
              <div className="h-2 w-48 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full bg-amber-400/60"
                  style={{ width: `${ratioInTier * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-400">
                {pass.xp.toLocaleString("fr-FR")} XP
              </span>
            </div>
          </div>
          {!pass.premium ? (
            <button
              onClick={buyPremium}
              disabled={gold < 50000}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-40"
            >
              Acheter Premium (50 000 OS)
            </button>
          ) : (
            <span className="rounded-md bg-amber-400/20 px-3 py-2 text-sm font-bold text-amber-200">
              ✨ Premium activé
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/40">
        <div className="grid grid-cols-1 gap-1 p-3">
          {ETERNUM_PASS_REWARDS.map((rew) => {
            const reached = currentTier >= rew.tier;
            return (
              <div
                key={rew.tier}
                className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${
                  reached
                    ? "border-amber-400/40 bg-amber-400/[0.04]"
                    : "border-white/5 bg-white/[0.02] opacity-70"
                }`}
              >
                <span className="font-semibold">Tier {rew.tier}</span>
                <span className="text-zinc-400">
                  Free : {rew.free?.os ?? 0} OS
                </span>
                <span className={pass.premium ? "text-amber-200" : "text-zinc-500"}>
                  Premium : +{rew.premium?.os ?? 0} OS
                  {rew.premium?.resource ? ` + ${rew.premium.resource.count}× ${rew.premium.resource.id}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
