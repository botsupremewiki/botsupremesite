import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { CombatNav } from "../../_components/combat-nav";

export const dynamic = "force-dynamic";

type HistoryRow = {
  id: string;
  game_id: string;
  winner_id: string;
  loser_id: string;
  winner_username: string;
  loser_username: string;
  winner_deck_name: string | null;
  loser_deck_name: string | null;
  ranked: boolean;
  winner_elo_before: number | null;
  winner_elo_after: number | null;
  loser_elo_before: number | null;
  loser_elo_after: number | null;
  reason: string | null;
  ended_at: string;
};

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  const game = TCG_GAMES[gameId as TcgGameId];

  let rows: HistoryRow[] = [];
  if (profile) {
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase
        .from("battle_history")
        .select("*")
        .eq("game_id", gameId)
        .order("ended_at", { ascending: false })
        .limit(50);
      rows = (data ?? []) as HistoryRow[];
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
          <span className="text-xs text-zinc-500">📜 Historique</span>
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
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-4">
            <CombatNav gameId={gameId} current="history" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">📜 Historique</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Tes 50 derniers matchs PvP (fun et classés). Les combats vs Bot
            Suprême ne sont pas enregistrés.
          </p>

          {!profile ? (
            <div className="mt-6 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour voir ton historique.
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-6 rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
              Aucun match enregistré pour l&apos;instant.
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-2">
              {rows.map((row) => (
                <HistoryRowCard
                  key={row.id}
                  row={row}
                  selfId={profile.id}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function HistoryRowCard({ row, selfId }: { row: HistoryRow; selfId: string }) {
  const won = row.winner_id === selfId;
  const opponent = won ? row.loser_username : row.winner_username;
  const myDeck = won ? row.winner_deck_name : row.loser_deck_name;
  const oppDeck = won ? row.loser_deck_name : row.winner_deck_name;
  const myEloBefore = won ? row.winner_elo_before : row.loser_elo_before;
  const myEloAfter = won ? row.winner_elo_after : row.loser_elo_after;
  const eloDelta =
    row.ranked && myEloBefore !== null && myEloAfter !== null
      ? myEloAfter - myEloBefore
      : null;
  const date = new Date(row.ended_at);
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
        won
          ? "border-emerald-400/30 bg-emerald-400/[0.04]"
          : "border-rose-400/20 bg-rose-400/[0.03]"
      }`}
    >
      <div
        className={`rounded-md px-2 py-1 text-xs font-bold ${
          won
            ? "bg-emerald-500/20 text-emerald-200"
            : "bg-rose-500/20 text-rose-200"
        }`}
      >
        {won ? "Victoire" : "Défaite"}
      </div>
      {row.ranked && (
        <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-amber-200">
          Classé
        </span>
      )}
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-200">
        <span className="font-semibold">vs {opponent}</span>
        {oppDeck && (
          <span className="text-xs text-zinc-500">({oppDeck})</span>
        )}
        {myDeck && (
          <span className="text-xs text-zinc-500">· deck : {myDeck}</span>
        )}
      </div>
      {eloDelta !== null && (
        <div
          className={`text-xs font-semibold tabular-nums ${
            eloDelta >= 0 ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          ELO {eloDelta >= 0 ? `+${eloDelta}` : eloDelta} → {myEloAfter}
        </div>
      )}
      <div className="text-[10px] text-zinc-500">
        {date.toLocaleDateString("fr-FR")} {date.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}
