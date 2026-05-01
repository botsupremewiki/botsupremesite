import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import {
  TCG_ACHIEVEMENTS,
  tierAccent,
  type Achievement,
} from "@shared/tcg-achievements";
import { UserPill } from "@/components/user-pill";
import { CombatNav } from "../../_components/combat-nav";
import { PinnableAchievementsGrid } from "./pinnable-achievements";
import { Sparkline, DonutChart } from "@/components/charts";

export const dynamic = "force-dynamic";

type Stats = {
  elo: number;
  total: number;
  wins: number;
  losses: number;
  ranked_total: number;
  ranked_wins: number;
};

type DeckWinrate = {
  deck_name: string;
  wins: number;
  losses: number;
  total: number;
};

type UnlockedAchievement = {
  achievement_id: string;
  unlocked_at: string;
};

export default async function StatsPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  const game = TCG_GAMES[gameId as TcgGameId];

  let stats: Stats | null = null;
  let deckWinrates: DeckWinrate[] = [];
  let unlockedAchievements: UnlockedAchievement[] = [];
  let pinnedAchievements: string[] = [];
  let eloHistory: { ended_at: string; elo: number }[] = [];
  let aggregates: {
    totalMatches: number;
    wins: number;
    losses: number;
    rankedWins: number;
    elo: number;
    winningDecks: string[];
    bestWinStreak: number;
  } | null = null;
  if (profile) {
    const supabase = await createClient();
    if (supabase) {
      const [statsRes, decksRes, achRes, profRes, aggRes, eloRes] =
        await Promise.all([
          supabase.rpc("get_tcg_player_stats", {
            p_user_id: profile.id,
            p_game_id: gameId,
          }),
          supabase.rpc("get_user_deck_winrates", {
            p_user_id: profile.id,
            p_game_id: gameId,
          }),
          supabase.rpc("get_user_achievements", {
            p_user_id: profile.id,
            p_game_id: gameId,
          }),
          supabase
            .from("profiles")
            .select("pinned_achievements")
            .eq("id", profile.id)
            .maybeSingle(),
          supabase.rpc("get_user_battle_aggregates", {
            p_user_id: profile.id,
            p_game_id: gameId,
          }),
          supabase.rpc("get_my_elo_history", {
            p_game_id: gameId,
            p_limit: 50,
          }),
        ]);
      stats = (statsRes.data as Stats) ?? null;
      deckWinrates = (decksRes.data as DeckWinrate[]) ?? [];
      unlockedAchievements = (achRes.data as UnlockedAchievement[]) ?? [];
      eloHistory =
        (eloRes.data as { ended_at: string; elo: number }[]) ?? [];
      const prof = profRes.data as
        | { pinned_achievements: string[] | null }
        | null;
      pinnedAchievements = prof?.pinned_achievements ?? [];
      const agg = aggRes.data as {
        total_matches: number;
        wins: number;
        losses: number;
        ranked_wins: number;
        elo: number;
        winning_decks: string[];
        best_win_streak: number;
      } | null;
      aggregates = agg
        ? {
            totalMatches: agg.total_matches,
            wins: agg.wins,
            losses: agg.losses,
            rankedWins: agg.ranked_wins,
            elo: agg.elo,
            winningDecks: agg.winning_decks ?? [],
            bestWinStreak: agg.best_win_streak,
          }
        : null;
    }
  }

  const winrate =
    stats && stats.total > 0
      ? Math.round((stats.wins / stats.total) * 100)
      : null;
  const rankedWinrate =
    stats && stats.ranked_total > 0
      ? Math.round((stats.ranked_wins / stats.ranked_total) * 100)
      : null;
  const unlockedSet = new Set(unlockedAchievements.map((a) => a.achievement_id));
  const unlockedDates = new Map(
    unlockedAchievements.map((a) => [a.achievement_id, a.unlocked_at]),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/${gameId}`}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← {game.name}
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">📊 Stats / ELO</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main
        className={`flex flex-1 flex-col overflow-y-auto p-6 ${game.gradient}`}
      >
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-4">
            <CombatNav gameId={gameId} current="stats" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">
            📊 Stats / ELO
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Tes statistiques de combat sur {game.name}.
          </p>

          {!profile ? (
            <div className="mt-6 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour voir tes stats.
            </div>
          ) : !stats ? (
            <div className="mt-6 rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
              Stats indisponibles. Lance la migration{" "}
              <code className="text-zinc-300">supabase/tcg-battles.sql</code>{" "}
              dans le SQL Editor.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
              <StatBlock
                label="ELO actuel"
                value={String(stats.elo)}
                accent="text-amber-300"
                big
              />
              <StatBlock
                label="Matchs totaux"
                value={String(stats.total)}
                accent="text-zinc-100"
              />
              <StatBlock
                label="Winrate global"
                value={winrate !== null ? `${winrate}%` : "—"}
                accent={
                  winrate !== null && winrate >= 50
                    ? "text-emerald-300"
                    : "text-rose-300"
                }
              />
              <StatBlock
                label="Victoires"
                value={String(stats.wins)}
                accent="text-emerald-300"
              />
              <StatBlock
                label="Défaites"
                value={String(stats.losses)}
                accent="text-rose-300"
              />
              <StatBlock
                label="Matchs classés"
                value={`${stats.ranked_wins} / ${stats.ranked_total}${
                  rankedWinrate !== null ? ` (${rankedWinrate}%)` : ""
                }`}
                accent="text-violet-300"
              />
            </div>
          )}

          {/* ─── Charts : ELO timeline + Winrate donut ─── */}
          {profile && stats ? (
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <h2 className="text-sm font-bold text-zinc-100">
                  📈 Évolution ELO classé
                </h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  50 derniers matchs classés. Ligne ambre = ton ELO après
                  chaque match.
                </p>
                <div className="mt-3">
                  <Sparkline
                    data={eloHistory.map((h, i) => ({ x: i, y: h.elo }))}
                    height={80}
                    showDots={eloHistory.length <= 20}
                    ariaLabel={`Courbe ELO sur les ${eloHistory.length} derniers matchs`}
                  />
                </div>
                {eloHistory.length >= 2 ? (
                  <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
                    <span>{eloHistory[0].elo}</span>
                    <span>
                      {eloHistory[eloHistory.length - 1].elo}{" "}
                      <span className="text-zinc-600">(actuel)</span>
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-black/40 p-4">
                <h2 className="self-start text-sm font-bold text-zinc-100">
                  🎯 Répartition matchs
                </h2>
                <DonutChart
                  segments={[
                    {
                      label: "Victoires",
                      value: stats.wins,
                      color: "rgb(52 211 153)",
                    },
                    {
                      label: "Défaites",
                      value: stats.losses,
                      color: "rgb(244 63 94)",
                    },
                  ]}
                  size={140}
                  centerLabel={
                    winrate !== null ? `${winrate}%` : "—"
                  }
                  centerSubLabel="Winrate"
                  ariaLabel={`Répartition victoires/défaites : ${stats.wins} W, ${stats.losses} L`}
                />
                <div className="mt-2 flex gap-3 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: "rgb(52 211 153)" }}
                    />
                    {stats.wins} W
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: "rgb(244 63 94)" }}
                    />
                    {stats.losses} L
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {/* ─── Stats par deck ─── */}
          {profile && deckWinrates.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-zinc-100">
                🃏 Stats par deck
              </h2>
              <p className="text-xs text-zinc-500">
                Tes wins / losses pour chaque deck que tu as joué.
              </p>
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-[11px] uppercase tracking-widest text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Deck</th>
                      <th className="px-3 py-2 text-right">Wins</th>
                      <th className="px-3 py-2 text-right">Losses</th>
                      <th className="px-3 py-2 text-right">Winrate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {deckWinrates.map((d) => {
                      const wr =
                        d.total > 0
                          ? Math.round((Number(d.wins) / Number(d.total)) * 100)
                          : 0;
                      return (
                        <tr
                          key={d.deck_name}
                          className="bg-black/40 hover:bg-white/[0.03]"
                        >
                          <td className="px-3 py-2 font-semibold text-zinc-100">
                            {d.deck_name}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-300">
                            {String(d.wins)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-rose-300">
                            {String(d.losses)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-bold tabular-nums ${
                              wr >= 50
                                ? "text-emerald-300"
                                : "text-rose-300"
                            }`}
                          >
                            {wr}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Achievements ─── */}
          {profile && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-zinc-100">
                🏅 Achievements
                <span className="ml-2 text-sm font-normal text-zinc-500">
                  {unlockedSet.size} /{" "}
                  {
                    TCG_ACHIEVEMENTS.filter(
                      (a) => !a.gameId || a.gameId === gameId,
                    ).length
                  }
                </span>
              </h2>
              <PinnableAchievementsGrid
                unlockedIds={Array.from(unlockedSet)}
                unlockedDates={Object.fromEntries(unlockedDates)}
                initialPins={pinnedAchievements}
                aggregates={aggregates}
                gameId={gameId}
              />
            </div>
          )}

          <div className="mt-8 rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-400">
            <p className="font-semibold text-zinc-300">Système ELO</p>
            <p className="mt-1">
              Chaque joueur démarre à 1000. Les matchs PvP fun et vs Bot
              n&apos;affectent pas l&apos;ELO. Seuls les matchs{" "}
              <strong>Classés</strong> font monter ou descendre ton ELO selon
              une formule standard (K=32). Battre un joueur plus fort rapporte
              davantage.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatBlock({
  label,
  value,
  accent,
  big,
}: {
  label: string;
  value: string;
  accent: string;
  big?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-widest text-zinc-400">
        {label}
      </div>
      <div
        className={`mt-1 ${
          big ? "text-3xl" : "text-xl"
        } font-semibold tabular-nums ${accent}`}
      >
        {value}
      </div>
    </div>
  );
}
