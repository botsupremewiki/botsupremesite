import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  ensureSkylineProfile,
  fetchSkylineOffshoreLog,
} from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { OffshoreView } from "./offshore-view";

export const dynamic = "force-dynamic";

export default async function OffshorePage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  const skyProfile = await ensureSkylineProfile();
  const offshoreLog = await fetchSkylineOffshoreLog(profile.id, 20);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle="Pont $ ↔ OS"
        backHref="/play/skyline"
        backLabel="Skyline"
      />

      <OffshoreView
        cash={Number(skyProfile?.cash ?? 0)}
        os={profile.gold}
        osToDollarsToday={skyProfile?.os_to_dollars_today ?? 0}
        shellDollarsThisWeek={Number(skyProfile?.shell_dollars_this_week ?? 0)}
        log={offshoreLog}
      />
    </div>
  );
}
