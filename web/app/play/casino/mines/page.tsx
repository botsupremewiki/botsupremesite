import { getProfile } from "@/lib/auth";
import { MinesClient } from "./mines-client";

export default async function MinesPage() {
  const profile = await getProfile();
  return <MinesClient profile={profile} />;
}
