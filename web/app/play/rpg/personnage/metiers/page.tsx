import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../../_lib/supabase-helpers";
import { MetiersClient } from "./metiers-client";

export const dynamic = "force-dynamic";

export type ResourceRow = { resource_id: string; count: number };

export default async function MetiersPage() {
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
          Connecte-toi.
        </main>
      </div>
    );
  }
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  let resources: ResourceRow[] = [];
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase
      .from("eternum_resources_owned")
      .select("resource_id,count")
      .eq("user_id", profile.id);
    resources = (data ?? []) as ResourceRow[];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/rpg/personnage"
            className="text-zinc-400 hover:text-zinc-100"
          >
            ← Personnage
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-amber-200">🔨 Métiers</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <MetiersClient
          initialJob={hero!.jobId}
          initialResources={resources}
        />
      </main>
    </div>
  );
}
