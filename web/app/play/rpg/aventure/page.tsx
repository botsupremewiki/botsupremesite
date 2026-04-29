import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../_lib/supabase-helpers";
import { IdleClient } from "./idle-client";

export const dynamic = "force-dynamic";

type TeamMember = {
  id: string;
  familier_id: string;
  element_id: string;
  level: number;
};

export default async function AventurePage() {
  const profile = await getProfile();
  if (!profile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
          <Link href="/play/rpg" className="text-zinc-400 hover:text-zinc-100">
            ← Eternum
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
            Connecte-toi pour partir à l&apos;aventure.
          </div>
        </main>
      </div>
    );
  }

  const hero = await fetchEternumHero(profile.id);
  if (!hero) {
    redirect("/play/rpg/personnage");
  }

  // Charge l'équipe active (jusqu'à 5 familiers en team_slot non-null)
  let team: TeamMember[] = [];
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase
      .from("eternum_familiers_owned")
      .select("id,familier_id,element_id,level,team_slot")
      .eq("user_id", profile.id)
      .not("team_slot", "is", null)
      .order("team_slot", { ascending: true });
    team = (data ?? []) as TeamMember[];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg" className="text-zinc-400 hover:text-zinc-100">
            ← Eternum
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-sky-200">🌀 Aventure</span>
          <span className="text-xs text-zinc-500">Idle · combat auto</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(125,211,252,0.06),transparent_60%)] p-6">
        <IdleClient
          initialHero={hero!}
          initialGold={profile.gold}
          team={team}
          userId={profile.id}
        />
      </main>
    </div>
  );
}
