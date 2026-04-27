import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../../_lib/supabase-helpers";
import { ETERNUM_DUNGEONS } from "@shared/eternum-content";

export const dynamic = "force-dynamic";

export default async function BestiairePage() {
  const profile = await getProfile();
  if (!profile) return <p className="p-6 text-zinc-400">Connecte-toi.</p>;
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  const supabase = await createClient();
  let entries: { enemy_id: string; defeated_count: number }[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("eternum_bestiary")
      .select("enemy_id,defeated_count")
      .eq("user_id", profile.id);
    entries = (data ?? []) as typeof entries;
  }
  const map = new Map(entries.map((e) => [e.enemy_id, e.defeated_count]));

  // Liste tous les ennemis catalogue (donjons + world boss + raids).
  const allEnemies = ETERNUM_DUNGEONS.flatMap((d) =>
    d.enemies.map((e) => ({ id: `${d.id}-${e.name}`, name: e.name, dungeon: d.name, isBoss: !!e.isBoss })),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/personnage" className="text-zinc-400 hover:text-zinc-100">
            ← Personnage
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-amber-200">📖 Bestiaire</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 overflow-hidden">
          <div className="shrink-0 text-sm text-zinc-400">
            Bestiaire : enregistre les ennemis rencontrés et défaits. Auto-track
            via les RPCs de combat. Compléter la liste donne des bonus
            permanents (à venir en polish).
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {allEnemies.map((e) => {
                const count = map.get(e.id) ?? 0;
                const known = count > 0;
                return (
                  <div
                    key={e.id}
                    className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${
                      known
                        ? "border-amber-400/40 bg-amber-400/[0.04]"
                        : "border-white/5 bg-white/[0.02] opacity-50"
                    }`}
                  >
                    <span>
                      {known ? "✅" : "❓"} <strong>{known ? e.name : "???"}</strong>{" "}
                      {known && <span className="text-[10px] text-zinc-400">({e.dungeon})</span>}
                      {e.isBoss && known && <span className="ml-1 text-[10px] text-rose-300">BOSS</span>}
                    </span>
                    {known && (
                      <span className="text-[10px] tabular-nums text-amber-300">
                        ×{count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
