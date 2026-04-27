"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

type Status = {
  can_claim: boolean;
  current_streak: number;
  next_reward: number;
  next_claim_at: string;
  total_claimed: number;
};

/**
 * Carte « Récompense du jour » : affiche le streak courant, le reward du
 * prochain claim, le compte à rebours si pas claimable. Bouton qui appelle
 * la RPC `claim_daily_reward`.
 *
 * Réutilisé dans /play/objectifs (en haut) et dans le panneau profil.
 */
export function DailyRewardCard({
  onClaimed,
}: {
  /** Callback déclenché après un claim réussi (pour rafraîchir gold). */
  onClaimed?: (reward: number, streak: number) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<Status | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justClaimed, setJustClaimed] = useState<{
    reward: number;
    streak: number;
  } | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error: rpcError } = await supabase.rpc(
      "daily_reward_status",
    );
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) setStatus(row as Status);
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Tick the countdown.
  useEffect(() => {
    if (!status || status.can_claim) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  const claim = useCallback(async () => {
    if (!supabase || claiming) return;
    setClaiming(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc(
      "claim_daily_reward",
    );
    setClaiming(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      const reward = Number(row.reward ?? 0);
      const streak = Number(row.streak ?? 0);
      setJustClaimed({ reward, streak });
      onClaimed?.(reward, streak);
      window.setTimeout(() => setJustClaimed(null), 3500);
    }
    refresh();
  }, [supabase, claiming, onClaimed, refresh]);

  if (!status) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-zinc-400">
        Chargement de la récompense quotidienne…
      </div>
    );
  }

  const remaining = Math.max(
    0,
    new Date(status.next_claim_at).getTime() - now,
  );
  const remainingLabel = formatCountdown(remaining);

  return (
    <div className="relative overflow-hidden rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-4 shadow-lg shadow-amber-500/5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-amber-300">
            🎁 Récompense du jour
            {status.can_claim && (
              <span className="rounded-full bg-rose-500 px-1.5 text-[9px] font-black text-white">
                1
              </span>
            )}
          </div>
          <div className="mt-1 text-lg font-bold text-zinc-100">
            {status.next_reward.toLocaleString("fr-FR")} OS
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-400">
            Streak {status.current_streak}/30 jours · cumul{" "}
            {status.total_claimed.toLocaleString("fr-FR")} OS
          </div>
        </div>

        <button
          onClick={claim}
          disabled={!status.can_claim || claiming}
          className="casino-btn rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-amber-950 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {claiming
            ? "Réclamation…"
            : status.can_claim
              ? "Réclamer"
              : `Dispo dans ${remainingLabel}`}
        </button>
      </div>

      {/* Streak progression : 30 dots, le streak courant en orange. */}
      <div className="mt-3 grid grid-cols-15 gap-0.5 sm:grid-cols-30">
        {Array.from({ length: 30 }, (_, i) => {
          const isReached = i < status.current_streak;
          const isCurrent = i === status.current_streak - 1;
          return (
            <div
              key={i}
              className={`h-1.5 rounded-full ${
                isCurrent
                  ? "bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                  : isReached
                    ? "bg-amber-400/70"
                    : "bg-white/10"
              }`}
              style={{ minWidth: 0 }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] uppercase tracking-widest text-zinc-500">
        <span>J1</span>
        <span>J15</span>
        <span>J30</span>
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Confetti-ish flash quand on vient de claim. */}
      <AnimatePresence>
        {justClaimed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="rounded-full bg-amber-400 px-4 py-2 text-sm font-black text-amber-950 shadow-2xl">
              +{justClaimed.reward.toLocaleString("fr-FR")} OS · streak{" "}
              {justClaimed.streak}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  if (m > 0) return `${m}m${String(sec).padStart(2, "0")}`;
  return `${sec}s`;
}
