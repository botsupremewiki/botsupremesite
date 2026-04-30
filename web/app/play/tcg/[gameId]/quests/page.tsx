import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { CombatNav } from "../_components/combat-nav";
import { QuestsClient } from "./quests-client";

export const dynamic = "force-dynamic";

type QuestRow = {
  quest_id: string;
  label: string;
  progress: number;
  target: number;
  gold: number;
  packs: number;
  claimed: boolean;
};

export default async function QuestsPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();

  let quests: QuestRow[] = [];
  if (profile) {
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase.rpc("get_my_daily_quests", {
        p_game_id: gameId,
      });
      quests = (data as QuestRow[]) ?? [];
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
          <span className="text-xs text-zinc-500">🎯 Quêtes journalières</span>
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
            <CombatNav gameId={gameId} current="quests" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              🎯 Quêtes journalières
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              5 défis à compléter chaque jour. Reset à minuit UTC. Les
              progrès sont automatiques quand tu joues — il suffit de
              venir réclamer la récompense.
            </p>
          </div>
          {!profile ? (
            <div className="mt-6 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour voir tes quêtes.
            </div>
          ) : quests.length === 0 ? (
            <div className="mt-6 rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
              Quêtes indisponibles. Lance la migration{" "}
              <code className="text-zinc-300">supabase/tcg-daily-quests.sql</code>.
            </div>
          ) : (
            <QuestsClient gameId={gameId} quests={quests} />
          )}
        </div>
      </main>
    </div>
  );
}
