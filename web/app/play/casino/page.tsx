import { getProfile } from "@/lib/auth";
import { AreaClient } from "../area-client";
import { CASINO_SCENE } from "@/lib/game/configs";

export default async function CasinoPage() {
  const profile = await getProfile();
  return (
    <AreaClient
      profile={profile}
      sceneConfig={CASINO_SCENE}
      roomName="casino"
      areaLabel="Casino"
      backHref="/play"
    />
  );
}
