import { getProfile } from "@/lib/auth";
import { HiLoClient } from "./hilo-client";

export const dynamic = "force-dynamic";

export default async function HiLoPage() {
  const profile = await getProfile();
  return <HiLoClient profile={profile} />;
}
