import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import { generateDeckFromCollection } from "@shared/tcg-pokemon-ai-deckbuilder";
import { UserPill } from "@/components/user-pill";
import { AutoDeckClient } from "./auto-deck-client";

export const dynamic = "force-dynamic";

export default async function AutoDeckPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  if (gameId !== "pokemon")
    return (
      <p className="p-6 text-zinc-400">
        Auto-deckbuilder dispo pour Pokémon uniquement.
      </p>
    );
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();

  // Charge la collection et lance la génération côté serveur.
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
  const generated = profile ? generateDeckFromCollection(collection) : null;
  // Enrichit chaque carte avec son nom + image pour le rendu.
  const enriched = generated
    ? generated.cards.map((c) => {
        const card = POKEMON_BASE_SET_BY_ID.get(c.cardId);
        return {
          cardId: c.cardId,
          count: c.count,
          name: card?.name ?? c.cardId,
          image: card && "image" in card ? card.image : null,
        };
      })
    : [];

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
          <span className="text-xs text-zinc-500">🤖 Auto-deck</span>
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
            🤖 Auto-deckbuilder
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Génère un deck équilibré de 20 cartes à partir de ta
            collection. Choisit un Pokémon leader, sa ligne d&apos;évolution,
            des basics du même type, et 4 trainers utilitaires.
          </p>
          {!profile ? (
            <div className="mt-6 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour générer un deck.
            </div>
          ) : !generated || generated.errors.length > 0 ? (
            <div className="mt-6 rounded-md border border-rose-400/30 bg-rose-400/5 p-4">
              <div className="text-sm font-bold text-rose-200">
                Génération impossible
              </div>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-rose-200">
                {generated?.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
              <Link
                href={`/play/tcg/${gameId}/boosters`}
                className="mt-3 inline-block text-xs text-amber-300 underline-offset-2 hover:underline"
              >
                Ouvre des boosters →
              </Link>
            </div>
          ) : (
            <AutoDeckClient
              gameId={gameId}
              name={generated.name}
              cards={enriched}
              energyTypes={generated.energyTypes}
            />
          )}
        </div>
      </main>
    </div>
  );
}
