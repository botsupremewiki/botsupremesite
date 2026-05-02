"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  POKEMON_BASE_SET,
  POKEMON_BASE_SET_BY_ID,
} from "@shared/tcg-pokemon-base";
import type {
  TcgClientMessage,
  TcgGameId,
} from "@shared/types";
import { TCG_GAMES } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import type {
  FriendSummary,
  HistoryListing,
  MainTab,
  MarketListing,
  SubTab,
  TradeHistoryRow,
} from "./page";
import { BuyTab } from "./_components/buy-tab";
import { SellTab } from "./_components/sell-tab";
import { TradeTab } from "./_components/trade-tab";
import { HistoryView } from "./_components/history-view";
import { TradeHistoryView } from "./_components/trade-history-view";

export function MarketClient({
  profile,
  gameId,
  initialTab,
  initialSub,
  initialActive,
  initialMine,
  myCollection,
  myBuyHistory,
  mySellHistory,
  myTradeHistory,
  friends,
  tradesRemainingToday,
}: {
  profile: Profile | null;
  gameId: TcgGameId;
  initialTab: MainTab;
  initialSub: SubTab;
  initialActive: MarketListing[];
  initialMine: MarketListing[];
  myCollection: { card_id: string; count: number }[];
  favoriteIds: string[];
  myBuyHistory: HistoryListing[];
  mySellHistory: HistoryListing[];
  myTradeHistory: TradeHistoryRow[];
  friends: FriendSummary[];
  tradesRemainingToday: number;
}) {
  const router = useRouter();
  const game = TCG_GAMES[gameId];
  const cardById = POKEMON_BASE_SET_BY_ID;
  const pool = POKEMON_BASE_SET;

  const [tab, setTab] = useState<MainTab>(initialTab);
  const [sub, setSub] = useState<SubTab>(initialSub);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Map rapide cardId → count owned, partagée par les onglets buy/sell.
  const ownedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of myCollection) m.set(r.card_id, r.count);
    return m;
  }, [myCollection]);

  // WebSocket persistant vers la TCG party : permet de notifier les
  // autres tabs/joueurs (buyer + seller) après chaque transaction pour
  // qu'ils refresh leur collection / gold.
  const tcgWsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (!profile) return;
    const partyHost =
      process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999";
    const scheme =
      partyHost.startsWith("localhost") ||
      partyHost.startsWith("127.") ||
      partyHost.startsWith("192.168.")
        ? "ws"
        : "wss";
    const params = new URLSearchParams();
    params.set("authId", profile.id);
    params.set("name", profile.username);
    params.set("gold", String(profile.gold));
    const url = `${scheme}://${partyHost}/parties/tcg/${gameId}?${params.toString()}`;
    const ws = new WebSocket(url);
    tcgWsRef.current = ws;
    return () => {
      ws.close();
      if (tcgWsRef.current === ws) tcgWsRef.current = null;
    };
  }, [profile, gameId]);

  function notifyTx(userIds: string[]) {
    const ws = tcgWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: TcgClientMessage = {
      type: "tcg-notify-tx",
      userIds: userIds.filter((u): u is string => !!u),
    };
    ws.send(JSON.stringify(msg));
  }

  function setMainTab(next: MainTab) {
    setTab(next);
    // Reset sub-tab to default for the new main tab.
    if (next === "buy") setSub("catalog");
    else if (next === "sell") setSub("catalog");
    else setSub("new-trade");
    setErrorMsg(null);
    setOkMsg(null);
    // Update URL pour permettre bookmark sans re-render serveur lourd.
    const params = new URLSearchParams();
    params.set("tab", next);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`,
      );
    }
  }

  function setSubTab(next: SubTab) {
    setSub(next);
    setErrorMsg(null);
    setOkMsg(null);
    const params = new URLSearchParams();
    params.set("tab", tab);
    params.set("sub", next);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`,
      );
    }
  }

  function flashOk(msg: string) {
    setOkMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setOkMsg((m) => (m === msg ? null : m)), 4000);
  }
  function flashErr(msg: string) {
    setErrorMsg(msg);
    setOkMsg(null);
  }

  function refreshAfterTx(userIds: string[] = []) {
    if (profile) notifyTx([profile.id, ...userIds]);
    startTransition(() => router.refresh());
  }

  // Sub-tab options dépendent du main tab actif.
  const subOptions = useMemo<{ id: SubTab; label: string }[]>(() => {
    if (tab === "buy") {
      return [
        { id: "catalog", label: "📋 Catalogue" },
        { id: "history", label: "🧾 Mes achats" },
      ];
    }
    if (tab === "sell") {
      return [
        { id: "catalog", label: "🃏 Mes cartes" },
        { id: "active-listings", label: "🪧 En vente" },
        { id: "history", label: "🧾 Vendues" },
      ];
    }
    return [
      { id: "new-trade", label: "🤝 Nouvel échange" },
      { id: "trade-history", label: "🧾 Mes échanges" },
    ];
  }, [tab]);

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
          <span className="text-xs text-zinc-500">💱 Marché</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main
        className={`flex flex-1 flex-col overflow-hidden p-6 ${game.gradient}`}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 overflow-hidden">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">💱 Marché</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Achète, vends et échange des cartes avec les autres joueurs.
            </p>
          </div>

          {!profile && (
            <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour acheter / vendre / échanger.
            </div>
          )}

          {(errorMsg || okMsg) && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                errorMsg
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
              }`}
            >
              {errorMsg ?? okMsg}
            </div>
          )}

          {/* ─── Main tabs ──────────────────────────────────────────── */}
          <div className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 pb-2">
            <MainTabButton
              active={tab === "buy"}
              onClick={() => setMainTab("buy")}
              label="🛒 Acheter"
              count={initialActive.length}
            />
            <MainTabButton
              active={tab === "sell"}
              onClick={() => setMainTab("sell")}
              label="💰 Vendre"
              count={initialMine.length}
            />
            <MainTabButton
              active={tab === "trade"}
              onClick={() => setMainTab("trade")}
              label="🤝 Échange"
              count={tradesRemainingToday}
              countLabel="restants"
            />
          </div>

          {/* ─── Sub tabs ───────────────────────────────────────────── */}
          {profile && (
            <div className="flex shrink-0 flex-wrap gap-1.5">
              {subOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSubTab(opt.id)}
                  className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                    sub === opt.id
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* ─── Tab content ────────────────────────────────────────── */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {tab === "buy" && profile && (
              <>
                {sub === "catalog" && (
                  <BuyTab
                    profile={profile}
                    gameId={gameId}
                    listings={initialActive}
                    pool={pool}
                    cardById={cardById}
                    ownedMap={ownedMap}
                    onTxSuccess={refreshAfterTx}
                    onError={flashErr}
                    onOk={flashOk}
                  />
                )}
                {sub === "history" && (
                  <HistoryView
                    rows={myBuyHistory}
                    cardById={cardById}
                    kind="buy"
                  />
                )}
              </>
            )}

            {tab === "sell" && profile && (
              <>
                {sub === "catalog" && (
                  <SellTab
                    profile={profile}
                    gameId={gameId}
                    pool={pool}
                    cardById={cardById}
                    ownedMap={ownedMap}
                    activeListings={initialMine}
                    onTxSuccess={refreshAfterTx}
                    onError={flashErr}
                    onOk={flashOk}
                  />
                )}
                {sub === "active-listings" && (
                  <ActiveListingsView
                    listings={initialMine}
                    cardById={cardById}
                    onCancel={async (listingId, sellerId) => {
                      const { createClient } = await import(
                        "@/lib/supabase/client"
                      );
                      const supabase = createClient();
                      if (!supabase) return;
                      const { error } = await supabase.rpc(
                        "cancel_tcg_listing",
                        { p_listing_id: listingId },
                      );
                      if (error) {
                        flashErr(error.message);
                        return;
                      }
                      flashOk(
                        "✓ Annonce annulée — la carte est revenue dans ta collection.",
                      );
                      refreshAfterTx([sellerId]);
                    }}
                  />
                )}
                {sub === "history" && (
                  <HistoryView
                    rows={mySellHistory}
                    cardById={cardById}
                    kind="sell"
                  />
                )}
              </>
            )}

            {tab === "trade" && profile && (
              <>
                {sub === "new-trade" && (
                  <TradeTab
                    profile={profile}
                    gameId={gameId}
                    pool={pool}
                    cardById={cardById}
                    ownedMap={ownedMap}
                    friends={friends}
                    tradesRemainingToday={tradesRemainingToday}
                    onError={flashErr}
                    onCompleted={() => {
                      flashOk("✓ Échange effectué !");
                      refreshAfterTx();
                    }}
                  />
                )}
                {sub === "trade-history" && (
                  <TradeHistoryView
                    rows={myTradeHistory}
                    cardById={cardById}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function MainTabButton({
  active,
  onClick,
  label,
  count,
  countLabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  countLabel?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span className="ml-1 text-xs font-normal text-zinc-400">
          ({count}
          {countLabel ? ` ${countLabel}` : ""})
        </span>
      )}
    </button>
  );
}

// ─── Vue "Mes ventes en cours" — listings actifs avec bouton Annuler ──────
function ActiveListingsView({
  listings,
  cardById,
  onCancel,
}: {
  listings: MarketListing[];
  cardById: typeof POKEMON_BASE_SET_BY_ID;
  onCancel: (listingId: string, sellerId: string) => void;
}) {
  if (listings.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
        Tu n&apos;as aucune annonce active.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {listings.map((l) => {
        const card = cardById.get(l.card_id);
        if (!card) return null;
        return (
          <div
            key={l.id}
            className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/40 p-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.image}
              alt={card.name}
              className="aspect-[5/7] w-full rounded object-contain"
            />
            <div className="flex items-center justify-between gap-1 px-1 text-xs">
              <span className="truncate font-semibold text-zinc-100">
                {card.name}
              </span>
              <span className="tabular-nums font-bold text-amber-300">
                {l.price_os.toLocaleString("fr-FR")} OS
              </span>
            </div>
            <button
              onClick={() => onCancel(l.id, l.seller_id)}
              className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
            >
              Annuler
            </button>
          </div>
        );
      })}
    </div>
  );
}
