import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { CombatNav } from "../_components/combat-nav";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type ReplayRow = {
  id: string;
  game_id: string;
  winner_username: string;
  loser_username: string;
  winner_deck_name: string | null;
  loser_deck_name: string | null;
  ranked: boolean;
  duration_seconds: number | null;
  ended_at: string;
  i_won: boolean;
};

export default async function ReplaysPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();
  const t = await getT();

  let replays: ReplayRow[] = [];
  if (profile) {
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase.rpc("list_my_replays", {
        p_game_id: gameId,
      });
      replays = (data as ReplayRow[]) ?? [];
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
          <span className="text-xs text-zinc-500">🎬 Replays</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>
      <main className={`flex flex-1 flex-col overflow-y-auto p-6 ${game.gradient}`}>
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-4">
            <CombatNav gameId={gameId} current="replays" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              {t("tcg.replaysTitle")}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {t("tcg.replaysSubtitle")}
            </p>
          </div>
          {!profile ? (
            <div className="mt-6 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              {t("tcg.loginRequired")}
            </div>
          ) : replays.length === 0 ? (
            <div className="mt-6 rounded-md border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500">
              {t("tcg.replaysEmpty")}
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-2">
              {replays.map((r) => (
                <Link
                  key={r.id}
                  href={`/play/tcg/${gameId}/replays/${r.id}`}
                  className={`rounded-lg border bg-black/40 p-3 transition-colors hover:bg-amber-300/[0.04] ${
                    r.i_won
                      ? "border-emerald-400/30"
                      : "border-rose-400/20"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-zinc-100">
                        {r.i_won ? "✅ Victoire" : "❌ Défaite"} contre{" "}
                        <Link
                          href={`/u/${encodeURIComponent(
                            r.i_won ? r.loser_username : r.winner_username,
                          )}`}
                          className="text-amber-200 hover:underline"
                        >
                          {r.i_won ? r.loser_username : r.winner_username}
                        </Link>
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {new Date(r.ended_at).toLocaleString("fr-FR")}
                        {r.duration_seconds
                          ? ` · ${formatDuration(r.duration_seconds)}`
                          : ""}
                        {r.ranked ? " · 🏆 classé" : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-[10px] uppercase tracking-widest text-zinc-500">
                      {r.i_won ? r.winner_deck_name : r.loser_deck_name}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function formatDuration(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ""}`;
}
