import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { BattleLobbyClient } from "../pvp/battle-lobby-client";

export const dynamic = "force-dynamic";

export default async function RankedLobbyPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  return (
    <BattleLobbyClient
      profile={profile}
      gameId={gameId as TcgGameId}
      ranked
    />
  );
}
