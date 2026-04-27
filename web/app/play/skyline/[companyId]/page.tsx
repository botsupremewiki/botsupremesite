import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  ensureSkylineProfile,
  fetchEmployeesForCompany,
  fetchPermitsForCompany,
  fetchSkylineCompany,
  fetchSkylineFurniture,
  fetchSkylineInventory,
  fetchSkylineTransactions,
} from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { CompanyView } from "./company-view";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  const { companyId } = await params;

  const skyProfile = await ensureSkylineProfile();
  const company = await fetchSkylineCompany(companyId);
  if (!company || company.user_id !== profile.id) {
    redirect("/play/skyline");
  }

  const [furniture, inventory, transactions, employees, permits] =
    await Promise.all([
      fetchSkylineFurniture(companyId),
      fetchSkylineInventory(companyId),
      fetchSkylineTransactions(profile.id, companyId, 30),
      fetchEmployeesForCompany(companyId),
      fetchPermitsForCompany(companyId),
    ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle={company.name}
        backHref="/play/skyline"
        backLabel="Skyline"
      />

      <CompanyView
        company={company}
        furniture={furniture}
        inventory={inventory}
        transactions={transactions}
        employees={employees}
        permits={permits}
        cash={Number(skyProfile?.cash ?? 0)}
      />
    </div>
  );
}
