import { getProfile } from "@/lib/auth";
import { RouletteClient } from "./roulette-client";

export const dynamic = "force-dynamic";

export default async function RouletteTablePage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const profile = await getProfile();
  const { tableId } = await params;
  return <RouletteClient profile={profile} tableId={tableId} />;
}
