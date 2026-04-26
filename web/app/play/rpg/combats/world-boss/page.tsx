import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../../_lib/supabase-helpers";
import { WorldBossClient } from "./world-boss-client";
import type { OwnedFamilier } from "../../familiers/page";

export const dynamic = "force-dynamic";

export type LeaderboardRow = {
  user_id: string;
  damage: number;
  attempted_at: string;
};

export default async function WorldBossPage() {
  const profile = await getProfile();
  if (!profile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
          <Link href="/play/rpg/combats" className="text-zinc-400 hover:text-zinc-100">
            ← Combats
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center p-6 text-sm text-zinc-400">
          Connecte-toi.
        </main>
      </div>
    );
  }
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  const supabase = await createClient();
  let team: OwnedFamilier[] = [];
  let leaderboard: LeaderboardRow[] = [];
  let attemptsToday = 0;
  if (supabase) {
    const today = new Date().toISOString().slice(0, 10);
    const [teamRes, lbRes, attRes] = await Promise.all([
      supabase
        .from("eternum_familiers_owned")
        .select("id,familier_id,element_id,level,xp,star,team_slot,in_auberge,acquired_at")
        .eq("user_id", profile.id)
        .not("team_slot", "is", null)
        .order("team_slot"),
      supabase
        .from("eternum_world_boss_attempts")
        .select("user_id,damage,attempted_at")
        .eq("attempt_date", today)
        .order("damage", { ascending: false })
        .limit(20),
      supabase
        .from("eternum_world_boss_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("attempt_date", today),
    ]);
    team = (teamRes.data ?? []) as OwnedFamilier[];
    leaderboard = (lbRes.data ?? []) as LeaderboardRow[];
    attemptsToday = attRes.count ?? 0;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/combats" className="text-zinc-400 hover:text-zinc-100">
            ← Combats
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-fuchsia-200">🐉 Bot Suprême · World Boss</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <WorldBossClient
          team={team}
          leaderboard={leaderboard}
          attemptsToday={attemptsToday}
          selfId={profile.id}
        />
      </main>
    </div>
  );
}
