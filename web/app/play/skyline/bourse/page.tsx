import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  ensureSkylineProfile,
  fetchListedCompanies,
  fetchShareHoldingsForUser,
  tickShareCourses,
} from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { BourseView } from "./bourse-view";

export const dynamic = "force-dynamic";

export default async function BoursePage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  await tickShareCourses();

  const skyProfile = await ensureSkylineProfile();
  const [listed, holdings] = await Promise.all([
    fetchListedCompanies(),
    fetchShareHoldingsForUser(profile.id),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle="Bourse"
        backHref="/play/skyline"
        backLabel="Skyline"
      />
      <BourseView
        listed={listed}
        holdings={holdings}
        cash={Number(skyProfile?.cash ?? 0)}
        userId={profile.id}
      />
    </div>
  );
}
