"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type CurrentSeason = {
  id: string;
  season_number: number;
  start_at: string;
  end_at: string | null;
};

type LeaderboardRow = {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  elo: number;
  tier: string;
  ranked_wins: number;
  ranked_losses: number;
};

type SeasonHistoryRow = {
  season_id: string;
  season_number: number;
  start_at: string;
  end_at: string | null;
  final_elo: number;
  final_rank: number | null;
  tier: string;
  ranked_wins: number;
  ranked_losses: number;
  gold_reward: number;
  pack_reward: number;
  rewards_claimed: boolean;
};

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  master: { label: "Maître", color: "text-rose-300 border-rose-400/40 bg-rose-400/10" },
  diamond: { label: "Diamant", color: "text-cyan-200 border-cyan-300/40 bg-cyan-300/10" },
  platinum: { label: "Platine", color: "text-emerald-200 border-emerald-300/40 bg-emerald-300/10" },
  gold: { label: "Or", color: "text-amber-200 border-amber-300/40 bg-amber-300/10" },
  silver: { label: "Argent", color: "text-zinc-200 border-zinc-300/40 bg-zinc-300/10" },
  bronze: { label: "Bronze", color: "text-amber-700 border-amber-700/40 bg-amber-700/10" },
};

function tierBadge(tier: string) {
  const t = TIER_LABELS[tier] ?? TIER_LABELS.bronze;
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${t.color}`}
    >
      {t.label}
    </span>
  );
}

// Saison "logique" = ~30 jours après start_at. Affiche un compte à rebours.
function useCountdown(start_at: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!start_at) return null;
  const end = new Date(start_at).getTime() + 30 * 86400_000;
  const ms = Math.max(0, end - now);
  const days = Math.floor(ms / 86400_000);
  const hours = Math.floor((ms % 86400_000) / 3600_000);
  return { days, hours, ms };
}

export function SeasonsClient({
  gameId,
  currentSeason,
  leaderboard,
  history,
  isLoggedIn,
  myUserId,
}: {
  gameId: string;
  currentSeason: CurrentSeason | null;
  leaderboard: LeaderboardRow[];
  history: SeasonHistoryRow[];
  isLoggedIn: boolean;
  myUserId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const cd = useCountdown(currentSeason?.start_at ?? null);
  const myRow = useMemo(
    () => (myUserId ? leaderboard.find((r) => r.user_id === myUserId) : null),
    [leaderboard, myUserId],
  );

  async function claim(seasonId: string) {
    setError(null);
    setToast(null);
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase indisponible");
      return;
    }
    const { data, error: rpcErr } = await supabase.rpc("claim_season_rewards", {
      p_season_id: seasonId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as { gold: number; packs: number };
    setToast(
      `Réclamé : +${r.gold} OS${r.packs > 0 ? ` + ${r.packs} booster${r.packs > 1 ? "s" : ""}` : ""}`,
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">📅 Saisons ranked</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Chaque saison dure ~1 mois. À la clôture, ton ELO est snapshotté
          et tu reçois des récompenses selon ton tier final. Les ELO sont
          ensuite soft-reset (rapprochés de 1000) pour repartir à neuf.
        </p>
      </div>

      {/* ── Saison courante ───────────────────────────────────────── */}
      {currentSeason ? (
        <div className="rounded-xl border border-amber-300/40 bg-amber-300/5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-amber-200/70">
                Saison en cours
              </div>
              <div className="text-2xl font-bold text-amber-100">
                Saison #{currentSeason.season_number}
              </div>
              <div className="mt-0.5 text-xs text-zinc-400">
                Démarrée le{" "}
                {new Date(currentSeason.start_at).toLocaleDateString("fr-FR")}
              </div>
            </div>
            {cd ? (
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-widest text-zinc-500">
                  Clôture estimée
                </div>
                <div className="text-2xl font-bold tabular-nums text-amber-200">
                  {cd.days > 0 ? `${cd.days}j ${cd.hours}h` : `${cd.hours}h`}
                </div>
              </div>
            ) : null}
          </div>
          {myRow ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-sm text-zinc-300">Ton positionnement :</div>
              <div className="text-lg font-bold tabular-nums text-amber-200">
                #{myRow.rank}
              </div>
              <div className="text-sm text-zinc-300">
                {myRow.elo} ELO {tierBadge(myRow.tier)}
              </div>
              <div className="text-xs text-zinc-500">
                ({myRow.ranked_wins}W / {myRow.ranked_losses}L)
              </div>
            </div>
          ) : isLoggedIn ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-zinc-400">
              Tu n&apos;as pas encore joué de match classé cette saison.{" "}
              <Link
                href={`/play/tcg/${gameId}/battle/ranked`}
                className="text-amber-200 underline-offset-2 hover:underline"
              >
                Joue ton premier classé →
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-rose-400/40 bg-rose-400/5 p-3 text-sm text-rose-200">
          Aucune saison disponible. Lance la migration{" "}
          <code className="text-zinc-300">supabase/tcg-seasons.sql</code>.
        </div>
      )}

      {/* ── Récompenses par tier ──────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-5">
        <h2 className="text-lg font-bold text-zinc-100">🎁 Récompenses</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Distribué selon ton ELO au moment de la clôture.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <RewardTile elo="1600+" tier="master" gold={5000} packs={10} />
          <RewardTile elo="1400+" tier="diamond" gold={2000} packs={3} />
          <RewardTile elo="1200+" tier="platinum" gold={1000} packs={1} />
          <RewardTile elo="1000+" tier="gold" gold={500} packs={0} />
          <RewardTile elo="800+" tier="silver" gold={200} packs={0} />
          <RewardTile elo="< 800" tier="bronze" gold={100} packs={0} />
        </div>
      </div>

      {/* ── Mes saisons passées ───────────────────────────────────── */}
      {history.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-5">
          <h2 className="text-lg font-bold text-zinc-100">
            🗂️ Mes saisons passées
          </h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-[11px] uppercase tracking-widest text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Saison</th>
                  <th className="px-3 py-2 text-right">ELO final</th>
                  <th className="px-3 py-2 text-right">Rank</th>
                  <th className="px-3 py-2 text-center">Tier</th>
                  <th className="px-3 py-2 text-right">Récompense</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((row) => (
                  <tr key={row.season_id} className="bg-black/40">
                    <td className="px-3 py-2 font-semibold text-zinc-100">
                      #{row.season_number}
                      <div className="text-[10px] text-zinc-500">
                        {new Date(row.start_at).toLocaleDateString("fr-FR")}
                        {row.end_at
                          ? " → " +
                            new Date(row.end_at).toLocaleDateString("fr-FR")
                          : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.final_elo}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-200">
                      #{row.final_rank ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {tierBadge(row.tier)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">
                      {row.gold_reward} OS
                      {row.pack_reward > 0
                        ? ` + ${row.pack_reward}🎴`
                        : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.rewards_claimed ? (
                        <span className="text-[11px] uppercase tracking-widest text-zinc-500">
                          ✅ Réclamé
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => claim(row.season_id)}
                          className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
                        >
                          Réclamer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error ? (
            <div className="mt-2 text-xs text-rose-300">{error}</div>
          ) : null}
          {toast ? (
            <div className="mt-2 text-xs text-emerald-300">{toast}</div>
          ) : null}
        </div>
      ) : null}

      {/* ── Classement live ───────────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-5">
        <h2 className="text-lg font-bold text-zinc-100">
          🏆 Classement de la saison
          <span className="ml-2 text-sm font-normal text-zinc-500">
            top {leaderboard.length}
          </span>
        </h2>
        {leaderboard.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
            Aucun joueur classé pour le moment. Sois le premier !
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-[11px] uppercase tracking-widest text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Joueur</th>
                  <th className="px-3 py-2 text-right">ELO</th>
                  <th className="px-3 py-2 text-center">Tier</th>
                  <th className="px-3 py-2 text-right">W / L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leaderboard.map((row) => {
                  const isMe = row.user_id === myUserId;
                  return (
                    <tr
                      key={row.user_id}
                      className={
                        isMe
                          ? "bg-amber-400/10"
                          : row.rank <= 3
                            ? "bg-amber-200/[0.04]"
                            : "bg-black/40"
                      }
                    >
                      <td className="px-3 py-2 font-bold tabular-nums text-amber-200">
                        {row.rank === 1
                          ? "🥇"
                          : row.rank === 2
                            ? "🥈"
                            : row.rank === 3
                              ? "🥉"
                              : `#${row.rank}`}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/u/${encodeURIComponent(row.username)}`}
                          className="font-semibold text-zinc-100 hover:underline"
                        >
                          {row.username}
                        </Link>
                        {isMe ? (
                          <span className="ml-1 text-[10px] uppercase tracking-widest text-amber-300">
                            (toi)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                        {row.elo}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {tierBadge(row.tier)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                        {row.ranked_wins}W / {row.ranked_losses}L
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RewardTile({
  elo,
  tier,
  gold,
  packs,
}: {
  elo: string;
  tier: string;
  gold: number;
  packs: number;
}) {
  const t = TIER_LABELS[tier] ?? TIER_LABELS.bronze;
  return (
    <div className={`rounded-lg border p-3 ${t.color}`}>
      <div className="text-[10px] uppercase tracking-widest opacity-80">
        ELO {elo}
      </div>
      <div className="mt-0.5 text-sm font-bold">{t.label}</div>
      <div className="mt-1 text-xs text-zinc-300">
        {gold} OS
        {packs > 0 ? (
          <>
            <br />+ {packs} booster{packs > 1 ? "s" : ""}
          </>
        ) : null}
      </div>
    </div>
  );
}
