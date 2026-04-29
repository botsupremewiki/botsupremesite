"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ONEPIECE_BASE_SET,
  ONEPIECE_BASE_SET_BY_ID,
} from "@shared/tcg-onepiece-base";
import type {
  OnePieceCardData,
  OnePieceColor,
  OnePieceRarity,
  TcgClientMessage,
} from "@shared/types";
import { TCG_GAMES } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { UserPill } from "@/components/user-pill";
import {
  ONEPIECE_COLOR_GLYPH,
  ONEPIECE_COLOR_LABEL,
  ONEPIECE_RARITY_COLOR,
  ONEPIECE_RARITY_GLYPH,
  ONEPIECE_RARITY_TIER,
} from "./onepiece-card-visuals";
import type { MarketListing } from "../market/page";

type Tab = "buy" | "mine" | "favs";

export function OnePieceMarketClient({
  profile,
  initialActive,
  initialMine,
  myCollection,
  favoriteIds,
}: {
  profile: Profile | null;
  initialActive: MarketListing[];
  initialMine: MarketListing[];
  myCollection: { card_id: string; count: number }[];
  favoriteIds: string[];
}) {
  const router = useRouter();
  const game = TCG_GAMES.onepiece;
  const cardById = ONEPIECE_BASE_SET_BY_ID;

  const [tab, setTab] = useState<Tab>("buy");
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState<OnePieceRarity | null>(null);
  const [colorFilter, setColorFilter] = useState<OnePieceColor | null>(null);
  const [sortMode, setSortMode] = useState<
    "id" | "price-asc" | "price-desc" | "name"
  >("price-asc");
  const [favs, setFavs] = useState<Set<string>>(new Set(favoriteIds));
  const [sellOpen, setSellOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ownedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of myCollection) m.set(r.card_id, r.count);
    return m;
  }, [myCollection]);

  const supabase = useMemo(() => createClient(), []);

  // WebSocket vers TCG party pour notifier les autres connexions après une
  // transaction (refresh collection / gold).
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
    const url = `${scheme}://${partyHost}/parties/tcg/onepiece?${params.toString()}`;
    const ws = new WebSocket(url);
    tcgWsRef.current = ws;
    return () => {
      ws.close();
      if (tcgWsRef.current === ws) tcgWsRef.current = null;
    };
  }, [profile]);

  function notifyTx(userIds: string[]) {
    const ws = tcgWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: TcgClientMessage = {
      type: "tcg-notify-tx",
      userIds: userIds.filter((u): u is string => !!u),
    };
    ws.send(JSON.stringify(msg));
  }

  function applyFilters(rows: MarketListing[]): MarketListing[] {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const card = cardById.get(r.card_id);
      if (!card) return false;
      if (rarityFilter && card.rarity !== rarityFilter) return false;
      if (colorFilter) {
        if (card.kind === "don") return false;
        if (!("color" in card) || !card.color.includes(colorFilter)) return false;
      }
      if (q) {
        const hay = (card.name + " " + card.id).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function applySort(rows: MarketListing[]): MarketListing[] {
    const arr = [...rows];
    arr.sort((a, b) => {
      switch (sortMode) {
        case "price-asc":
          return a.price_os - b.price_os;
        case "price-desc":
          return b.price_os - a.price_os;
        case "name": {
          const an = cardById.get(a.card_id)?.name ?? "";
          const bn = cardById.get(b.card_id)?.name ?? "";
          return an.localeCompare(bn);
        }
        case "id":
          return a.card_id.localeCompare(b.card_id);
      }
    });
    return arr;
  }

  const visibleActive = useMemo(
    () => applySort(applyFilters(initialActive)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialActive, search, rarityFilter, colorFilter, sortMode],
  );
  const visibleMine = useMemo(
    () => applySort(applyFilters(initialMine)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialMine, search, rarityFilter, colorFilter, sortMode],
  );

  const favListings = useMemo(() => {
    const byCard = new Map<string, MarketListing>();
    for (const l of initialActive) {
      if (!favs.has(l.card_id)) continue;
      const existing = byCard.get(l.card_id);
      if (!existing || l.price_os < existing.price_os) {
        byCard.set(l.card_id, l);
      }
    }
    return applySort(applyFilters(Array.from(byCard.values())));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialActive, favs, search, rarityFilter, colorFilter, sortMode]);

  async function toggleFav(cardId: string) {
    if (!profile || !supabase) return;
    const isFav = favs.has(cardId);
    const next = new Set(favs);
    if (isFav) next.delete(cardId);
    else next.add(cardId);
    setFavs(next);
    if (isFav) {
      await supabase
        .from("tcg_card_favorites")
        .delete()
        .eq("user_id", profile.id)
        .eq("game_id", "onepiece")
        .eq("card_id", cardId);
    } else {
      await supabase.from("tcg_card_favorites").insert({
        user_id: profile.id,
        game_id: "onepiece",
        card_id: cardId,
      });
    }
  }

  async function buyListing(listing: MarketListing) {
    if (!profile || !supabase) return;
    setErrorMsg(null);
    setOkMsg(null);
    const { data, error } = await supabase.rpc("buy_tcg_listing", {
      p_listing_id: listing.id,
    });
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    const r = data as { ok?: boolean; error?: string; price?: number };
    if (!r?.ok) {
      setErrorMsg(r?.error ?? "Achat impossible.");
      return;
    }
    setOkMsg(
      `✓ Carte achetée pour ${(r.price ?? 0).toLocaleString("fr-FR")} OS.`,
    );
    notifyTx([profile.id, listing.seller_id]);
    startTransition(() => router.refresh());
  }

  async function cancelListing(listing: MarketListing) {
    if (!profile || !supabase) return;
    setErrorMsg(null);
    setOkMsg(null);
    const { error } = await supabase.rpc("cancel_tcg_listing", {
      p_listing_id: listing.id,
    });
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setOkMsg("✓ Annonce annulée — la carte est revenue dans ta collection.");
    notifyTx([profile.id]);
    startTransition(() => router.refresh());
  }

  async function createListing(cardId: string, price: number) {
    if (!profile || !supabase) return;
    setErrorMsg(null);
    setOkMsg(null);
    const { error } = await supabase.rpc("create_tcg_listing", {
      p_game_id: "onepiece",
      p_card_id: cardId,
      p_price_os: price,
    });
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setOkMsg("✓ Annonce créée.");
    setSellOpen(false);
    notifyTx([profile.id]);
    startTransition(() => router.refresh());
  }

  const currentRows =
    tab === "buy" ? visibleActive : tab === "mine" ? visibleMine : favListings;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/tcg/onepiece"
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
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">💱 Marché</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Achète ou vends des cartes One Piece TCG contre Or Suprême.
                Échange sécurisé.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => startTransition(() => router.refresh())}
                disabled={isPending}
                title="Rafraîchir"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
              >
                <span className={isPending ? "inline-block animate-spin" : ""}>
                  🔄
                </span>
              </button>
              {profile && (
                <button
                  onClick={() => setSellOpen(true)}
                  className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400"
                >
                  ➕ Vendre une carte
                </button>
              )}
            </div>
          </div>

          {!profile && (
            <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour acheter / vendre.
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

          {/* Tabs */}
          <div className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 pb-2">
            <TabButton
              active={tab === "buy"}
              onClick={() => setTab("buy")}
              label={`🛒 Acheter (${initialActive.length})`}
            />
            <TabButton
              active={tab === "mine"}
              onClick={() => setTab("mine")}
              label={`💰 Mes ventes (${initialMine.length})`}
            />
            <TabButton
              active={tab === "favs"}
              onClick={() => setTab("favs")}
              label={`⭐ Favoris (${favs.size})`}
            />
          </div>

          {/* Filtres */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Rechercher par nom ou id…"
              className="flex-1 min-w-[180px] rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-rose-400/50 focus:outline-none"
            />
            <select
              value={sortMode}
              onChange={(e) =>
                setSortMode(
                  e.target.value as
                    | "id"
                    | "price-asc"
                    | "price-desc"
                    | "name",
                )
              }
              className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-rose-400/50 focus:outline-none"
            >
              <option value="price-asc">Tri : Prix ↑</option>
              <option value="price-desc">Tri : Prix ↓</option>
              <option value="name">Tri : Nom A→Z</option>
              <option value="id">Tri : ID</option>
            </select>
            <select
              value={rarityFilter ?? ""}
              onChange={(e) =>
                setRarityFilter((e.target.value as OnePieceRarity) || null)
              }
              className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-rose-400/50 focus:outline-none"
            >
              <option value="">Rareté : toutes</option>
              <option value="c">C</option>
              <option value="uc">UC</option>
              <option value="r">R</option>
              <option value="sr">SR</option>
              <option value="sec">SEC</option>
              <option value="l">L</option>
              <option value="sp">SP</option>
              <option value="tr">TR</option>
              <option value="p">P</option>
            </select>
            <select
              value={colorFilter ?? ""}
              onChange={(e) =>
                setColorFilter((e.target.value as OnePieceColor) || null)
              }
              className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-rose-400/50 focus:outline-none"
            >
              <option value="">Couleur : toutes</option>
              {(["rouge", "vert", "bleu", "violet", "noir", "jaune"] as OnePieceColor[]).map(
                (c) => (
                  <option key={c} value={c}>
                    {ONEPIECE_COLOR_GLYPH[c]} {ONEPIECE_COLOR_LABEL[c]}
                  </option>
                ),
              )}
            </select>
          </div>

          {/* Listings */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {currentRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
                {tab === "mine"
                  ? "Tu n'as aucune annonce active."
                  : tab === "favs"
                    ? "Aucun favori — clique ⭐ sur une carte pour l'ajouter."
                    : "Aucune annonce ne correspond aux filtres."}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {currentRows.map((l) => {
                  const card = cardById.get(l.card_id);
                  if (!card) return null;
                  const isMine = profile && l.seller_id === profile.id;
                  const owned = ownedMap.get(l.card_id) ?? 0;
                  const isFav = favs.has(l.card_id);
                  return (
                    <ListingCard
                      key={l.id}
                      card={card}
                      listing={l}
                      isMine={!!isMine}
                      owned={owned}
                      isFav={isFav}
                      onToggleFav={() => toggleFav(l.card_id)}
                      onBuy={() => buyListing(l)}
                      onCancel={() => cancelListing(l)}
                      hasProfile={!!profile}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {sellOpen && profile && (
          <SellPanel
            myCollection={myCollection}
            myActiveListingsCount={initialMine.length}
            onClose={() => setSellOpen(false)}
            onConfirm={createListing}
          />
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs ${
        active
          ? "border border-rose-400/60 bg-rose-400/10 text-rose-100"
          : "border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
      }`}
    >
      {label}
    </button>
  );
}

function ListingCard({
  card,
  listing,
  isMine,
  owned,
  isFav,
  onToggleFav,
  onBuy,
  onCancel,
  hasProfile,
}: {
  card: OnePieceCardData;
  listing: MarketListing;
  isMine: boolean;
  owned: number;
  isFav: boolean;
  onToggleFav: () => void;
  onBuy: () => void;
  onCancel: () => void;
  hasProfile: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col gap-1 rounded-md border bg-black/40 p-2 ${ONEPIECE_RARITY_COLOR[card.rarity]}`}
    >
      <button
        onClick={onToggleFav}
        title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
        className="absolute right-1 top-1 z-10 rounded-full bg-black/60 px-1 text-xs"
      >
        {isFav ? "⭐" : "☆"}
      </button>
      <div className="aspect-[5/7] overflow-hidden rounded">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.image}
          alt={card.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
      <div className="text-center">
        <div className="truncate text-[11px] text-zinc-100">{card.name}</div>
        <div className="text-[10px] text-zinc-500">
          {ONEPIECE_RARITY_GLYPH[card.rarity]} · {card.id}
        </div>
        <div className="mt-1 text-sm font-bold tabular-nums text-amber-300">
          {listing.price_os.toLocaleString("fr-FR")} OS
        </div>
      </div>
      {isMine ? (
        <button
          onClick={onCancel}
          className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-500/20"
        >
          Annuler ma vente
        </button>
      ) : (
        <button
          onClick={onBuy}
          disabled={!hasProfile}
          className="rounded bg-emerald-500 px-2 py-1 text-[10px] font-bold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {hasProfile ? `🛒 Acheter (×${owned} possédées)` : "Connecte-toi"}
        </button>
      )}
    </div>
  );
}

function SellPanel({
  myCollection,
  myActiveListingsCount,
  onClose,
  onConfirm,
}: {
  myCollection: { card_id: string; count: number }[];
  myActiveListingsCount: number;
  onClose: () => void;
  onConfirm: (cardId: string, price: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [price, setPrice] = useState<string>("100");
  const [search, setSearch] = useState("");

  // Cartes vendables : possédées strictement.
  const sellable = useMemo(() => {
    const items: { card: OnePieceCardData; count: number }[] = [];
    for (const r of myCollection) {
      const c = ONEPIECE_BASE_SET_BY_ID.get(r.card_id);
      if (c && r.count > 0) items.push({ card: c, count: r.count });
    }
    items.sort((a, b) => {
      const ra = ONEPIECE_RARITY_TIER[a.card.rarity] ?? 0;
      const rb = ONEPIECE_RARITY_TIER[b.card.rarity] ?? 0;
      if (ra !== rb) return rb - ra;
      return a.card.name.localeCompare(b.card.name);
    });
    return items;
  }, [myCollection]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sellable;
    return sellable.filter((s) =>
      (s.card.name + " " + s.card.id).toLowerCase().includes(q),
    );
  }, [sellable, search]);

  // Garde-fou anti-spam.
  void ONEPIECE_BASE_SET;

  const priceNum = Math.max(0, parseInt(price, 10) || 0);
  const canConfirm =
    selectedId !== null && priceNum >= 10 && priceNum <= 100_000_000;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">
              ➕ Vendre une carte
            </h2>
            <p className="text-xs text-zinc-400">
              Tu as {myActiveListingsCount} annonce(s) active(s).
              Sélectionne une carte de ta collection puis fixe un prix (10 à
              100 000 000 OS).
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/5 p-2 text-zinc-300 hover:bg-white/10"
          >
            ✕
          </button>
        </header>

        <div className="border-b border-white/10 p-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Rechercher une carte de ta collection…"
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-rose-400/50 focus:outline-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              {sellable.length === 0
                ? "Aucune carte dans ta collection."
                : "Aucune carte ne matche."}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {filtered.map(({ card, count }) => (
                <button
                  key={card.id}
                  onClick={() => setSelectedId(card.id)}
                  className={`relative aspect-[5/7] overflow-hidden rounded border bg-black/40 transition-transform ${
                    selectedId === card.id
                      ? "ring-2 ring-rose-400"
                      : ONEPIECE_RARITY_COLOR[card.rarity]
                  } hover:scale-[1.04]`}
                  title={`${card.name} (×${count})`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.image}
                    alt={card.name}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                  <span className="absolute right-1 top-1 rounded-full bg-amber-400 px-1 text-[9px] font-bold text-amber-950">
                    ×{count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-white/10 px-5 py-3">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            min={10}
            placeholder="Prix en OS"
            className="w-40 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-rose-400/50 focus:outline-none"
          />
          <span className="text-xs text-zinc-400">
            {selectedId ? (
              <>Carte : <span className="text-zinc-200">{ONEPIECE_BASE_SET_BY_ID.get(selectedId)?.name}</span></>
            ) : (
              "Sélectionne une carte d'abord"
            )}
          </span>
          <button
            onClick={() => selectedId && onConfirm(selectedId, priceNum)}
            disabled={!canConfirm}
            className="ml-auto rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Mettre en vente
          </button>
        </footer>
      </div>
    </div>
  );
}
