import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../../_lib/supabase-helpers";
import { PassClient } from "./pass-client";

export const dynamic = "force-dynamic";

export default async function PassPage() {
  const profile = await getProfile();
  if (!profile) return <p className="p-6 text-zinc-400">Connecte-toi.</p>;
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  const supabase = await createClient();
  let pass: { season: string; xp: number; premium: boolean; last_claimed_tier: number } | null = null;
  if (supabase) {
    const { data } = await supabase
      .from("eternum_pass_progress")
      .select("season,xp,premium,last_claimed_tier")
      .eq("user_id", profile.id)
      .maybeSingle();
    pass = (data as typeof pass) ?? null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/personnage" className="text-zinc-400 hover:text-zinc-100">
            ← Personnage
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-amber-200">🎟️ Pass Suprême</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <PassClient initialPass={pass} initialGold={profile.gold} />
      </main>
    </div>
  );
}
