import { getProfile } from "@/lib/auth";
import { AreaClient } from "./area-client";
import { PLAZA_SCENE } from "@/lib/game/configs";

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
