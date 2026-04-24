import { getProfile } from "@/lib/auth";
import { AreaClient } from "./area-client";
import { PLAZA_SCENE } from "@/lib/game/configs";

// The whole /play tree is gated by per-user gold which lives in Supabase.
// Static / cached responses would let us serve another visitor's snapshot,
// or our own pre-game snapshot after they've already won/lost.
export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const profile = await getProfile();
  return (
    <AreaClient
      profile={profile}
      sceneConfig={PLAZA_SCENE}
      roomName="plaza"
      areaLabel="Plaza"
      backHref="/"
    />
  );
}
