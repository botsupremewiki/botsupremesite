import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ensureSkylineProfile } from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { ApprentissageView } from "./apprentissage-view";

export const dynamic = "force-dynamic";

export default async function ApprentissagePage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  const skyProfile = await ensureSkylineProfile();

  // Auto-finalise une formation si terminée.
  // eslint-disable-next-line react-hooks/purity -- server component, called once per request
  const nowTs = Date.now();
  if (
    skyProfile?.current_skill_training &&
    skyProfile.skill_training_ends_at &&
    new Date(skyProfile.skill_training_ends_at).getTime() < nowTs
  ) {
    const supabase = await createClient();
    if (supabase) {
      await supabase.rpc("skyline_finish_player_training");
    }
  }

  // Re-fetch après finish.
  const profileAfter = await ensureSkylineProfile();

  const playerSkills =
    (profileAfter?.player_skills as Record<string, number> | null) ?? {};
  const currentTraining = profileAfter?.current_skill_training ?? null;
  const trainingEndsAt = profileAfter?.skill_training_ends_at ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(profileAfter?.cash ?? 0)}
        subtitle="Apprentissage"
        backHref="/play/skyline"
        backLabel="Skyline"
      />
      <ApprentissageView
        playerSkills={playerSkills}
        currentTraining={currentTraining}
        trainingEndsAt={trainingEndsAt}
        cash={Number(profileAfter?.cash ?? 0)}
      />
    </div>
  );
}
