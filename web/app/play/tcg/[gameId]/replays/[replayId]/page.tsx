import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { CombatNav } from "../../_components/combat-nav";
import { ReplayPlayer } from "./replay-player";
import { ShareReplayButton } from "./share-button";

export const dynamic = "force-dynamic";

type ReplayDetail = {
  id: string;
  game_id: string;
  winner_username: string;
  loser_username: string;
  winner_deck_name: string | null;
  loser_deck_name: string | null;
  ranked: boolean;
  duration_seconds: number | null;
  ended_at: string;
  log: string[];
  winner_id: string | null;
  loser_id: string | null;
};

export default async function ReplayDetailPage({
  params,
}: {
  params: Promise<{ gameId: string; replayId: string }>;
}) {
  const { gameId, replayId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();

  const supabase = await createClient();
  if (!supabase) notFound();

  const { data } = await supabase
    .from("tcg_replays")
    .select(
      "id,game_id,winner_username,loser_username,winner_deck_name,loser_deck_name,ranked,duration_seconds,ended_at,log,winner_id,loser_id",
    )
    .eq("id", replayId)
    .maybeSingle();
  const replay = (data as ReplayDetail | null) ?? null;
  if (!replay || replay.game_id !== gameId) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/${gameId}/replays`}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Replays
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">🎬 Replay</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>
      <main
        className={`flex flex-1 flex-col overflow-y-auto p-6 ${game.gradient}`}
      >
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-4">
            <CombatNav gameId={gameId} current="replays" />
          </div>
          <div className="rounded-xl border border-amber-300/40 bg-amber-300/5 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-2xl font-bold text-zinc-100">
                <Link
                  href={`/u/${encodeURIComponent(replay.winner_username)}`}
                  className="text-emerald-300 hover:underline"
                >
                  {replay.winner_username}
                </Link>{" "}
                <span className="text-zinc-500">vs</span>{" "}
                <Link
                  href={`/u/${encodeURIComponent(replay.loser_username)}`}
                  className="text-rose-300 hover:underline"
                >
                  {replay.loser_username}
                </Link>
              </h1>
              <div className="flex flex-col items-end gap-1.5">
                <div className="text-xs text-zinc-400">
                  {new Date(replay.ended_at).toLocaleString("fr-FR")}
                  {replay.ranked ? " · 🏆 classé" : ""}
                </div>
                <ShareReplayButton />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-md border border-emerald-400/30 bg-emerald-400/5 px-2 py-0.5 text-emerald-200">
                🏆 {replay.winner_deck_name ?? "—"}
              </span>
              <span className="rounded-md border border-rose-400/30 bg-rose-400/5 px-2 py-0.5 text-rose-200">
                ❌ {replay.loser_deck_name ?? "—"}
              </span>
              {replay.duration_seconds ? (
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-zinc-300">
                  ⏱ {formatDuration(replay.duration_seconds)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-6">
            <ReplayPlayer log={replay.log ?? []} />
          </div>
        </div>
      </main>
    </div>
  );
}

function formatDuration(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ""}`;
}
