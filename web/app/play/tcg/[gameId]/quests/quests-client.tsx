"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

type QuestRow = {
  quest_id: string;
  label: string;
  progress: number;
  target: number;
  gold: number;
  packs: number;
  claimed: boolean;
};

export function QuestsClient({
  gameId,
  quests,
}: {
  gameId: string;
  quests: QuestRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function claim(questId: string) {
    setError(null);
    setToast(null);
    setBusyId(questId);
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase indisponible");
      setBusyId(null);
      return;
    }
    const { data, error: rpcErr } = await supabase.rpc("claim_daily_quest", {
      p_game_id: gameId,
      p_quest_id: questId,
    });
    setBusyId(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as { gold: number; packs: number };
    setToast(
      `Réclamé : +${r.gold} OS${r.packs > 0 ? ` + ${r.packs} booster` : ""}`,
    );
    startTransition(() => router.refresh());
  }

  const completed = quests.filter((q) => q.progress >= q.target && !q.claimed);
  const totalDone = quests.filter((q) => q.claimed).length;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-amber-300/40 bg-amber-300/5 p-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-amber-200/70">
            Aujourd&apos;hui
          </div>
          <div className="text-lg font-bold text-amber-100">
            {totalDone} / {quests.length} réclamées
          </div>
        </div>
        {completed.length > 0 ? (
          <div className="text-xs text-amber-200">
            ✨ {completed.length} récompense{completed.length > 1 ? "s" : ""}{" "}
            dispo !
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {quests.map((q) => (
          <QuestCard
            key={q.quest_id}
            quest={q}
            busy={busyId === q.quest_id}
            onClaim={() => claim(q.quest_id)}
          />
        ))}
      </div>
      {error ? <div className="text-xs text-rose-300">{error}</div> : null}
      {toast ? <div className="text-xs text-emerald-300">{toast}</div> : null}
    </div>
  );
}

function QuestCard({
  quest,
  busy,
  onClaim,
}: {
  quest: QuestRow;
  busy: boolean;
  onClaim: () => void;
}) {
  const ratio = Math.min(1, quest.progress / quest.target);
  const done = quest.progress >= quest.target;
  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        quest.claimed
          ? "border-zinc-400/20 bg-zinc-400/5 opacity-60"
          : done
            ? "border-emerald-400/40 bg-emerald-400/5"
            : "border-white/10 bg-black/40"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={`text-sm font-bold ${
              quest.claimed
                ? "text-zinc-400 line-through"
                : "text-zinc-100"
            }`}
          >
            {quest.label}
          </div>
          <div className="mt-1 text-xs tabular-nums text-zinc-400">
            {quest.progress} / {quest.target}
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full transition-all ${
                done ? "bg-emerald-400" : "bg-amber-400"
              }`}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="text-right text-xs text-zinc-300">
            <div className="font-bold tabular-nums text-amber-200">
              +{quest.gold} OS
            </div>
            {quest.packs > 0 ? (
              <div className="text-[10px] text-emerald-300">
                +{quest.packs} 🎴
              </div>
            ) : null}
          </div>
          {quest.claimed ? (
            <span className="rounded border border-zinc-400/30 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-400">
              Réclamée
            </span>
          ) : done ? (
            <button
              type="button"
              disabled={busy}
              onClick={onClaim}
              className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
            >
              {busy ? "…" : "Réclamer"}
            </button>
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              À faire
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
