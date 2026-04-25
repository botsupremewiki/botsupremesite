import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { DecksClient } from "./decks-client";

export const dynamic = "force-dynamic";

export default async function DecksPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  return <DecksClient profile={profile} gameId={gameId as TcgGameId} />;
}
