import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import {
  fetchImperiumVillage,
  fetchImperiumBuildings,
  fetchImperiumQueue,
  fetchImperiumUnits,
} from "../_lib/supabase-helpers";
import { VillageView } from "./village-view";

export const dynamic = "force-dynamic";

export default async function VillagePage({
  params,
}: {
  params: Promise<{ villageId: string }>;
}) {
  const { villageId } = await params;
  const profile = await getProfile();
  if (!profile) {
    redirect("/play/imperium");
  }
  const village = await fetchImperiumVillage(villageId);
  if (!village) notFound();
  if (village.user_id !== profile.id) {
    // Pas notre village → redirect vers le hub
    redirect("/play/imperium");
  }

  const [buildings, queue, units] = await Promise.all([
    fetchImperiumBuildings(villageId),
    fetchImperiumQueue(villageId),
    fetchImperiumUnits(villageId),
  ]);

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
          <span className="font-semibold text-amber-200">🏰 {village.name}</span>
          <span className="text-xs text-zinc-500">
            ({village.x}, {village.y})
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/play/imperium/${villageId}/militaire`}
            className="text-rose-300 hover:text-rose-200 text-xs"
          >
            ⚔️ Militaire
          </Link>
          <Link
            href={`/play/imperium/${villageId}/carte`}
            className="text-emerald-300 hover:text-emerald-200 text-xs"
          >
            🗺️ Carte
          </Link>
          <Link
            href={`/play/imperium/${villageId}/marches`}
            className="text-sky-300 hover:text-sky-200 text-xs"
          >
            🚶 Marches
          </Link>
          <UserPill profile={profile} variant="play" />
        </div>
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.06),transparent_60%)]">
        <VillageView
          initialVillage={village}
          initialBuildings={buildings}
          initialQueue={queue}
          initialUnits={units}
        />
      </main>
    </div>
  );
}
