import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import {
  fetchImperiumAlliance,
  fetchImperiumVillages,
} from "../_lib/supabase-helpers";
import { AllianceView } from "./alliance-view";

export const dynamic = "force-dynamic";

export default async function AlliancePage() {
  const profile = await getProfile();
  if (!profile) redirect("/play/imperium");
  const villages = await fetchImperiumVillages(profile.id);
  if (villages.length === 0) redirect("/play/imperium");
  const alliance = await fetchImperiumAlliance(profile.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/imperium"
            className="text-zinc-400 hover:text-zinc-100"
          >
            ← Imperium
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-violet-200">🤝 Alliance</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(167,139,250,0.06),transparent_60%)]">
        <AllianceView
          userId={profile.id}
          username={profile.username}
          alliance={alliance?.alliance ?? null}
          members={alliance?.members ?? []}
        />
      </main>
    </div>
  );
}
