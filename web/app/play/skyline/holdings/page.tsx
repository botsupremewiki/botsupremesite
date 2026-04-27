import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import {
  ensureSkylineProfile,
  fetchHoldingsForUser,
  fetchSkylineCompanies,
} from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { HoldingsView } from "./holdings-view";

export const dynamic = "force-dynamic";

export default async function HoldingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  const skyProfile = await ensureSkylineProfile();
  const [holdings, companies] = await Promise.all([
    fetchHoldingsForUser(profile.id),
    fetchSkylineCompanies(profile.id),
  ]);

  // Pour chaque holding, récupère ses entreprises liées.
  const supabase = await createClient();
  let holdingsLinks: Record<string, string[]> = {};
  if (supabase && holdings.length > 0) {
    const { data } = await supabase
      .from("skyline_company_holdings_link")
      .select("holding_id, company_id")
      .in(
        "holding_id",
        holdings.map((h) => h.id),
      );
    if (data) {
      holdingsLinks = (data as { holding_id: string; company_id: string }[]).reduce(
        (acc, link) => {
          (acc[link.holding_id] ??= []).push(link.company_id);
          return acc;
        },
        {} as Record<string, string[]>,
      );
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle="Holdings"
        backHref="/play/skyline"
        backLabel="Skyline"
      />
      <HoldingsView
        holdings={holdings}
        holdingsLinks={holdingsLinks}
        companies={companies}
      />
    </div>
  );
}
