import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { BattleLobbyClient } from "../pvp/battle-lobby-client";
import {
  LorLobbyClient,
  type LorRecentBattle,
} from "../../_components/lor-lobby-client";
import { SeasonBanner } from "../../_components/season-banner";

export const dynamic = "force-dynamic";

export default async function RankedLobbyPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();

  // Récupère la saison courante + l'ELO du joueur pour le banner.
  let season: {
    id: string;
    season_number: number;
    start_at: string;
  } | null = null;
  let myElo: number | null = null;
  // Phase 3.87 (lol) : 5 derniers combats pour le lobby.
  let recent: LorRecentBattle[] = [];
  const supabase = await createClient();
  if (supabase) {
    const seasonRes = await supabase.rpc("get_current_season", {
      p_game_id: gameId,
    });
    season = (seasonRes.data as typeof season) ?? null;
    if (profile) {
      const stats = await supabase.rpc("get_tcg_player_stats", {
        p_user_id: profile.id,
        p_game_id: gameId,
      });
      const data = stats.data as { elo?: number } | null;
      myElo = data?.elo ?? null;
      if (gameId === "lol") {
        const histRes = await supabase
          .from("battle_history")
          .select(
            "winner_id,loser_id,winner_username,loser_username,ranked,winner_elo_before,winner_elo_after,loser_elo_before,loser_elo_after,ended_at",
          )
          .eq("game_id", "lol")
          .or(`winner_id.eq.${profile.id},loser_id.eq.${profile.id}`)
          .order("ended_at", { ascending: false })
          .limit(5);
        recent = ((histRes.data ?? []) as LorRecentBattle[]) ?? [];
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {season ? (
        <div className="border-b border-white/5 px-4 pt-3">
          <SeasonBanner gameId={gameId} season={season} myElo={myElo} />
        </div>
      ) : null}
      {gameId === "lol" ? (
        <LorLobbyClient
          profile={profile}
          ranked
          myElo={myElo}
          recent={recent}
        />
      ) : (
        <BattleLobbyClient
          profile={profile}
          gameId={gameId as TcgGameId}
          ranked
        />
      )}
    </div>
  );
}
