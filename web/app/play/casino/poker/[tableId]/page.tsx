import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { POKER_TABLES, type PokerTableId } from "@shared/types";
import { PokerClient } from "./poker-client";

export const dynamic = "force-dynamic";

export default async function PokerTablePage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = await params;
  if (!(tableId in POKER_TABLES)) notFound();
  const profile = await getProfile();
  return (
    <PokerClient profile={profile} tableId={tableId as PokerTableId} />
  );
}
