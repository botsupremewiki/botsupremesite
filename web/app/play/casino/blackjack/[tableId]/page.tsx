import { getProfile } from "@/lib/auth";
import { BlackjackClient } from "./blackjack-client";

export const dynamic = "force-dynamic";

export default async function BlackjackTablePage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const profile = await getProfile();
  const { tableId } = await params;
  return <BlackjackClient profile={profile} tableId={tableId} />;
}
