import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { MarketClient } from "./market-client";
import { OnePieceMarketClient } from "../_components/onepiece-market-client";
import { LorMarketClient } from "../_components/lor-market-client";

export const dynamic = "force-dynamic";

export default async function MarketPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();

  let activeListings: MarketListing[] = [];
  let myListings: MarketListing[] = [];
  let myCollection: { card_id: string; count: number }[] = [];
  let favoriteIds: string[] = [];

  if (profile) {
    const supabase = await createClient();
    if (supabase) {
      const [aRes, mRes, cRes, fRes] = await Promise.all([
        supabase
          .from("tcg_card_listings")
          .select(
            "id,seller_id,game_id,card_id,price_os,created_at,status",
          )
          .eq("game_id", gameId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("tcg_card_listings")
          .select(
            "id,seller_id,game_id,card_id,price_os,created_at,status",
          )
          .eq("game_id", gameId)
          .eq("seller_id", profile.id)
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        supabase
          .from("tcg_cards_owned")
          .select("card_id,count")
          .eq("user_id", profile.id)
          .eq("game_id", gameId),
        supabase
          .from("tcg_card_favorites")
          .select("card_id")
          .eq("user_id", profile.id)
          .eq("game_id", gameId),
      ]);
      activeListings = (aRes.data ?? []) as MarketListing[];
      myListings = (mRes.data ?? []) as MarketListing[];
      myCollection = (cRes.data ?? []) as {
        card_id: string;
        count: number;
      }[];
      favoriteIds = ((fRes.data ?? []) as { card_id: string }[]).map(
        (r) => r.card_id,
      );
    }
  }

  if (gameId === "onepiece") {
    return (
      <OnePieceMarketClient
        profile={profile}
        initialActive={activeListings}
        initialMine={myListings}
        myCollection={myCollection}
        favoriteIds={favoriteIds}
      />
    );
  }
  if (gameId === "lol") {
    return (
      <LorMarketClient
        profile={profile}
        initialActive={activeListings}
        initialMine={myListings}
        myCollection={myCollection}
        favoriteIds={favoriteIds}
      />
    );
  }
  return (
    <MarketClient
      profile={profile}
      gameId={gameId as TcgGameId}
      initialActive={activeListings}
      initialMine={myListings}
      myCollection={myCollection}
      favoriteIds={favoriteIds}
    />
  );
}

export type MarketListing = {
  id: string;
  seller_id: string;
  game_id: string;
  card_id: string;
  price_os: number;
  created_at: string;
  status: string;
};
