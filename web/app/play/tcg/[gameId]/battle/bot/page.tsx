import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { BotLobbyClient } from "./bot-lobby-client";
import { LorBotLauncherClient } from "../../_components/lor-bot-launcher-client";

export const dynamic = "force-dynamic";

export default async function BotLobbyPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  // Phase 3.85 (lol) : on lit le compteur de wins bot du jour pour
  // afficher la progression de la quête (3 wins → 1 booster gratuit).
  let lorQuestState: { bot_wins: number; rewarded: boolean } | null = null;
  if (gameId === "lol" && profile) {
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase
        .from("profiles")
        .select("tcg_quest_state")
        .eq("id", profile.id)
        .single();
      const state = (
        data as { tcg_quest_state?: Record<string, unknown> | null } | null
      )?.tcg_quest_state;
      const lol = (state as Record<string, unknown> | undefined)?.lol as
        | { date?: string; bot_wins?: number; rewarded?: boolean }
        | undefined;
      const today = new Date().toISOString().slice(0, 10);
      if (lol && lol.date === today) {
        lorQuestState = {
          bot_wins: lol.bot_wins ?? 0,
          rewarded: !!lol.rewarded,
        };
      } else {
        lorQuestState = { bot_wins: 0, rewarded: false };
      }
    }
  }
  if (gameId === "lol") {
    return (
      <LorBotLauncherClient profile={profile} questState={lorQuestState} />
    );
  }
  return <BotLobbyClient profile={profile} gameId={gameId as TcgGameId} />;
}
