import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  ensureEmployeeMarket,
  ensureSkylineProfile,
  fetchEmployeeMarket,
  fetchSkylineCompanies,
} from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { EmploiView } from "./emploi-view";

export const dynamic = "force-dynamic";

export default async function EmploiPage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  await ensureEmployeeMarket();

  const skyProfile = await ensureSkylineProfile();
  const [candidates, companies] = await Promise.all([
    fetchEmployeeMarket(60),
    fetchSkylineCompanies(profile.id),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle="Marché de l'emploi"
        backHref="/play/skyline"
        backLabel="Skyline"
      />
      <EmploiView candidates={candidates} companies={companies} />
    </div>
  );
}
