import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { TCG_GAMES, type TcgGameConfig } from "@shared/types";
import { UserPill } from "@/components/user-pill";

export const dynamic = "force-dynamic";

export default async function TcgHub() {
  const profile = await getProfile();
  const games = Object.values(TCG_GAMES);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Plaza
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-medium">TCG · choisir un jeu</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>
      <main className="flex flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.06),transparent_60%)] p-6">
        <div className="grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      </main>
    </div>
  );
}

function GameCard({ game }: { game: TcgGameConfig }) {
  const inner = (
    <div
      className={`group flex h-full flex-col gap-3 rounded-2xl border bg-black/40 p-5 transition-colors ${
        game.active
          ? `${game.border} hover:bg-white/[0.04]`
          : "border-white/10 opacity-60"
      } ${game.gradient}`}
    >
      <div className="flex items-center justify-between">
        <h2 className={`text-lg font-semibold ${game.accent}`}>{game.name}</h2>
        {!game.active && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-300">
            Bientôt
          </span>
        )}
      </div>
      <div className="text-xs text-zinc-400">{game.tagline}</div>
      <div className="mt-auto flex items-center justify-between rounded-md border border-white/5 bg-white/5 p-2 text-xs">
        <span className="text-zinc-400">Pack</span>
        <span className="tabular-nums text-amber-300">
          {game.packPrice.toLocaleString("fr-FR")} OS / {game.packSize} cartes
        </span>
      </div>
    </div>
  );
  if (!game.active) return <div>{inner}</div>;
  return <Link href={`/play/tcg/${game.id}`}>{inner}</Link>;
}
