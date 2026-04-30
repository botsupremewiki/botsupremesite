import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import {
  fetchEternumEquippedItems,
  fetchEternumHero,
} from "../../_lib/supabase-helpers";
import { ChallengesClient } from "./challenges-client";
import type { OwnedFamilier } from "../../familiers/page";
import type { OwnedEquippedItem } from "@shared/eternum-loadout";

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  const profile = await getProfile();
  if (!profile) return <p className="p-6 text-zinc-400">Connecte-toi.</p>;
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  const supabase = await createClient();
  let team: OwnedFamilier[] = [];
  let done: { challenge_id: string }[] = [];
  let items: OwnedEquippedItem[] = [];
  if (supabase) {
    const [tRes, dRes, iRes] = await Promise.all([
      supabase
        .from("eternum_familiers_owned")
        .select("id,familier_id,element_id,level,xp,star,team_slot,in_auberge,acquired_at")
        .eq("user_id", profile.id)
        .not("team_slot", "is", null)
        .order("team_slot"),
      supabase
        .from("eternum_weekly_challenges_done")
        .select("challenge_id")
        .eq("user_id", profile.id),
      fetchEternumEquippedItems(profile.id),
    ]);
    team = (tRes.data ?? []) as OwnedFamilier[];
    done = (dRes.data ?? []) as { challenge_id: string }[];
    items = iRes;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/combats" className="text-zinc-400 hover:text-zinc-100">
            ← Combats
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-yellow-200">🎯 Défis hebdo</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <ChallengesClient
          hero={hero!}
          team={team}
          items={items}
          doneIds={done.map((d) => d.challenge_id)}
        />
      </main>
    </div>
  );
}
