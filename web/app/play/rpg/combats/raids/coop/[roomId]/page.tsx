import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../../../../_lib/supabase-helpers";
import { CoopRaidClient } from "./coop-raid-client";

export const dynamic = "force-dynamic";

export default async function CoopRaidPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ raid?: string }>;
}) {
  const { roomId } = await params;
  const { raid: raidId } = await searchParams;
  const profile = await getProfile();
  if (!profile) return <p className="p-6 text-zinc-400">Connecte-toi.</p>;
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/combats/raids" className="text-zinc-400 hover:text-zinc-100">
            ← Raids
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-emerald-200">🐲 Raid coop</span>
          <span className="text-xs text-zinc-500">Room {roomId.slice(0, 8)}</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <CoopRaidClient
          roomId={roomId}
          raidId={raidId ?? "kraken"}
          hero={hero!}
          authId={profile.id}
          username={profile.username}
        />
      </main>
    </div>
  );
}
