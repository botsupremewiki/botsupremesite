import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";

export const dynamic = "force-dynamic";

export default async function CombatsHubPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  const game = TCG_GAMES[gameId as TcgGameId];

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/${gameId}`}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← {game.name}
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">⚔️ Combats</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main className={`flex flex-1 flex-col p-6 ${game.gradient}`}>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">⚔️ Combats</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Choisis ton mode de combat. Les modes classés et l&apos;historique
              arriveront avec la Phase C.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CombatCard
              href={`/play/tcg/${gameId}/battle/bot`}
              icon="🤖"
              title="Bot Suprême"
              subtitle="Entraînement vs IA"
              description="L'IA joue avec un miroir de ton deck. Bat-le 3 fois aujourd'hui pour 1 booster gratuit."
              accent="text-emerald-200"
              border="border-emerald-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.10),transparent_70%)]"
            />
            <CombatCard
              href={`/play/tcg/${gameId}/battle/pvp`}
              icon="🆚"
              title="PvP Fun"
              subtitle="Sans classement"
              description="Match amical contre un autre joueur. Pas d'impact sur ton ELO."
              accent="text-amber-200"
              border="border-amber-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.10),transparent_70%)]"
              highlight
            />
            <CombatCard
              icon="🏆"
              title="PvP Classé"
              subtitle="Système ELO"
              description="Matchmaking par niveau. Gagner monte ton ELO, perdre le baisse."
              accent="text-rose-200"
              border="border-rose-400/30"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.08),transparent_70%)]"
              soon
            />
            <CombatCard
              icon="📜"
              title="Historique"
              subtitle="Tes derniers matchs"
              description="Liste de tes combats récents avec deck et adversaire."
              accent="text-sky-200"
              border="border-sky-400/30"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.08),transparent_70%)]"
              soon
            />
            <CombatCard
              icon="📊"
              title="Stats / ELO"
              subtitle="Ton profil de combat"
              description="ELO actuel, winrate, victoires totales, rang dans la saison."
              accent="text-violet-200"
              border="border-violet-400/30"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(167,139,250,0.08),transparent_70%)]"
              soon
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
  gradient,
  highlight,
  soon,
}: {
  href?: string;
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  accent: string;
  border: string;
  gradient: string;
  highlight?: boolean;
  soon?: boolean;
}) {
  const inner = (
    <div
      className={`group relative flex h-full flex-col gap-2 rounded-xl border p-5 transition-colors ${
        soon
          ? "border-white/10 opacity-60"
          : `${border} bg-black/40 hover:bg-white/[0.04]`
      } ${gradient} ${highlight ? "ring-1 ring-amber-400/30" : ""}`}
    >
      {soon && (
        <span className="absolute right-3 top-3 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-300">
          Bientôt
        </span>
      )}
      <div className="text-3xl">{icon}</div>
      <div>
        <div className={`text-base font-semibold ${accent}`}>{title}</div>
        <div className="text-[11px] uppercase tracking-widest text-zinc-500">
          {subtitle}
        </div>
      </div>
      <div className="mt-1 text-xs leading-relaxed text-zinc-400">
        {description}
      </div>
    </div>
  );
  if (soon || !href) return <div>{inner}</div>;
  return <Link href={href}>{inner}</Link>;
}
