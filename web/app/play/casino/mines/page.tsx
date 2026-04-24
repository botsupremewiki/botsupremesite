import { getProfile } from "@/lib/auth";
import { MinesClient } from "./mines-client";

export const dynamic = "force-dynamic";

export default async function MinesPage() {
  const profile = await getProfile();
  return <MinesClient profile={profile} />;
}
