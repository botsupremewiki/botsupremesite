import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { CombatNav } from "../_components/combat-nav";
import { TournamentsClient } from "./tournaments-client";

export const dynamic = "force-dynamic";

type TournamentRow = {
  id: string;
  name: string;
  game_id: string;
  created_by: string;
  creator_username: string | null;
  size: number;
  status: string;
  prize_gold: number;
  prize_packs: number;
  winner_id: string | null;
  winner_username: string | null;
  entries_count: number;
  created_at: string;
};

export default async function TournamentsPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();

  let tournaments: TournamentRow[] = [];
  let myDecks: { id: string; name: string }[] = [];
  let myGold = 0;
  let myPacks = 0;
  const supabase = await createClient();
  if (supabase) {
    const tRes = await supabase.rpc("list_tournaments", {
      p_game_id: gameId,
      p_status: null,
    });
    tournaments = (tRes.data as TournamentRow[]) ?? [];
    if (profile) {
      const [decksRes, profRes] = await Promise.all([
        supabase
          .from("tcg_decks")
          .select("id,name")
          .eq("user_id", profile.id)
          .eq("game_id", gameId)
          .order("updated_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("gold,tcg_free_packs")
          .eq("id", profile.id)
          .maybeSingle(),
      ]);
      myDecks = (decksRes.data as { id: string; name: string }[]) ?? [];
      const prof = profRes.data as
        | { gold: number; tcg_free_packs: Record<string, number> | null }
        | null;
      myGold = prof?.gold ?? 0;
      myPacks = prof?.tcg_free_packs?.[gameId] ?? 0;
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
          <span className="text-xs text-zinc-500">🏟️ Tournois</span>
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
          <TournamentsClient
            gameId={gameId}
            tournaments={tournaments}
            isLoggedIn={Boolean(profile)}
            myUserId={profile?.id ?? null}
            myDecks={myDecks}
            myGold={myGold}
            myPacks={myPacks}
          />
        </div>
      </main>
    </div>
  );
}
