import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { CombatNav } from "../_components/combat-nav";
import { BattlePassClient } from "./battle-pass-client";

export const dynamic = "force-dynamic";

type BpLevel = {
  level: number;
  rewards: { gold: number; packs: number; label: string };
  unlocked: boolean;
  claimed: boolean;
};

type BpResponse = {
  available: boolean;
  season_number?: number;
  season_start?: string;
  xp?: number;
  level?: number;
  levels?: BpLevel[];
};

export default async function BattlePassPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();

  let bp: BpResponse | null = null;
  if (profile) {
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase.rpc("get_my_battle_pass", {
        p_game_id: gameId,
      });
      bp = (data as BpResponse) ?? null;
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
          <span className="text-xs text-zinc-500">🎫 Battle Pass</span>
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
            <CombatNav gameId={gameId} current="battle-pass" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              🎫 Battle Pass
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Track de récompenses progressives. 50 niveaux par saison.
              200 XP / niveau ; gagne XP à chaque match (100 perdu, 250 gagné,
              +250 si ranked gagné). Reset à chaque nouvelle saison.
            </p>
          </div>
          {!profile ? (
            <div className="mt-6 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour voir ton Battle Pass.
            </div>
          ) : !bp || !bp.available ? (
            <div className="mt-6 rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
              Battle Pass indisponible. Lance la migration{" "}
              <code className="text-zinc-300">supabase/tcg-battle-pass.sql</code>.
            </div>
          ) : (
            <BattlePassClient
              gameId={gameId}
              seasonNumber={bp.season_number ?? 0}
              xp={bp.xp ?? 0}
              level={bp.level ?? 1}
              levels={bp.levels ?? []}
            />
          )}
        </div>
      </main>
    </div>
  );
}
