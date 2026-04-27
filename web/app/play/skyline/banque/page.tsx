import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  ensureSkylineProfile,
  fetchLoansForUser,
  fetchSkylineCompanies,
} from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { BanqueView } from "./banque-view";

export const dynamic = "force-dynamic";

export default async function BanquePage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  const skyProfile = await ensureSkylineProfile();
  const [loans, companies] = await Promise.all([
    fetchLoansForUser(profile.id),
    fetchSkylineCompanies(profile.id),
  ]);

  const hasUsedStarterLoan = loans.some((l) => l.is_starter_loan);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle="Banque"
        backHref="/play/skyline"
        backLabel="Skyline"
      />
      <BanqueView
        cash={Number(skyProfile?.cash ?? 0)}
        creditScore={skyProfile?.credit_score ?? 0}
        netWorth={Number(skyProfile?.net_worth ?? 0)}
        bankruptcyPending={skyProfile?.bankruptcy_pending ?? false}
        loans={loans}
        companies={companies}
        hasUsedStarterLoan={hasUsedStarterLoan}
      />
    </div>
  );
}
