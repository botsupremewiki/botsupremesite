import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../_lib/supabase-helpers";
import { CreateHeroForm } from "./create-hero-form";
import { HeroSummary } from "./hero-summary";

export const dynamic = "force-dynamic";

export default async function PersonnagePage() {
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
            Connecte-toi avec Discord pour créer ton héros.
          </div>
        </main>
      </div>
    );
  }

  const hero = await fetchEternumHero(profile.id);
  if (!hero) {
    // Pas de héros → flow création.
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
          <div className="flex items-center gap-3">
            <Link
              href="/play/rpg"
              className="text-zinc-400 hover:text-zinc-100"
            >
              ← Eternum
            </Link>
            <div className="h-4 w-px bg-white/10" />
            <span className="font-semibold text-amber-200">
              Création du héros
            </span>
          </div>
          <UserPill profile={profile} variant="play" />
        </header>
        <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.08),transparent_60%)] p-6">
          <CreateHeroForm />
        </main>
      </div>
    );
  }

  // Héros existant → page récap.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg" className="text-zinc-400 hover:text-zinc-100">
            ← Eternum
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-amber-200">🦸 Personnage</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.08),transparent_60%)] p-6">
        <HeroSummary hero={hero} />
      </main>
    </div>
  );
}

