import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { BattleClient } from "./battle-client";

export const dynamic = "force-dynamic";

export default async function BattleTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string; roomId: string }>;
  searchParams: Promise<{ deck?: string }>;
}) {
  const { gameId, roomId } = await params;
  const sp = await searchParams;
  if (!(gameId in TCG_GAMES)) notFound();
  if (!sp.deck) notFound();
  const profile = await getProfile();
  return (
    <BattleClient
      profile={profile}
      gameId={gameId as TcgGameId}
      roomId={roomId}
      deckId={sp.deck}
    />
  );
}
