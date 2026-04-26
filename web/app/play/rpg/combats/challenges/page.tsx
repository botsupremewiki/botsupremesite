import Link from "next/link";
import { ETERNUM_WEEKLY_CHALLENGES } from "@shared/eternum-content";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  const profile = await getProfile();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg/combats" className="text-zinc-400 hover:text-zinc-100">
            ← Combats
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-yellow-200">🎯 Défis hebdo</span>
        </div>
        {profile && <UserPill profile={profile} variant="play" />}
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-4 text-sm text-zinc-400">
            4 défis hebdomadaires avec restrictions imposées. Reset chaque
            lundi UTC. Récompenses massives. Activation des combats : prochain
            polish (besoin de UI de configuration de restrictions).
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {ETERNUM_WEEKLY_CHALLENGES.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-yellow-400/30 bg-black/40 p-4"
              >
                <div className="text-3xl">{c.glyph}</div>
                <div className="mt-1 text-base font-bold text-yellow-200">{c.name}</div>
                <div className="mt-1 text-[11px] text-zinc-400">{c.description}</div>
                <div className="mt-2 rounded bg-white/5 p-2 text-[10px] text-zinc-300">
                  📜 <strong>Règle :</strong> {c.rule}
                </div>
                <div className="mt-2 text-[11px] text-amber-300">
                  🎁 +{c.rewardOs.toLocaleString("fr-FR")} OS
                  {c.rewardResources.map((r) => ` · ${r.count}× ${r.id}`).join("")}
                </div>
                <button
                  disabled
                  className="mt-2 w-full rounded-md bg-white/10 px-3 py-2 text-xs text-zinc-400"
                >
                  Bientôt
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
