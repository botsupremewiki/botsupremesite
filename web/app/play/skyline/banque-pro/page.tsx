import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  ensureSkylineProfile,
  fetchOfferedLoansByLender,
  fetchPotentialBorrowers,
  fetchSkylineCompanies,
} from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { BanqueProView } from "./banque-pro-view";

export const dynamic = "force-dynamic";

export default async function BanqueProPage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  const skyProfile = await ensureSkylineProfile();
  const [companies, borrowers, offered] = await Promise.all([
    fetchSkylineCompanies(profile.id),
    fetchPotentialBorrowers(profile.id, 30),
    fetchOfferedLoansByLender(profile.id),
  ]);

  const banks = companies.filter((c) => c.sector === "banque_commerciale");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle="Banque pro"
        backHref="/play/skyline"
        backLabel="Skyline"
      />
      <BanqueProView
        banks={banks}
        borrowers={borrowers}
        offered={offered}
        cash={Number(skyProfile?.cash ?? 0)}
      />
    </div>
  );
}
