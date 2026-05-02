import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { BattleClient } from "../../battle/[roomId]/battle-client";
import { LorBattleClient } from "../../_components/lor-battle-client";

export const dynamic = "force-dynamic";

/**
 * Page spectateur : observe une room PvP en cours sans pouvoir y agir.
 * Le PartyKit accepte les connexions avec `?spectate=1` et envoie
 * l'état complet (sans révéler les mains).
 */
export default async function SpectatePage({
  params,
}: {
  params: Promise<{ gameId: string; roomId: string }>;
}) {
  const { gameId, roomId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  // Spectator nécessite quand même un profile pour l'authId (anti-abus
  // basique). Pas de deck.
  if (!profile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-sm text-zinc-400">
        Connecte-toi avec Discord pour observer un match.
      </div>
    );
  }
  // Phase 10.2 : LoR utilise son propre client (LorBattleClient).
  if (gameId === "lol") {
    return (
      <LorBattleClient
        profile={profile}
        roomId={roomId}
        deckId=""
        spectatorMode
      />
    );
  }
  return (
    <BattleClient
      profile={profile}
      gameId={gameId as TcgGameId}
      roomId={roomId}
      deckId=""
      spectator
    />
  );
}
