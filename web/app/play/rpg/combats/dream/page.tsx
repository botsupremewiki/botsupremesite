import Link from "next/link";
import { ETERNUM_DREAMS } from "@shared/eternum-content";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";

export const dynamic = "force-dynamic";

export default async function DreamPage() {
  const profile = await getProfile();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/combats" className="text-zinc-400 hover:text-zinc-100">
            ← Combats
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-indigo-200">🌑 Mode Rêve</span>
        </div>
        {profile && <UserPill profile={profile} variant="play" />}
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-4 text-sm text-zinc-400">
            Mode hardcore qui drop des shards d&apos;évolution familiers.
            Combat fonctionnel via P10 (système de shards).
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {ETERNUM_DREAMS.map((d) => (
              <div
                key={d.id}
                className="rounded-xl border border-indigo-400/30 bg-black/40 p-4"
              >
                <div className="text-3xl">{d.glyph}</div>
                <div className="mt-1 text-base font-bold text-indigo-200">{d.name}</div>
                <div className="mt-1 text-[11px] text-zinc-400">
                  Niv recommandé : {d.recommendedLevel} · ⚡ {d.energyCost}
                </div>
                <div className="mt-1 text-[11px] text-zinc-400">{d.description}</div>
                <div className="mt-2 rounded bg-white/5 p-2 text-[10px] text-amber-200">
                  Drops shards :{" "}
                  {Object.entries(d.shardsByRarity)
                    .map(([r, c]) => `${r} ${Math.round(c * 100)}%`)
                    .join(" · ")}
                </div>
                <button
                  disabled
                  className="mt-2 w-full rounded-md bg-white/10 px-3 py-2 text-xs text-zinc-400 disabled:cursor-not-allowed"
                  title="Activé après lancement de la migration P10"
                >
                  Combattre (P10 — système shards)
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
