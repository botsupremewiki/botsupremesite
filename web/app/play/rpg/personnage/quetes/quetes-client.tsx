"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_QUESTS,
  ETERNUM_DAILY_QUESTS,
  ETERNUM_MAIN_QUESTS,
  ETERNUM_WEEKLY_QUESTS,
  type QuestConfig,
} from "@shared/eternum-quests";
import { createClient } from "@/lib/supabase/client";

type Progress = { quest_id: string; progress: number; claimed_at: string | null };

export function QuetesClient({
  initialProgress,
}: {
  initialProgress: Progress[];
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress[]>(initialProgress);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const progMap = useMemo(() => {
    const m = new Map<string, Progress>();
    for (const p of progress) m.set(p.quest_id, p);
    return m;
  }, [progress]);

  async function claim(q: QuestConfig) {
    if (!supabase) return;
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("eternum_quest_claim", {
      p_quest_id: q.id,
      p_required: q.required,
      p_os_reward: q.osReward,
      p_xp_reward: q.xpReward,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as { ok: boolean; error?: string };
    if (!r.ok) {
      setError(r.error ?? "Erreur");
      return;
    }
    setProgress((prev) =>
      prev.map((p) =>
        p.quest_id === q.id ? { ...p, claimed_at: new Date().toISOString() } : p,
      ),
    );
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 text-sm text-zinc-400">
        Quêtes globales : 8 principales + 3 journalières + 3 hebdo. Récompenses
        OS + XP. Progression auto-trackée par le serveur.
      </div>

      {error && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <Section title="🌟 Quêtes principales" quests={ETERNUM_MAIN_QUESTS} progMap={progMap} onClaim={claim} />
        <Section title="📅 Quêtes journalières" quests={ETERNUM_DAILY_QUESTS} progMap={progMap} onClaim={claim} />
        <Section title="📆 Quêtes hebdo" quests={ETERNUM_WEEKLY_QUESTS} progMap={progMap} onClaim={claim} />
      </div>

      <div className="shrink-0 rounded-md border border-white/5 bg-white/[0.03] p-3 text-[10px] text-zinc-500">
        Note : la progression auto se met en place quand le code de jeu
        appelle <code>eternum_quest_progress(quest_id, amount)</code>. Pour
        l&apos;instant, certaines quêtes sont claimables manuellement quand
        leur déclencheur passe via les RPCs concernés.
      </div>
    </div>
  );
}

function Section({
  title,
  quests,
  progMap,
  onClaim,
}: {
  title: string;
  quests: QuestConfig[];
  progMap: Map<string, Progress>;
  onClaim: (q: QuestConfig) => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
        {title}
      </div>
      <div className="flex flex-col gap-2">
        {quests.map((q) => {
          const p = progMap.get(q.id);
          const cur = p?.progress ?? 0;
          const claimed = !!p?.claimed_at;
          const ratio = Math.min(1, cur / q.required);
          const ready = cur >= q.required && !claimed;
          return (
            <div
              key={q.id}
              className="rounded-md border border-white/10 bg-black/40 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">
                    {q.name}
                  </div>
                  <div className="text-[11px] text-zinc-400">{q.description}</div>
                </div>
                <div className="text-[10px] text-amber-300">
                  +{q.osReward} OS · +{q.xpReward} XP
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full ${claimed ? "bg-emerald-400/60" : "bg-amber-400/60"}`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-zinc-400">
                  {cur}/{q.required}
                </span>
                <button
                  onClick={() => onClaim(q)}
                  disabled={!ready}
                  className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                    claimed
                      ? "bg-emerald-400/20 text-emerald-300"
                      : ready
                        ? "bg-amber-500 text-amber-950 hover:bg-amber-400"
                        : "bg-white/10 text-zinc-500 cursor-not-allowed"
                  }`}
                >
                  {claimed ? "Claimed" : "Claim"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
