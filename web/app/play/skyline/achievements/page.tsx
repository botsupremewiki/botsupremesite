import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  checkAchievements,
  ensureSkylineProfile,
  fetchAchievementsForUser,
} from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { AchievementsView } from "./achievements-view";

export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  await checkAchievements();

  const skyProfile = await ensureSkylineProfile();
  const unlocked = await fetchAchievementsForUser(profile.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle="Achievements"
        backHref="/play/skyline"
        backLabel="Skyline"
      />
      <AchievementsView unlocked={unlocked} />
    </div>
  );
}
