import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { BattleLobbyClient } from "./battle-lobby-client";
import { LorLobbyClient } from "../../_components/lor-lobby-client";

export const dynamic = "force-dynamic";

export default async function PvpLobbyPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  if (gameId === "lol") {
    return <LorLobbyClient profile={profile} />;
  }
  return (
    <BattleLobbyClient profile={profile} gameId={gameId as TcgGameId} />
  );
}
