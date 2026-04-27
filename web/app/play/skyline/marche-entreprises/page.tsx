import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  ensureSkylineProfile,
  fetchCompaniesForSale,
} from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { MarcheEntreprisesView } from "./marche-entreprises-view";

export const dynamic = "force-dynamic";

export default async function MarcheEntreprisesPage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  const skyProfile = await ensureSkylineProfile();
  const listings = await fetchCompaniesForSale();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle="Marché d'entreprises"
        backHref="/play/skyline"
        backLabel="Skyline"
      />
      <MarcheEntreprisesView
        listings={listings}
        cash={Number(skyProfile?.cash ?? 0)}
        userId={profile.id}
      />
    </div>
  );
}
