import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../_lib/supabase-helpers";

export const dynamic = "force-dynamic";

export default async function CombatsHub() {
  const profile = await getProfile();
  if (!profile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
          <Link href="/play/rpg" className="text-zinc-400 hover:text-zinc-100">
            ← Eternum
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center p-6 text-sm text-zinc-400">
          Connecte-toi pour combattre.
        </main>
      </div>
    );
  }
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg" className="text-zinc-400 hover:text-zinc-100">
            ← Eternum
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-rose-200">⚔️ Combats</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(251,113,133,0.06),transparent_60%)] p-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">⚔️ Combats</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Tous tes modes de combat : tour-par-tour à la Summoners War.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CombatCard
              href="/play/rpg/combats/donjons"
              icon="👹"
              title="Donjons"
              subtitle="Solo · héros + familiers"
              description="Étages auto-progression avec boss final. Drops items + ressources."
              accent="text-amber-200"
              border="border-amber-400/40"
            />
            <CombatCard
              href="/play/rpg/combats/world-boss"
              icon="🐉"
              title="Bot Suprême"
              subtitle="World Boss · familiers only"
              description="3 attempts/jour. Leaderboard de dégâts. Top 10% = pierres prismatiques."
              accent="text-fuchsia-200"
              border="border-fuchsia-400/40"
              highlight
            />
            <CombatCard
              href="/play/rpg/combats/raids"
              icon="🐲"
              title="Raids"
              subtitle="Coop multi · héros only"
              description="Boss HP énorme — collaboration avec d'autres joueurs."
              accent="text-emerald-200"
              border="border-emerald-400/40"
            />
            <CombatCard
              href="/play/rpg/combats/pvp"
              icon="⚔️"
              title="Arène PvP"
              subtitle="Async · saisons + ELO"
              description="Défie d'autres joueurs. Récompenses fin de saison."
              accent="text-violet-200"
              border="border-violet-400/40"
            />
            <CombatCard
              href="/play/rpg/combats/dream"
              icon="🌑"
              title="Mode Rêve"
              subtitle="Héros + familiers"
              description="Hardcore. Drop des shards d'évolution familiers."
              accent="text-indigo-200"
              border="border-indigo-400/40"
            />
            <CombatCard
              href="/play/rpg/combats/challenges"
              icon="🎯"
              title="Défis hebdo"
              subtitle="Restrictions imposées"
              description="Combats avec restrictions (no heal, élément unique…) gros reward."
              accent="text-yellow-200"
              border="border-yellow-400/40"
            />
            <CombatCard
              href="/play/rpg/combats/tower"
              icon="🗼"
              title="Tour Infinie"
              subtitle="Endless"
              description="Étages sans fin. Leaderboard global. Difficulté croissante."
              accent="text-sky-200"
              border="border-sky-400/40"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function CombatCard({
  href,
  icon,
  title,
  subtitle,
  description,
  accent,
  border,
  highlight,
}: {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  accent: string;
  border: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col gap-2 rounded-xl border p-5 transition-colors ${border} bg-black/40 hover:bg-white/[0.04] ${highlight ? "ring-1 ring-fuchsia-400/30" : ""}`}
    >
      <div className="text-3xl">{icon}</div>
      <div>
        <div className={`text-base font-semibold ${accent}`}>{title}</div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-500">
          {subtitle}
        </div>
      </div>
      <div className="text-[11px] leading-relaxed text-zinc-400">
        {description}
      </div>
    </Link>
  );
}
