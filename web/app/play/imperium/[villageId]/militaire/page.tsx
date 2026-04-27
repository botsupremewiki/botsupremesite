import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import {
  fetchImperiumVillage,
  fetchImperiumBuildings,
  fetchImperiumUnits,
  fetchImperiumResearch,
  fetchImperiumForge,
  fetchImperiumQueue,
} from "../../_lib/supabase-helpers";
import { MilitaireView } from "./militaire-view";

export const dynamic = "force-dynamic";

export default async function MilitairePage({
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

  const [buildings, units, research, forge, queue] = await Promise.all([
    fetchImperiumBuildings(villageId),
    fetchImperiumUnits(villageId),
    fetchImperiumResearch(villageId),
    fetchImperiumForge(villageId),
    fetchImperiumQueue(villageId),
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
          <span className="font-semibold text-rose-200">⚔️ Militaire</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(244,63,94,0.06),transparent_60%)]">
        <MilitaireView
          village={village}
          buildings={buildings}
          initialUnits={units}
          initialResearch={research}
          initialForge={forge}
          initialQueue={queue}
        />
      </main>
    </div>
  );
}
