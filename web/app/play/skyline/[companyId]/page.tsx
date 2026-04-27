import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  ensureSkylineProfile,
  fetchAirlineRoutes,
  fetchBtpProjects,
  fetchCasinoConfig,
  fetchEmployeesForCompany,
  fetchListingForCompany,
  fetchLuxuryBrand,
  fetchMachinesForCompany,
  fetchMediaAudience,
  fetchMediaPrograms,
  fetchMilitaryContracts,
  fetchPermitsForCompany,
  fetchPharmaPatents,
  fetchPharmaResearch,
  fetchRestaurantStars,
  fetchSaasProducts,
  fetchShareForCompany,
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

  const [
    furniture,
    inventory,
    transactions,
    employees,
    permits,
    machines,
    share,
  ] = await Promise.all([
    fetchSkylineFurniture(companyId),
    fetchSkylineInventory(companyId),
    fetchSkylineTransactions(profile.id, companyId, 30),
    fetchEmployeesForCompany(companyId),
    fetchPermitsForCompany(companyId),
    fetchMachinesForCompany(companyId),
    fetchShareForCompany(companyId),
  ]);

  // P10 specifics chargés conditionnellement.
  const isPharma = company.sector === "pharma" || company.sector === "sante_clinique";
  const isTech = company.sector === "tech_digital";
  const isRestau = ["restaurant_gastro", "pizzeria", "fast_food", "cafe_bar"].includes(
    company.sector,
  );

  const isBtp = company.sector === "btp_construction";
  const isCasino = company.sector === "casino";
  const isAerien = company.sector === "aerien";
  const isMedia =
    company.sector === "diffusion_tv" || company.sector === "medias_studio";
  const isLuxury = ["joaillerie", "parfumerie", "boutique_vetements"].includes(
    company.sector,
  );
  const isArmement = company.sector === "armement";

  const [
    pharmaResearch,
    pharmaPatents,
    saasProducts,
    restauStars,
    listing,
    btpProjects,
    casinoConfig,
    airlineRoutes,
    mediaPrograms,
    mediaAudience,
    luxuryBrand,
    militaryContracts,
  ] = await Promise.all([
    isPharma ? fetchPharmaResearch(companyId) : Promise.resolve([]),
    isPharma ? fetchPharmaPatents(companyId) : Promise.resolve([]),
    isTech ? fetchSaasProducts(companyId) : Promise.resolve([]),
    isRestau ? fetchRestaurantStars(companyId) : Promise.resolve(null),
    fetchListingForCompany(companyId),
    isBtp ? fetchBtpProjects(companyId) : Promise.resolve([]),
    isCasino ? fetchCasinoConfig(companyId) : Promise.resolve(null),
    isAerien ? fetchAirlineRoutes(companyId) : Promise.resolve([]),
    isMedia ? fetchMediaPrograms(companyId) : Promise.resolve([]),
    isMedia ? fetchMediaAudience(companyId) : Promise.resolve(null),
    isLuxury ? fetchLuxuryBrand(companyId) : Promise.resolve(null),
    isArmement ? fetchMilitaryContracts() : Promise.resolve([]),
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
        machines={machines}
        share={share}
        pharmaResearch={pharmaResearch}
        pharmaPatents={pharmaPatents}
        saasProducts={saasProducts}
        restauStars={restauStars}
        listing={listing}
        btpProjects={btpProjects}
        casinoConfig={casinoConfig}
        airlineRoutes={airlineRoutes}
        mediaPrograms={mediaPrograms}
        mediaAudience={mediaAudience}
        luxuryBrand={luxuryBrand}
        militaryContracts={militaryContracts}
        cash={Number(skyProfile?.cash ?? 0)}
      />
    </div>
  );
}
