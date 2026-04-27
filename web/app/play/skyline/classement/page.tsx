import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  ensureSkylineProfile,
  fetchLeaderboard,
  refreshOwnLeaderboard,
} from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { ClassementView } from "./classement-view";

export const dynamic = "force-dynamic";

export default async function ClassementPage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  await refreshOwnLeaderboard();

  const skyProfile = await ensureSkylineProfile();
  const [byNetWorth, byProfit, byMarketCap] = await Promise.all([
    fetchLeaderboard("net_worth", 50),
    fetchLeaderboard("monthly_profit", 50),
    fetchLeaderboard("market_cap_total", 50),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle="Classements"
        backHref="/play/skyline"
        backLabel="Skyline"
      />
      <ClassementView
        byNetWorth={byNetWorth}
        byProfit={byProfit}
        byMarketCap={byMarketCap}
        currentUserId={profile.id}
      />
    </div>
  );
}
