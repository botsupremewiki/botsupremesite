import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { BattleLobbyClient } from "./battle-lobby-client";
import {
  LorLobbyClient,
  type LorRecentBattle,
} from "../../_components/lor-lobby-client";

export const dynamic = "force-dynamic";

export default async function PvpLobbyPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();

  // Phase 3.87 (lol) : prefetch ELO + 5 derniers combats pour afficher
  // dans le lobby (W/L visuel + diff ELO si ranked).
  let myElo: number | null = null;
  let recent: LorRecentBattle[] = [];
  if (gameId === "lol" && profile) {
    const supabase = await createClient();
    if (supabase) {
      const stats = await supabase.rpc("get_tcg_player_stats", {
        p_user_id: profile.id,
        p_game_id: "lol",
      });
      myElo = (stats.data as { elo?: number } | null)?.elo ?? null;
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

  if (gameId === "lol") {
    return <LorLobbyClient profile={profile} myElo={myElo} recent={recent} />;
  }
  return (
    <BattleLobbyClient profile={profile} gameId={gameId as TcgGameId} />
  );
}
