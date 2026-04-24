import { getProfile } from "@/lib/auth";
import { PlazaClient } from "./plaza-client";

export default async function PlayPage() {
  const profile = await getProfile();
  return <PlazaClient profile={profile} />;
}
