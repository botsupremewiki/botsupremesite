"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatNumber } from "@shared/imperium";

type Achievement = {
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
  os_claimed: boolean;
};

type Quest = {
  id: string;
  user_id: string;
  quest_id: string;
  progress: number;
  target: number;
  claimed: boolean;
  expires_at: string;
};

type CatalogEntry = {
  id: string;
  name: string;
  reward: number;
  desc: string;
};

type Props = {
  achievements: Achievement[];
  quests: Quest[];
  catalog: CatalogEntry[];
};

export function QuetesView({ achievements, quests, catalog }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unlockedMap = new Map(achievements.map((a) => [a.achievement_id, a]));

  async function claimAchievement(id: string) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc(
        "imperium_achievement_claim",
        { p_achievement_id: id },
      );
      if (rpcErr) throw rpcErr;
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function claimQuest(questId: string) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc("imperium_quest_claim", {
        p_quest_id: questId,
      });
      if (rpcErr) throw rpcErr;
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <section>
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          Quêtes journalières
        </div>
        {quests.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-500">
            Aucune quête active. Le système distribue 3 quêtes/jour à minuit.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {quests.map((q) => (
              <div
                key={q.id}
                className="flex items-center gap-3 rounded border border-white/5 bg-white/[0.03] px-3 py-2 text-xs"
              >
                <span className="text-zinc-200">{q.quest_id}</span>
                <span className="ml-auto tabular-nums text-zinc-400">
                  {q.progress} / {q.target}
                </span>
                {q.progress >= q.target && !q.claimed && (
                  <button
                    onClick={() => claimQuest(q.quest_id)}
                    disabled={busy}
                    className="rounded bg-amber-500/80 px-2 py-1 text-[10px] font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    Claim 30 OS
                  </button>
                )}
                {q.claimed && (
                  <span className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] text-emerald-300">
                    ✓ Claim
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-widest text-zinc-400">
            Succès ({achievements.length} / {catalog.length})
          </div>
          <div className="text-[10px] text-zinc-500">
            Total possible :{" "}
            {formatNumber(catalog.reduce((a, b) => a + b.reward, 0))} OS
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {catalog.map((a) => {
            const unlocked = unlockedMap.get(a.id);
            return (
              <div
                key={a.id}
                className={`flex items-center gap-3 rounded border px-3 py-2 text-xs ${
                  unlocked
                    ? "border-amber-400/40 bg-amber-400/5"
                    : "border-white/5 bg-white/[0.02] opacity-70"
                }`}
              >
                <span className="text-base">
                  {unlocked ? "🏆" : "🔒"}
                </span>
                <div className="flex-1">
                  <div className="text-zinc-100">{a.name}</div>
                  <div className="text-[10px] text-zinc-500">{a.desc}</div>
                </div>
                <span className="tabular-nums text-amber-300">
                  {formatNumber(a.reward)} OS
                </span>
                {unlocked && !unlocked.os_claimed && a.reward > 0 && (
                  <button
                    onClick={() => claimAchievement(a.id)}
                    disabled={busy}
                    className="rounded bg-amber-500/80 px-2 py-1 text-[10px] font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    Claim
                  </button>
                )}
                {unlocked?.os_claimed && (
                  <span className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] text-emerald-300">
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
