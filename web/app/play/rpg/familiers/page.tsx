import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../_lib/supabase-helpers";
import { FamiliersClient } from "./familiers-client";

export const dynamic = "force-dynamic";

export type OwnedFamilier = {
  id: string;
  familier_id: string;
  element_id: string;
  level: number;
  xp: number;
  star: number;
  team_slot: number | null;
  in_auberge: boolean;
  acquired_at: string;
};

export default async function FamiliersPage() {
  const profile = await getProfile();
  if (!profile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
          <Link href="/play/rpg" className="text-zinc-400 hover:text-zinc-100">
            ← Eternum
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center p-6 text-sm text-zinc-400">
          Connecte-toi pour voir tes familiers.
        </main>
      </div>
    );
  }

  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  const supabase = await createClient();
  let owned: OwnedFamilier[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("eternum_familiers_owned")
      .select(
        "id,familier_id,element_id,level,xp,star,team_slot,in_auberge,acquired_at",
      )
      .eq("user_id", profile.id)
      .order("acquired_at", { ascending: false });
    owned = (data ?? []) as OwnedFamilier[];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg" className="text-zinc-400 hover:text-zinc-100">
            ← Eternum
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-violet-200">🐾 Familiers</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,rgba(167,139,250,0.06),transparent_60%)] p-6">
        <FamiliersClient
          initialOwned={owned}
          initialGold={profile.gold}
          userId={profile.id}
        />
      </main>
    </div>
  );
}
