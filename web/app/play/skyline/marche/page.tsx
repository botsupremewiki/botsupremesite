import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  ensureMarketSeeded,
  ensureSkylineProfile,
  fetchMarketCourses,
  fetchSkylineNews,
} from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { MarketView } from "./market-view";

export const dynamic = "force-dynamic";

export default async function MarchePage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  await ensureMarketSeeded();

  const skyProfile = await ensureSkylineProfile();
  const [courses, news] = await Promise.all([
    fetchMarketCourses(),
    fetchSkylineNews(20),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle="Marché commun"
        backHref="/play/skyline"
        backLabel="Skyline"
      />
      <MarketView courses={courses} news={news} />
    </div>
  );
}
