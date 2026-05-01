import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { STARTER_DECKS } from "@shared/tcg-pokemon-starter-decks";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import { UserPill } from "@/components/user-pill";
import { StarterDecksClient } from "./starter-decks-client";

export const dynamic = "force-dynamic";

export default async function StarterDecksPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  if (gameId !== "pokemon") redirect(`/play/tcg/${gameId}`);
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();

  // Charge la collection pour savoir quels starters sont jouables.
  const collection = new Map<string, number>();
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

  // Pour chaque template, calcule lesquelles cartes manquent.
  const summary = STARTER_DECKS.map((d) => {
    const missing: { cardId: string; cardName: string; count: number }[] = [];
    for (const c of d.cards) {
      const owned = collection.get(c.cardId) ?? 0;
      if (owned < c.count) {
        const card = POKEMON_BASE_SET_BY_ID.get(c.cardId);
        missing.push({
          cardId: c.cardId,
          cardName: card?.name ?? c.cardId,
          count: c.count - owned,
        });
      }
    }
    return {
      ...d,
      missing,
      adoptable: missing.length === 0,
    };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/${gameId}/decks`}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Mes decks
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">🎴 Decks de départ</span>
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
          <h1 className="text-2xl font-bold text-zinc-100">
            🎴 Decks de départ
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Choisis un deck préfabriqué pour démarrer en un clic. Si tu
            n&apos;as pas toutes les cartes, ouvre quelques boosters
            d&apos;abord.
          </p>
          {!profile ? (
            <div className="mt-6 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour adopter un deck.
            </div>
          ) : (
            <StarterDecksClient gameId={gameId} decks={summary} />
          )}
        </div>
      </main>
    </div>
  );
}
