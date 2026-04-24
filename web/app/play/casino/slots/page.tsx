import { getProfile } from "@/lib/auth";
import { SlotsClient } from "./slots-client";

export const dynamic = "force-dynamic";

export default async function SlotsPage() {
  const profile = await getProfile();
  return <SlotsClient profile={profile} />;
}
