import { getProfile } from "@/lib/auth";
import { SlotsClient } from "./slots-client";

export default async function SlotsPage() {
  const profile = await getProfile();
  return <SlotsClient profile={profile} />;
}
