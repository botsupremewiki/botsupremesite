"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  POKEMON_BASE_SET,
  POKEMON_BASE_SET_BY_ID,
} from "@shared/tcg-pokemon-base";
import type {
  PokemonCardData,
  PokemonEnergyType,
  TcgClientMessage,
  TcgGameId,
  TcgRarity,
} from "@shared/types";
import { TCG_GAMES } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { UserPill } from "@/components/user-pill";
import { CardFace } from "../_components/card-visuals";
import type { MarketListing } from "./page";

type Tab = "buy" | "mine" | "favs";

const RARITY_COLOR: Record<TcgRarity, string> = {
  common: "border-zinc-500/40",
  energy: "border-zinc-500/40",
  uncommon: "border-emerald-400/50",
  rare: "border-sky-400/60",
  "holo-rare": "border-amber-300/70",
};

export function MarketClient({
  profile,
  gameId,
  initialActive,
  initialMine,
  myCollection,
  favoriteIds,
}: {
  profile: Profile | null;
  gameId: TcgGameId;
  initialActive: MarketListing[];
  initialMine: MarketListing[];
  myCollection: { card_id: string; count: number }[];
  favoriteIds: string[];
}) {
  const router = useRouter();
  const game = TCG_GAMES[gameId];
  const cardById = POKEMON_BASE_SET_BY_ID;

  const [tab, setTab] = useState<Tab>("buy");
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState<TcgRarity | null>(null);
  const [typeFilter, setTypeFilter] = useState<PokemonEnergyType | null>(null);
  const [ownedFilter, setOwnedFilter] = useState<"all" | "owned" | "missing">(
    "all",
  );
  const [sortMode, setSortMode] = useState<
    "number" | "price-asc" | "price-desc" | "name"
  >("number");
  const [activeListings] = useState<MarketListing[]>(initialActive);
  const [myListings] = useState<MarketListing[]>(initialMine);
  const [favs, setFavs] = useState<Set<string>>(new Set(favoriteIds));
  const [sellOpen, setSellOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Map rapide cardId → count owned, pour le filtre acquis/non.
  const ownedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of myCollection) m.set(r.card_id, r.count);
    return m;
  }, [myCollection]);

  const supabase = useMemo(() => createClient(), []);

  // WebSocket persistant vers la TCG party : permet de notifier les autres
  // onglets/joueurs (buyer + seller) après chaque transaction pour qu'ils
  // refresh leur collection / gold en live.
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

  function applyFilters(rows: MarketListing[]): MarketListing[] {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const card = cardById.get(r.card_id);
      if (!card) return false;
      if (rarityFilter && card.rarity !== rarityFilter) return false;
      if (typeFilter) {
        const cType = card.kind === "energy" ? card.energyType : card.type;
        if (cType !== typeFilter) return false;
      }
      if (ownedFilter !== "all") {
        const owned = (ownedMap.get(r.card_id) ?? 0) > 0;
        if (ownedFilter === "owned" && !owned) return false;
        if (ownedFilter === "missing" && owned) return false;
      }
      if (q && !card.name.toLowerCase().includes(q)) return false;
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
        case "number": {
          const an = cardById.get(a.card_id)?.number ?? 0;
          const bn = cardById.get(b.card_id)?.number ?? 0;
          return an - bn;
        }
      }
    });
    return arr;
  }

  const visibleActive = useMemo(
    () => applySort(applyFilters(activeListings)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeListings, search, rarityFilter, typeFilter, ownedFilter, sortMode],
  );
  const visibleMine = useMemo(
    () => applySort(applyFilters(myListings)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myListings, search, rarityFilter, typeFilter, ownedFilter, sortMode],
  );

  // Pour l'onglet Favoris : on regroupe les listings actifs par card_id
  // pour ne montrer que les cartes en favoris, avec la meilleure offre.
  const favListings = useMemo(() => {
    const byCard = new Map<string, MarketListing>();
    for (const l of activeListings) {
      if (!favs.has(l.card_id)) continue;
      const existing = byCard.get(l.card_id);
      if (!existing || l.price_os < existing.price_os) {
        byCard.set(l.card_id, l);
      }
    }
    const list = Array.from(byCard.values());
    return applySort(applyFilters(list));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeListings, favs, search, rarityFilter, typeFilter, ownedFilter, sortMode]);

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
        .eq("game_id", gameId)
        .eq("card_id", cardId);
    } else {
      await supabase
        .from("tcg_card_favorites")
        .insert({
          user_id: profile.id,
          game_id: gameId,
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
      p_game_id: gameId,
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
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">
                💱 Marché
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Achète ou vends des cartes contre Or Suprême. Échange
                sécurisé et atomique.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => startTransition(() => router.refresh())}
                disabled={isPending}
                title="Rafraîchir les annonces"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
              >
                <span
                  className={`inline-block ${isPending ? "animate-spin" : ""}`}
                >
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
              label={`🛒 Acheter (${activeListings.length})`}
            />
            <TabButton
              active={tab === "mine"}
              onClick={() => setTab("mine")}
              label={`💰 Mes ventes (${myListings.length})`}
            />
            <TabButton
              active={tab === "favs"}
              onClick={() => setTab("favs")}
              label={`⭐ Favoris (${favs.size})`}
            />
          </div>

          {/* Search + filters + sort */}
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Rechercher par nom…"
                className="flex-1 min-w-[200px] rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400/50 focus:outline-none"
              />
              <select
                value={sortMode}
                onChange={(e) =>
                  setSortMode(
                    e.target.value as
                      | "number"
                      | "price-asc"
                      | "price-desc"
                      | "name",
                  )
                }
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-400/50 focus:outline-none"
              >
                <option value="number">Tri : N° Pokédex</option>
                <option value="price-asc">Tri : Prix croissant</option>
                <option value="price-desc">Tri : Prix décroissant</option>
                <option value="name">Tri : Nom A→Z</option>
              </select>
              <select
                value={rarityFilter ?? ""}
                onChange={(e) =>
                  setRarityFilter((e.target.value as TcgRarity) || null)
                }
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-400/50 focus:outline-none"
              >
                <option value="">Toutes raretés</option>
                <option value="holo-rare">Holo</option>
                <option value="rare">Rare</option>
                <option value="uncommon">Peu commune</option>
                <option value="common">Commune</option>
                <option value="energy">Énergie</option>
              </select>
              <select
                value={typeFilter ?? ""}
                onChange={(e) =>
                  setTypeFilter(
                    (e.target.value as PokemonEnergyType) || null,
                  )
                }
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-400/50 focus:outline-none"
              >
                <option value="">Tous types</option>
                <option value="fire">🔥 Feu</option>
                <option value="water">💧 Eau</option>
                <option value="grass">🍃 Plante</option>
                <option value="lightning">⚡ Élec</option>
                <option value="psychic">🌀 Psy</option>
                <option value="fighting">👊 Combat</option>
                <option value="colorless">⭐ Normal</option>
              </select>
              {profile && (
                <select
                  value={ownedFilter}
                  onChange={(e) =>
                    setOwnedFilter(
                      e.target.value as "all" | "owned" | "missing",
                    )
                  }
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-400/50 focus:outline-none"
                >
                  <option value="all">Toutes (acquis ou non)</option>
                  <option value="owned">Cartes que je possède déjà</option>
                  <option value="missing">Cartes manquantes</option>
                </select>
              )}
            </div>
          </div>

          {/* Tab content (only this scrolls) */}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {tab === "buy" && (
              <ListingsGrid
                listings={visibleActive}
                cardById={cardById}
                favs={favs}
                onToggleFav={toggleFav}
                onBuy={buyListing}
                isPending={isPending}
                isSelfId={profile?.id ?? null}
                empty="Aucune annonce active. Sois le premier à vendre !"
              />
            )}
            {tab === "mine" && (
              <ListingsGrid
                listings={visibleMine}
                cardById={cardById}
                favs={favs}
                onToggleFav={toggleFav}
                onCancel={cancelListing}
                isPending={isPending}
                isSelfId={profile?.id ?? null}
                empty="Tu n'as aucune annonce active."
              />
            )}
            {tab === "favs" && (
              <ListingsGrid
                listings={favListings}
                cardById={cardById}
                favs={favs}
                onToggleFav={toggleFav}
                onBuy={buyListing}
                isPending={isPending}
                isSelfId={profile?.id ?? null}
                empty="Aucun favori (clique l'étoile sur une carte pour l'ajouter), ou aucune annonce active sur tes favoris."
              />
            )}
          </div>
        </div>

        {sellOpen && profile && (
          <SellModal
            myCollection={myCollection}
            cardById={cardById}
            onCancel={() => setSellOpen(false)}
            onSubmit={createListing}
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
      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
      }`}
    >
      {label}
    </button>
  );
}

function ListingsGrid({
  listings,
  cardById,
  favs,
  onToggleFav,
  onBuy,
  onCancel,
  isPending,
  isSelfId,
  empty,
}: {
  listings: MarketListing[];
  cardById: Map<string, PokemonCardData>;
  favs: Set<string>;
  onToggleFav: (cardId: string) => void;
  onBuy?: (listing: MarketListing) => void;
  onCancel?: (listing: MarketListing) => void;
  isPending: boolean;
  isSelfId: string | null;
  empty: string;
}) {
  if (listings.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
        {empty}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {listings.map((l) => {
        const card = cardById.get(l.card_id);
        if (!card) return null;
        const isMine = l.seller_id === isSelfId;
        const isFav = favs.has(l.card_id);
        return (
          <div
            key={l.id}
            className={`flex flex-col gap-2 rounded-xl border bg-black/40 p-2 ${
              RARITY_COLOR[card.rarity] ?? RARITY_COLOR.common
            }`}
          >
            <div className="relative">
              <button
                onClick={() => onToggleFav(l.card_id)}
                className="absolute right-1 top-1 z-10 rounded-full bg-black/60 px-1 text-sm hover:bg-black/80"
                title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                {isFav ? "⭐" : "☆"}
              </button>
              <CardFace card={card} />
            </div>
            <div className="flex items-center justify-between gap-1 px-1 text-xs">
              <span className="truncate font-semibold text-zinc-100">
                {card.name}
              </span>
              <span className="tabular-nums font-bold text-amber-300">
                {l.price_os.toLocaleString("fr-FR")} OS
              </span>
            </div>
            {onBuy && !isMine && (
              <button
                onClick={() => onBuy(l)}
                disabled={isPending}
                className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                Acheter
              </button>
            )}
            {onBuy && isMine && (
              <div className="rounded-md bg-white/5 px-2 py-1 text-center text-[10px] text-zinc-400">
                ta vente
              </div>
            )}
            {onCancel && (
              <button
                onClick={() => onCancel(l)}
                disabled={isPending}
                className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
              >
                Annuler
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SellModal({
  myCollection,
  cardById,
  onCancel,
  onSubmit,
}: {
  myCollection: { card_id: string; count: number }[];
  cardById: Map<string, PokemonCardData>;
  onCancel: () => void;
  onSubmit: (cardId: string, price: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [price, setPrice] = useState<number>(500);

  const sellable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...POKEMON_BASE_SET]
      .filter((c) => {
        const owned = myCollection.find((row) => row.card_id === c.id);
        if (!owned || owned.count <= 0) return false;
        if (q && !c.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [myCollection, search]);

  const pickedCard = picked ? cardById.get(picked) : null;
  const pickedCount =
    myCollection.find((c) => c.card_id === picked)?.count ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">
            ➕ Vendre une carte
          </h2>
          <button
            onClick={onCancel}
            className="text-zinc-400 hover:text-zinc-100"
          >
            ✕
          </button>
        </div>

        {!picked ? (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Rechercher dans ma collection…"
              className="rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400/50 focus:outline-none"
            />
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {sellable.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
                  Aucune carte disponible à vendre. Ouvre des boosters !
                </div>
              ) : (
                sellable.map((c) => {
                  const count =
                    myCollection.find((row) => row.card_id === c.id)?.count ??
                    0;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setPicked(c.id)}
                      className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/10"
                    >
                      <span className="font-semibold">
                        {c.art} {c.name}
                      </span>
                      <span className="text-xs text-zinc-500">×{count}</span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-zinc-200">
              <span className="font-semibold">
                {pickedCard?.art} {pickedCard?.name}
              </span>{" "}
              <span className="text-xs text-zinc-500">
                · {pickedCount} en stock
              </span>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs uppercase tracking-widest text-zinc-400">
                Prix (Or Suprême — min 100)
              </span>
              <input
                type="number"
                min={100}
                step={100}
                value={price}
                onChange={(e) =>
                  setPrice(Math.max(100, Number(e.target.value) || 0))
                }
                className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-zinc-100 focus:border-amber-400/50 focus:outline-none"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPicked(null)}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10"
              >
                ← Choisir une autre
              </button>
              <button
                onClick={() => onSubmit(picked, price)}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400"
              >
                Mettre en vente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
