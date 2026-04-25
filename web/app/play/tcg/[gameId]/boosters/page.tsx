import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { BoostersClient } from "./boosters-client";

export const dynamic = "force-dynamic";

export default async function BoostersPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  return <BoostersClient profile={profile} gameId={gameId as TcgGameId} />;
}
