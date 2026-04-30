import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import {
  fetchEternumEquippedItems,
  fetchEternumHero,
} from "../../_lib/supabase-helpers";
import { RaidsClient } from "./raids-client";

export const dynamic = "force-dynamic";

export default async function RaidsPage() {
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
  const items = await fetchEternumEquippedItems(profile.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/combats" className="text-zinc-400 hover:text-zinc-100">
            ← Combats
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-emerald-200">🐲 Raids</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <RaidsClient hero={hero!} items={items} />
      </main>
    </div>
  );
}
