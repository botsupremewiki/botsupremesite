import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import {
  fetchEternumEquippedItems,
  fetchEternumHero,
} from "../../_lib/supabase-helpers";
import { TowerClient } from "./tower-client";
import type { OwnedEquippedItem } from "@shared/eternum-loadout";

export const dynamic = "force-dynamic";

export default async function TowerPage() {
  const profile = await getProfile();
  if (!profile) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-sm text-zinc-400">
        Connecte-toi.
      </main>
    );
  }
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  const supabase = await createClient();
  let bestFloor = 0;
  let leaderboard: { user_id: string; best_floor: number }[] = [];
  let items: OwnedEquippedItem[] = [];
  if (supabase) {
    const [meRes, lbRes, itemsRes] = await Promise.all([
      supabase
        .from("eternum_tower_progress")
        .select("best_floor")
        .eq("user_id", profile.id)
        .maybeSingle(),
      supabase
        .from("eternum_tower_progress")
        .select("user_id,best_floor")
        .order("best_floor", { ascending: false })
        .limit(20),
      fetchEternumEquippedItems(profile.id),
    ]);
    bestFloor = (meRes.data?.best_floor as number) ?? 0;
    leaderboard = (lbRes.data ?? []) as typeof leaderboard;
    items = itemsRes;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/combats" className="text-zinc-400 hover:text-zinc-100">
            ← Combats
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-sky-200">🗼 Tour Infinie</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <TowerClient
          hero={hero!}
          items={items}
          startFloor={bestFloor + 1}
          leaderboard={leaderboard}
          selfId={profile.id}
        />
      </main>
    </div>
  );
}
