import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../../_lib/supabase-helpers";
import { QuetesClient } from "./quetes-client";

export const dynamic = "force-dynamic";

export default async function QuetesPage() {
  const profile = await getProfile();
  if (!profile) return <p className="p-6 text-zinc-400">Connecte-toi.</p>;
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  const supabase = await createClient();
  let progress: { quest_id: string; progress: number; claimed_at: string | null }[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("eternum_quest_progress")
      .select("quest_id,progress,claimed_at")
      .eq("user_id", profile.id);
    progress = (data ?? []) as typeof progress;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/personnage" className="text-zinc-400 hover:text-zinc-100">
            ← Personnage
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-amber-200">📜 Quêtes</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <QuetesClient initialProgress={progress} />
      </main>
    </div>
  );
}
