import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { CombatNav } from "../../_components/combat-nav";
import { TournamentClient } from "./tournament-client";

export const dynamic = "force-dynamic";

type TournamentDetail = {
  id: string;
  name: string;
  game_id: string;
  created_by: string;
  size: number;
  status: string;
  prize_gold: number;
  prize_packs: number;
  winner_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type EntryRow = {
  user_id: string;
  username: string | null;
  deck_id: string | null;
  deck_name: string | null;
  seed: number | null;
  placement: number | null;
};

type MatchRow = {
  id: string;
  round: number;
  bracket_position: number;
  player_a: string | null;
  player_b: string | null;
  player_a_username: string | null;
  player_b_username: string | null;
  winner_id: string | null;
  status: string;
};

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ gameId: string; tournamentId: string }>;
}) {
  const { gameId, tournamentId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();

  const supabase = await createClient();
  if (!supabase) notFound();

  const tRes = await supabase
    .from("tcg_tournaments")
    .select(
      "id,name,game_id,created_by,size,status,prize_gold,prize_packs,winner_id,created_at,started_at,finished_at",
    )
    .eq("id", tournamentId)
    .maybeSingle();
  const tournament = (tRes.data as TournamentDetail | null) ?? null;
  if (!tournament || tournament.game_id !== gameId) notFound();

  // Liste les inscrits avec username via jointure profile.
  const entriesRes = await supabase
    .from("tcg_tournament_entries")
    .select("user_id,deck_id,deck_name,seed,placement,profiles(username)")
    .eq("tournament_id", tournamentId);
  type RawEntry = {
    user_id: string;
    deck_id: string | null;
    deck_name: string | null;
    seed: number | null;
    placement: number | null;
    profiles: { username: string | null } | { username: string | null }[] | null;
  };
  const entries: EntryRow[] = (
    (entriesRes.data as RawEntry[] | null) ?? []
  ).map((r) => {
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      user_id: r.user_id,
      username: prof?.username ?? null,
      deck_id: r.deck_id,
      deck_name: r.deck_name,
      seed: r.seed,
      placement: r.placement,
    };
  });

  // Liste les matches.
  const matchesRes = await supabase
    .from("tcg_tournament_matches")
    .select("id,round,bracket_position,player_a,player_b,winner_id,status")
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true })
    .order("bracket_position", { ascending: true });
  const usernameById = new Map(entries.map((e) => [e.user_id, e.username]));
  const matches: MatchRow[] = (
    (matchesRes.data as Omit<
      MatchRow,
      "player_a_username" | "player_b_username"
    >[] | null) ?? []
  ).map((m) => ({
    ...m,
    player_a_username: m.player_a ? usernameById.get(m.player_a) ?? null : null,
    player_b_username: m.player_b ? usernameById.get(m.player_b) ?? null : null,
  }));

  // Decks du joueur connecté pour le formulaire join.
  let myDecks: { id: string; name: string }[] = [];
  if (profile && tournament.status === "open") {
    const decksRes = await supabase
      .from("tcg_decks")
      .select("id,name")
      .eq("user_id", profile.id)
      .eq("game_id", gameId)
      .order("updated_at", { ascending: false });
    myDecks = (decksRes.data as { id: string; name: string }[]) ?? [];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/${gameId}/tournaments`}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Tournois
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">🏟️ {tournament.name}</span>
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
            <CombatNav gameId={gameId} current="tournaments" />
          </div>
          <TournamentClient
            gameId={gameId}
            tournament={tournament}
            entries={entries}
            matches={matches}
            myUserId={profile?.id ?? null}
            myDecks={myDecks}
          />
        </div>
      </main>
    </div>
  );
}
