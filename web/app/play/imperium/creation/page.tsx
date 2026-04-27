import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { fetchImperiumVillages } from "../_lib/supabase-helpers";
import { CreateVillageForm } from "./create-village-form";

export const dynamic = "force-dynamic";

export default async function CreationPage() {
  const profile = await getProfile();
  if (!profile) {
    redirect("/play/imperium");
  }
  const villages = await fetchImperiumVillages(profile.id);
  if (villages.length > 0) {
    // Déjà un village → retour au hub
    redirect("/play/imperium");
  }

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
          <span className="font-semibold text-amber-200">
            Fonder ton village
          </span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.06),transparent_60%)] p-6">
        <CreateVillageForm />
      </main>
    </div>
  );
}
