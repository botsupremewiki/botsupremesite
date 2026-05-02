import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { BattleClient } from "./battle-client";
import { OnePieceBattleClient } from "../../_components/onepiece-battle-client";
import { LorBattleClient } from "../../_components/lor-battle-client";

export const dynamic = "force-dynamic";

/** Cosmétiques actifs pour le jeu courant — sleeve/playmat/coin. */
type ActiveCosmetics = {
  sleeve: string;
  playmat: string;
  coin: string;
};

export default async function BattleTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string; roomId: string }>;
  searchParams: Promise<{ deck?: string }>;
}) {
  const { gameId, roomId } = await params;
  const sp = await searchParams;
  if (!(gameId in TCG_GAMES)) notFound();
  if (!sp.deck) notFound();
  const profile = await getProfile();

  // Charge les cosmétiques actifs pour appliquer les sleeve/playmat/coin
  // visuellement en combat. Si la table/colonne n'existe pas (DB pas
  // migrée), on tombe sur les défauts via les ?? "default".
  let cosmetics: ActiveCosmetics = {
    sleeve: "default",
    playmat: "default",
    coin: "default",
  };
  if (profile) {
    const sb = await createClient();
    if (sb) {
      const { data } = await sb
        .from("profiles")
        .select("tcg_cosmetics_active")
        .eq("id", profile.id)
        .maybeSingle();
      const active = (data as {
        tcg_cosmetics_active?: Record<string, Record<string, string>>;
      } | null)?.tcg_cosmetics_active;
      const gameActive = active?.[gameId] ?? {};
      cosmetics = {
        sleeve: gameActive.sleeve ?? "default",
        playmat: gameActive.playmat ?? "default",
        coin: gameActive.coin ?? "default",
      };
    }
  }

  if (gameId === "onepiece") {
    return (
      <OnePieceBattleClient
        profile={profile}
        roomId={roomId}
        deckId={sp.deck}
      />
    );
  }
  if (gameId === "lol") {
    return (
      <LorBattleClient profile={profile} roomId={roomId} deckId={sp.deck} />
    );
  }
  return (
    <BattleClient
      profile={profile}
      gameId={gameId as TcgGameId}
      roomId={roomId}
      deckId={sp.deck}
      cosmetics={cosmetics}
    />
  );
}
