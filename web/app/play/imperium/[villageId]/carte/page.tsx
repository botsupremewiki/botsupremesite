import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import {
  fetchImperiumVillage,
  fetchImperiumMapArea,
  fetchImperiumUnits,
} from "../../_lib/supabase-helpers";
import { CarteView } from "./carte-view";

export const dynamic = "force-dynamic";

export default async function CartePage({
  params,
}: {
  params: Promise<{ villageId: string }>;
}) {
  const { villageId } = await params;
  const profile = await getProfile();
  if (!profile) redirect("/play/imperium");
  const village = await fetchImperiumVillage(villageId);
  if (!village) notFound();
  if (village.user_id !== profile.id) redirect("/play/imperium");

  // Carte centrée sur le village, rayon 8
  const [cells, units] = await Promise.all([
    fetchImperiumMapArea(village.x, village.y, 8),
    fetchImperiumUnits(villageId),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/imperium/${villageId}`}
            className="text-zinc-400 hover:text-zinc-100"
          >
            ← {village.name}
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-emerald-200">🗺️ Carte monde</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.04),transparent_60%)]">
        <CarteView
          village={village}
          initialCells={cells}
          units={units}
        />
      </main>
    </div>
  );
}
