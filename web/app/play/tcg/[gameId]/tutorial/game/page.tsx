import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { TutorialGameClient } from "./tutorial-game-client";

export const dynamic = "force-dynamic";

/**
 * Route /play/tcg/<gameId>/tutorial/game — tutoriel pratique interactif.
 *
 * Variante immersive du tutoriel : au lieu d'un slideshow, le joueur joue
 * une vraie partie scriptée contre un bot fictif, avec un overlay « coach »
 * qui highlight les éléments à utiliser et affiche des bulles d'explication.
 *
 * Pour l'instant uniquement supporté pour Pokemon (les versions OnePiece
 * et LoR seront ajoutées dans des commits ultérieurs).
 *
 * Si le user a déjà complété le tutoriel et qu'on n'est pas en mode review
 * (?review=1), on redirige vers /boosters comme la version slideshow.
 */
export default async function TutorialGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const { gameId } = await params;
  const sp = await searchParams;
  if (!(gameId in TCG_GAMES)) notFound();
  // Pour l'instant, seul Pokemon a la version interactive.
  if (gameId !== "pokemon") {
    redirect(`/play/tcg/${gameId}/tutorial`);
  }
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();
  const reviewMode = sp.review === "1";

  let alreadyCompleted = false;
  if (profile) {
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase.rpc("has_completed_tcg_tutorial", {
        p_game_id: gameId,
      });
      alreadyCompleted = Boolean(data);
    }
  }

  // Mode normal : si déjà complété → boosters. Mode review : laisse passer.
  if (alreadyCompleted && !reviewMode) {
    redirect(`/play/tcg/${gameId}/boosters`);
  }

  const canExit = reviewMode || alreadyCompleted || !profile;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          {canExit ? (
            <Link
              href={`/play/tcg/${gameId}?skipTutorial=1`}
              className="text-zinc-400 transition-colors hover:text-zinc-100"
            >
              ← {game.name}
            </Link>
          ) : (
            <span className="text-zinc-500">{game.name}</span>
          )}
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">
            🎓 Tutoriel pratique{reviewMode ? " (revoir)" : ""}
          </span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        <TutorialGameClient
          gameId={gameId}
          isLoggedIn={Boolean(profile)}
          alreadyCompleted={alreadyCompleted}
          reviewMode={reviewMode}
        />
      </main>
    </div>
  );
}
