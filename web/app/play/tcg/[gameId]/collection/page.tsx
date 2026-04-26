import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { POKEMON_BASE_SET } from "@shared/tcg-pokemon-base";
import { UserPill } from "@/components/user-pill";
import { CollectionGrid } from "../_components/collection-grid";

export const dynamic = "force-dynamic";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  const game = TCG_GAMES[gameId as TcgGameId];

  // Charge la collection depuis Supabase (RLS : le user lit la sienne).
  let collection = new Map<string, number>();
  if (profile) {
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase
        .from("tcg_cards_owned")
        .select("card_id,count")
        .eq("user_id", profile.id)
        .eq("game_id", gameId);
      for (const row of (data ?? []) as {
        card_id: string;
        count: number;
      }[]) {
        collection.set(row.card_id, row.count);
      }
    }
  }

  const pool = gameId === "pokemon" ? POKEMON_BASE_SET : [];
  const owned = Array.from(collection.values()).filter((n) => n > 0).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/${gameId}`}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← {game.name}
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">📚 Ma Collection</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main
        className={`flex flex-1 flex-col overflow-hidden p-6 ${game.gradient}`}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 overflow-hidden">
          <div className="shrink-0">
            <h1 className="text-2xl font-bold text-zinc-100">
              📚 Ma Collection
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {owned} / {pool.length} cartes possédées. Filtre par type,
              rareté, statut, ou recherche par nom.
            </p>
          </div>

          {!profile ? (
            <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour voir ta collection.
            </div>
          ) : (
            <CollectionGrid pool={pool} collection={collection} />
          )}
        </div>
      </main>
    </div>
  );
}
