import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { WonderPickClient } from "./wonder-pick-client";

export const dynamic = "force-dynamic";

type PoolEntry = {
  id: string;
  opener_username: string | null;
  pack_type: string | null;
  cards: string[];
  created_at: string;
};

export default async function WonderPickPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();

  let crystals = 0;
  let pool: PoolEntry[] = [];
  if (profile) {
    const supabase = await createClient();
    if (supabase) {
      const [profRes, poolRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("wonder_pick_crystals")
          .eq("id", profile.id)
          .maybeSingle(),
        supabase.rpc("wonder_pick_pool_preview", { p_game_id: gameId }),
      ]);
      crystals =
        (profRes.data as { wonder_pick_crystals?: number } | null)
          ?.wonder_pick_crystals ?? 0;
      pool = (poolRes.data as PoolEntry[]) ?? [];
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
          <span className="text-xs text-zinc-500">🎲 Pioche Mystère</span>
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
          <h1 className="text-2xl font-bold text-zinc-100">
            🎲 Pioche Mystère
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Dépense 1 cristal pour piocher au hasard 1 carte parmi un pack
            ouvert récemment par un autre joueur. Tu gagnes 1 cristal pour
            chaque match PvP gagné (max 10 en stock).
          </p>
          {!profile ? (
            <div className="mt-6 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour utiliser la Pioche Mystère.
            </div>
          ) : (
            <WonderPickClient
              gameId={gameId}
              initialCrystals={crystals}
              poolPreview={pool}
            />
          )}
        </div>
      </main>
    </div>
  );
}
