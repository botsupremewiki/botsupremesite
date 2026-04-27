import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { AmisClient } from "./amis-client";

export const dynamic = "force-dynamic";

export default async function AmisPage() {
  const profile = await getProfile();

  if (!profile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
          <Link href="/play" className="text-zinc-400 hover:text-zinc-100">
            ← Plaza
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
            Connecte-toi avec Discord pour voir tes amis.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play" className="text-zinc-400 hover:text-zinc-100">
            ← Plaza
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold">Amis</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08),transparent_60%)] p-6">
        <AmisClient currentUserId={profile.id} />
      </main>
    </div>
  );
}
