import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import {
  fetchEternumEquippedItems,
  fetchEternumHero,
} from "../../_lib/supabase-helpers";
import { PvpClient } from "./pvp-client";

export const dynamic = "force-dynamic";

export default async function PvpPage() {
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

  // Cherche des adversaires de niveau similaire (ELO ±200).
  const supabase = await createClient();
  let opponents: { user_id: string; class_id: string; element_id: string; level: number; pvp_elo: number }[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("eternum_heroes")
      .select("user_id,class_id,element_id,level,pvp_elo")
      .neq("user_id", profile.id)
      .gte("pvp_elo", 0)
      .order("pvp_elo", { ascending: false })
      .limit(20);
    opponents = (data ?? []) as typeof opponents;
  }
  const items = await fetchEternumEquippedItems(profile.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/combats" className="text-zinc-400 hover:text-zinc-100">
            ← Combats
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-violet-200">⚔️ Arène PvP</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <PvpClient
          hero={hero!}
          items={items}
          opponents={opponents}
          selfId={profile.id}
        />
      </main>
    </div>
  );
}
