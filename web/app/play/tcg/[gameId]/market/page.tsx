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
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ tab?: string; sub?: string }>;
}) {
  const { gameId } = await params;
  const sp = await searchParams;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();

  let activeListings: MarketListing[] = [];
  let myListings: MarketListing[] = [];
  let myCollection: { card_id: string; count: number }[] = [];
  let favoriteIds: string[] = [];
  let myBuyHistory: HistoryListing[] = [];
  let mySellHistory: HistoryListing[] = [];
  let myTradeHistory: TradeHistoryRow[] = [];
  let friends: FriendSummary[] = [];
  let tradesRemainingToday = 3;

  if (profile) {
    const supabase = await createClient();
    if (supabase) {
      const [aRes, mRes, cRes, fRes, buysRes, sellsRes, tradesRes, friendsRes, capRes] =
        await Promise.all([
          // Annonces actives (catalogue Acheter)
          supabase
            .from("tcg_card_listings")
            .select(
              "id,seller_id,game_id,card_id,price_os,created_at,status",
            )
            .eq("game_id", gameId)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(500),
          // Mes annonces actives (sous-onglet "Mes ventes en cours")
          supabase
            .from("tcg_card_listings")
            .select(
              "id,seller_id,game_id,card_id,price_os,created_at,status",
            )
            .eq("game_id", gameId)
            .eq("seller_id", profile.id)
            .eq("status", "active")
            .order("created_at", { ascending: false }),
          // Ma collection (pour Vendre + filtre "owned")
          supabase
            .from("tcg_cards_owned")
            .select("card_id,count")
            .eq("user_id", profile.id)
            .eq("game_id", gameId),
          // Favoris (legacy, peu utilisés mais on garde)
          supabase
            .from("tcg_card_favorites")
            .select("card_id")
            .eq("user_id", profile.id)
            .eq("game_id", gameId),
          // Historique : mes achats (listings où je suis le buyer)
          supabase.rpc("list_my_market_history", {
            p_game_id: gameId,
            p_kind: "buys",
          }),
          // Historique : mes ventes effectives (sold)
          supabase.rpc("list_my_market_history", {
            p_game_id: gameId,
            p_kind: "sells",
          }),
          // Historique : mes trades (tous statuts confondus)
          supabase.rpc("list_my_trades", {
            p_game_id: gameId,
            p_status: null,
          }),
          // Liste d'amis pour le picker d'échange
          supabase.rpc("friend_list"),
          // Cap échanges restants aujourd'hui
          supabase.rpc("tcg_trades_remaining_today", { p_game_id: gameId }),
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
      myBuyHistory = (buysRes.data ?? []) as HistoryListing[];
      mySellHistory = (sellsRes.data ?? []) as HistoryListing[];
      myTradeHistory = (tradesRes.data ?? []) as TradeHistoryRow[];
      friends = (friendsRes.data ?? []) as FriendSummary[];
      if (typeof capRes.data === "number") {
        tradesRemainingToday = Math.max(0, Math.min(3, capRes.data));
      }
    }
  }

  // Tab/sub-tab via query string pour pouvoir bookmark / share.
  const initialTab = parseTab(sp.tab);
  const initialSub = parseSub(sp.sub, initialTab);

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
      initialTab={initialTab}
      initialSub={initialSub}
      initialActive={activeListings}
      initialMine={myListings}
      myCollection={myCollection}
      favoriteIds={favoriteIds}
      myBuyHistory={myBuyHistory}
      mySellHistory={mySellHistory}
      myTradeHistory={myTradeHistory}
      friends={friends}
      tradesRemainingToday={tradesRemainingToday}
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

export type HistoryListing = {
  id: string;
  card_id: string;
  price_os: number;
  seller_id: string;
  buyer_id: string | null;
  status: string;
  created_at: string;
  sold_at: string | null;
  is_buyer: boolean;
  is_seller: boolean;
};

export type TradeHistoryRow = {
  id: string;
  sender_id: string;
  sender_username: string;
  recipient_id: string;
  recipient_username: string;
  offered_cards: { cardId: string; count: number }[];
  requested_cards: { cardId: string; count: number }[];
  message: string | null;
  status: string;
  created_at: string;
  is_sender: boolean;
};

export type FriendSummary = {
  friend_id: string;
  friend_username: string;
  friend_avatar_url: string | null;
  status: string; // 'accepted' | 'pending'
  is_outgoing: boolean;
  created_at: string;
};

export type MainTab = "buy" | "sell" | "trade";
export type SubTab =
  | "catalog"
  | "history"
  | "active-listings"
  | "new-trade"
  | "trade-history";

function parseTab(raw: string | undefined): MainTab {
  if (raw === "sell" || raw === "trade") return raw;
  return "buy";
}
function parseSub(raw: string | undefined, tab: MainTab): SubTab {
  if (tab === "buy") {
    if (raw === "history") return "history";
    return "catalog";
  }
  if (tab === "sell") {
    if (raw === "history") return "history";
    if (raw === "active-listings") return "active-listings";
    return "catalog";
  }
  // tab === "trade"
  if (raw === "trade-history") return "trade-history";
  return "new-trade";
}
