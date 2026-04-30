import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { CombatNav } from "../_components/combat-nav";
import { SeasonsClient } from "./seasons-client";

export const dynamic = "force-dynamic";

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

export default async function SeasonsPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();

  let currentSeason: CurrentSeason | null = null;
  let leaderboard: LeaderboardRow[] = [];
  let history: SeasonHistoryRow[] = [];

  const supabase = await createClient();
  if (supabase) {
    const [seasonRes, lbRes] = await Promise.all([
      supabase.rpc("get_current_season", { p_game_id: gameId }),
      supabase.rpc("get_season_leaderboard", {
        p_game_id: gameId,
        p_season_id: null,
        p_limit: 100,
      }),
    ]);
    currentSeason = (seasonRes.data as CurrentSeason) ?? null;
    leaderboard = (lbRes.data as LeaderboardRow[]) ?? [];
    if (profile) {
      const histRes = await supabase.rpc("get_my_season_history", {
        p_game_id: gameId,
      });
      history = (histRes.data as SeasonHistoryRow[]) ?? [];
    }
  }

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
          <span className="text-xs text-zinc-500">📅 Saisons</span>
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
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-4">
            <CombatNav gameId={gameId} current="seasons" />
          </div>

          <SeasonsClient
            gameId={gameId}
            currentSeason={currentSeason}
            leaderboard={leaderboard}
            history={history}
            isLoggedIn={Boolean(profile)}
            myUserId={profile?.id ?? null}
          />
        </div>
      </main>
    </div>
  );
}
