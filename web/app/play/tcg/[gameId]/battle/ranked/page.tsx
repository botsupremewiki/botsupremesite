import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { BattleLobbyClient } from "../pvp/battle-lobby-client";
import { LorLobbyClient } from "../../_components/lor-lobby-client";
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
        <LorLobbyClient profile={profile} ranked />
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
