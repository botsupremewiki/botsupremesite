import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
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
  if (gameId === "lol") {
    return <LorBotLauncherClient profile={profile} />;
  }
  return <BotLobbyClient profile={profile} gameId={gameId as TcgGameId} />;
}
