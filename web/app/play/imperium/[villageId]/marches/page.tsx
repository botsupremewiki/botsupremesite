import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import {
  fetchImperiumVillage,
  fetchImperiumMarches,
  fetchImperiumReports,
} from "../../_lib/supabase-helpers";
import { MarchesView } from "./marches-view";

export const dynamic = "force-dynamic";

export default async function MarchesPage({
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

  const [marches, reports] = await Promise.all([
    fetchImperiumMarches(villageId),
    fetchImperiumReports(profile.id, 30),
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
          <span className="font-semibold text-sky-200">🚶 Marches & rapports</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(125,211,252,0.04),transparent_60%)]">
        <MarchesView
          villageId={villageId}
          initialMarches={marches}
          initialReports={reports}
        />
      </main>
    </div>
  );
}
