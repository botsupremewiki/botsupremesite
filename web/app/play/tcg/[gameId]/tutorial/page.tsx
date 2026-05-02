import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { TutorialClient } from "./tutorial-client";

export const dynamic = "force-dynamic";

export default async function TutorialPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const { gameId } = await params;
  const sp = await searchParams;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();
  // Mode "review" : tutoriel revisitable depuis le hub. Pas de
  // récompense en fin, bouton "Terminer" qui renvoie au hub, et bouton
  // "Skip" toujours dispo. Activé via ?review=1.
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

  // Mode normal (1ère visite) : si déjà complété, redirige vers
  // /boosters. Mode review : on AFFICHE le tutoriel quoi qu'il en soit
  // (l'user veut le revoir).
  if (alreadyCompleted && !reviewMode) {
    redirect(`/play/tcg/${gameId}/boosters`);
  }

  // Header : retour vers le hub autorisé en mode review (toujours) OU
  // si déjà complété OU si pas connecté. Sinon on bloque (1ère visite,
  // user connecté → forcer la complétion).
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
            🎓 Tutoriel{reviewMode ? " (revoir)" : ""}
          </span>
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
          <TutorialClient
            gameId={gameId}
            isLoggedIn={Boolean(profile)}
            alreadyCompleted={alreadyCompleted}
            reviewMode={reviewMode}
          />
        </div>
      </main>
    </div>
  );
}
