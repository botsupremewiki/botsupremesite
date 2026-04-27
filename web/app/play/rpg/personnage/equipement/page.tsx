import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../../_lib/supabase-helpers";
import { EquipementClient } from "./equipement-client";

export const dynamic = "force-dynamic";

export type OwnedItem = {
  id: string;
  item_id: string;
  equipped_on_hero: boolean;
  equipped_on_familier: string | null;
  acquired_at: string;
};

export default async function EquipementPage() {
  const profile = await getProfile();
  if (!profile) return <p className="p-6 text-zinc-400">Connecte-toi.</p>;
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  const supabase = await createClient();
  let items: OwnedItem[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("eternum_items_owned")
      .select("id,item_id,equipped_on_hero,equipped_on_familier,acquired_at")
      .eq("user_id", profile.id)
      .order("acquired_at", { ascending: false });
    items = (data ?? []) as OwnedItem[];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/personnage" className="text-zinc-400 hover:text-zinc-100">
            ← Personnage
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-amber-200">⚒️ Équipement</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <EquipementClient hero={hero!} initialItems={items} />
      </main>
    </div>
  );
}
