"use client";

// Marché Runeterra — Phase 3.84.
// Modélisé sur `market-client.tsx` (Pokemon) mais en LoR : filtres par
// région / rareté / type / coût / acquis-ou-non, sort par cardCode / prix /
// nom / coût, modal de mise en vente avec sélecteur de carte issu de la
// collection. Réutilise les RPC existants `buy_tcg_listing`, `cancel_tcg_listing`,
// `create_tcg_listing` et la table `tcg_card_listings`. WebSocket TCG party
// pour notifier les autres onglets après chaque transaction.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  RUNETERRA_BASE_SET,
  RUNETERRA_BASE_SET_BY_CODE,
} from "@shared/tcg-runeterra-base";
import type {
  RuneterraCardData,
  RuneterraCardType,
  RuneterraRarity,
  RuneterraRegion,
  TcgClientMessage,
} from "@shared/types";
import { TCG_GAMES, RUNETERRA_REGIONS } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { UserPill } from "@/components/user-pill";
import {
  LOR_RARITY_COLOR,
  LOR_RARITY_LABEL,
  LOR_RARITY_TIER,
  LorCardFace,
  LorCardZoomModal,
  lorRarityFx,
} from "./lor-card-visuals";
import type { MarketListing } from "../market/page";

type Tab = "buy" | "mine" | "favs";
type SortMode = "code" | "price-asc" | "price-desc" | "name" | "cost";
type TypeFilter = "all" | "unit" | "spell" | "champion";
type OwnedFilter = "all" | "owned" | "missing";

const REGION_ORDER: RuneterraRegion[] = [
  "Demacia",
  "Noxus",
  "Ionia",
  "Freljord",
  "PiltoverZaun",
  "ShadowIsles",
];

const RARITY_FILTER_ORDER: RuneterraRarity[] = [
  "Common",
  "Rare",
  "Epic",
  "Champion",
  "Holographic",
  "Prismatic",
];

export function LorMarketClient({
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
  const game = TCG_GAMES["lol"];
  const cardByCode = RUNETERRA_BASE_SET_BY_CODE;

  const [tab, setTab] = useState<Tab>("buy");
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<RuneterraRegion | null>(null);
  const [rarityFilter, setRarityFilter] = useState<RuneterraRarity | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [costFilter, setCostFilter] = useState<number | null>(null);
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("code");
  const [activeListings] = useState<MarketListing[]>(initialActive);
  const [myListings] = useState<MarketListing[]>(initialMine);
  const [favs, setFavs] = useState<Set<string>>(new Set(favoriteIds));
  const [sellOpen, setSellOpen] = useState(false);
  const [zoomCard, setZoomCard] = useState<RuneterraCardData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Map rapide cardCode → count owned, pour le filtre acquis/non.
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
    const url = `${scheme}://${partyHost}/parties/tcg/lol?${params.toString()}`;
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
      const card = cardByCode.get(r.card_id);
      if (!card) return false;
      // Type
      if (typeFilter === "unit" && card.type !== "Unit") return false;
      if (typeFilter === "spell" && card.type !== "Spell") return false;
      if (typeFilter === "champion" && card.supertype !== "Champion")
        return false;
      // Région
      if (regionFilter && !card.regions.includes(regionFilter)) return false;
      // Rareté
      if (rarityFilter && card.rarity !== rarityFilter) return false;
      // Coût (≥7 = 7+)
      if (costFilter !== null) {
        if (costFilter === 7 ? card.cost < 7 : card.cost !== costFilter)
          return false;
      }
      // Acquis / manquant
      if (ownedFilter !== "all") {
        const owned = (ownedMap.get(r.card_id) ?? 0) > 0;
        if (ownedFilter === "owned" && !owned) return false;
        if (ownedFilter === "missing" && owned) return false;
      }
      // Recherche texte (name + cardCode + subtypes)
      if (q) {
        const hay = (
          card.name +
          " " +
          card.cardCode +
          " " +
          (card.subtypes ?? []).join(" ")
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function applySort(rows: MarketListing[]): MarketListing[] {
    const arr = [...rows];
    arr.sort((a, b) => {
      const ca = cardByCode.get(a.card_id);
      const cb = cardByCode.get(b.card_id);
      switch (sortMode) {
        case "price-asc":
          return a.price_os - b.price_os;
        case "price-desc":
          return b.price_os - a.price_os;
        case "name":
          return (ca?.name ?? "").localeCompare(cb?.name ?? "");
        case "cost":
          return (ca?.cost ?? 0) - (cb?.cost ?? 0);
        case "code":
        default:
          return (ca?.cardCode ?? "").localeCompare(cb?.cardCode ?? "");
      }
    });
    return arr;
  }

  const visibleActive = useMemo(
    () => applySort(applyFilters(activeListings)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeListings,
      search,
      regionFilter,
      rarityFilter,
      typeFilter,
      costFilter,
      ownedFilter,
      sortMode,
    ],
  );
  const visibleMine = useMemo(
    () => applySort(applyFilters(myListings)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      myListings,
      search,
      regionFilter,
      rarityFilter,
      typeFilter,
      costFilter,
      ownedFilter,
      sortMode,
    ],
  );

  // Pour l'onglet Favoris : on regroupe les listings actifs par cardCode
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
  }, [
    activeListings,
    favs,
    search,
    regionFilter,
    rarityFilter,
    typeFilter,
    costFilter,
    ownedFilter,
    sortMode,
  ]);

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
        .eq("game_id", "lol")
        .eq("card_id", cardId);
    } else {
      await supabase.from("tcg_card_favorites").insert({
        user_id: profile.id,
        game_id: "lol",
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
      p_game_id: "lol",
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

  function resetFilters() {
    setSearch("");
    setRegionFilter(null);
    setRarityFilter(null);
    setTypeFilter("all");
    setCostFilter(null);
    setOwnedFilter("all");
    setSortMode("code");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/tcg/lol"
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
                Achète ou vends des cartes Runeterra contre Or Suprême.
                Échange sécurisé et atomique.
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
                  className="rounded-md bg-violet-500 px-4 py-2 text-sm font-bold text-violet-950 hover:bg-violet-400"
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

          {/* Search + filtres + sort */}
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Nom, cardCode, sous-type…"
                className="min-w-[200px] flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-violet-400/50 focus:outline-none"
              />
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-violet-400/50 focus:outline-none"
              >
                <option value="code">Tri : CardCode</option>
                <option value="cost">Tri : Coût ↑</option>
                <option value="price-asc">Tri : Prix ↑</option>
                <option value="price-desc">Tri : Prix ↓</option>
                <option value="name">Tri : Nom A→Z</option>
              </select>
              <select
                value={regionFilter ?? ""}
                onChange={(e) =>
                  setRegionFilter((e.target.value as RuneterraRegion) || null)
                }
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-violet-400/50 focus:outline-none"
              >
                <option value="">Toutes régions</option>
                {REGION_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {RUNETERRA_REGIONS[r].name}
                  </option>
                ))}
              </select>
              <select
                value={rarityFilter ?? ""}
                onChange={(e) =>
                  setRarityFilter(
                    (e.target.value as RuneterraRarity) || null,
                  )
                }
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-violet-400/50 focus:outline-none"
              >
                <option value="">Toutes raretés</option>
                {RARITY_FILTER_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {LOR_RARITY_LABEL[r]}
                  </option>
                ))}
              </select>
              {profile && (
                <select
                  value={ownedFilter}
                  onChange={(e) =>
                    setOwnedFilter(e.target.value as OwnedFilter)
                  }
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-violet-400/50 focus:outline-none"
                >
                  <option value="all">Toutes (acquis ou non)</option>
                  <option value="owned">Cartes que je possède déjà</option>
                  <option value="missing">Cartes manquantes</option>
                </select>
              )}
              <button
                onClick={resetFilters}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
                title="Réinitialiser les filtres"
              >
                ↺ Reset
              </button>
            </div>
            {/* Filtres rapides : type + coût (boutons compacts). */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-white/5 bg-black/20 px-2 py-1.5">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                Type
              </span>
              {(["all", "unit", "spell", "champion"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    typeFilter === t
                      ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/40"
                      : "text-zinc-400 hover:bg-white/5"
                  }`}
                >
                  {t === "all"
                    ? "Tous"
                    : t === "unit"
                      ? "Unités"
                      : t === "spell"
                        ? "Sorts"
                        : "★ Champions"}
                </button>
              ))}
              <div className="mx-1 h-3 w-px bg-white/10" />
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                Coût
              </span>
              <button
                onClick={() => setCostFilter(null)}
                className={`rounded px-2 py-0.5 text-[10px] ${
                  costFilter === null
                    ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/40"
                    : "text-zinc-400 hover:bg-white/5"
                }`}
              >
                Tous
              </button>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => (
                <button
                  key={c}
                  onClick={() => setCostFilter(c)}
                  className={`rounded px-2 py-0.5 text-[10px] tabular-nums ${
                    costFilter === c
                      ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40"
                      : "text-zinc-400 hover:bg-white/5"
                  }`}
                >
                  {c === 7 ? "7+" : c}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content (only this scrolls) */}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {tab === "buy" && (
              <ListingsGrid
                listings={visibleActive}
                cardByCode={cardByCode}
                favs={favs}
                onToggleFav={toggleFav}
                onBuy={buyListing}
                onZoom={setZoomCard}
                isPending={isPending}
                isSelfId={profile?.id ?? null}
                empty="Aucune annonce active. Sois le premier à vendre !"
              />
            )}
            {tab === "mine" && (
              <ListingsGrid
                listings={visibleMine}
                cardByCode={cardByCode}
                favs={favs}
                onToggleFav={toggleFav}
                onCancel={cancelListing}
                onZoom={setZoomCard}
                isPending={isPending}
                isSelfId={profile?.id ?? null}
                empty="Tu n'as aucune annonce active."
              />
            )}
            {tab === "favs" && (
              <ListingsGrid
                listings={favListings}
                cardByCode={cardByCode}
                favs={favs}
                onToggleFav={toggleFav}
                onBuy={buyListing}
                onZoom={setZoomCard}
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
            cardByCode={cardByCode}
            onCancel={() => setSellOpen(false)}
            onSubmit={createListing}
          />
        )}
        <LorCardZoomModal card={zoomCard} onClose={() => setZoomCard(null)} />
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
          ? "border-violet-400/60 bg-violet-400/10 text-violet-100"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
      }`}
    >
      {label}
    </button>
  );
}

function ListingsGrid({
  listings,
  cardByCode,
  favs,
  onToggleFav,
  onBuy,
  onCancel,
  onZoom,
  isPending,
  isSelfId,
  empty,
}: {
  listings: MarketListing[];
  cardByCode: Map<string, RuneterraCardData>;
  favs: Set<string>;
  onToggleFav: (cardId: string) => void;
  onBuy?: (listing: MarketListing) => void;
  onCancel?: (listing: MarketListing) => void;
  onZoom: (card: RuneterraCardData) => void;
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
        const card = cardByCode.get(l.card_id);
        if (!card) return null;
        const isMine = l.seller_id === isSelfId;
        const isFav = favs.has(l.card_id);
        const fxClass = lorRarityFx(card.rarity);
        return (
          <div
            key={l.id}
            className={`flex flex-col gap-2 rounded-xl border bg-black/40 p-2 ${
              LOR_RARITY_COLOR[card.rarity] ?? LOR_RARITY_COLOR["Common"]
            } ${fxClass}`}
          >
            <div className="relative">
              <button
                onClick={() => onToggleFav(l.card_id)}
                className="absolute right-1 top-1 z-10 rounded-full bg-black/60 px-1 text-sm hover:bg-black/80"
                title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                {isFav ? "⭐" : "☆"}
              </button>
              <button
                onClick={() => onZoom(card)}
                className="block w-full text-left"
                title="Zoom"
              >
                <LorCardFace card={card} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-1 px-1 text-xs">
              <span className="truncate font-semibold text-zinc-100">
                {card.name}
              </span>
              <span className="tabular-nums font-bold text-amber-300">
                {l.price_os.toLocaleString("fr-FR")} OS
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 px-1 text-[10px] text-zinc-500">
              <span className="truncate">
                {card.regions
                  .map((r) =>
                    r in RUNETERRA_REGIONS
                      ? RUNETERRA_REGIONS[r as RuneterraRegion].abbreviation
                      : r,
                  )
                  .join(" / ")}
              </span>
              <span className="tabular-nums">
                💧 {card.cost} ·{" "}
                {card.type === "Unit"
                  ? `${card.attack ?? 0}/${card.health ?? 0}`
                  : LOR_TYPE_SHORT[card.type] ?? card.type}
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

const LOR_TYPE_SHORT: Record<RuneterraCardType, string> = {
  Unit: "Unité",
  Spell: "Sort",
  Ability: "Comp.",
  Trap: "Piège",
  Landmark: "Site",
  Equipment: "Équip.",
};

function SellModal({
  myCollection,
  cardByCode,
  onCancel,
  onSubmit,
}: {
  myCollection: { card_id: string; count: number }[];
  cardByCode: Map<string, RuneterraCardData>;
  onCancel: () => void;
  onSubmit: (cardId: string, price: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [price, setPrice] = useState<number>(500);

  // Cartes vendables = celles que j'ai en collection (count > 0) ET
  // collectibles (les tokens et cartes non-collectibles ne sont pas
  // listables — RUNETERRA_BASE_SET inclut quelques tokens).
  const sellable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return RUNETERRA_BASE_SET.filter((c) => {
      if (!c.collectible) return false;
      const owned = myCollection.find((row) => row.card_id === c.cardCode);
      if (!owned || owned.count <= 0) return false;
      if (q) {
        const hay = (
          c.name +
          " " +
          c.cardCode +
          " " +
          (c.subtypes ?? []).join(" ")
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // Tri par rareté décroissante (Champion > Epic > Rare > Common) puis nom.
      const tierDiff =
        (LOR_RARITY_TIER[b.rarity] ?? 0) - (LOR_RARITY_TIER[a.rarity] ?? 0);
      if (tierDiff !== 0) return tierDiff;
      return a.name.localeCompare(b.name);
    });
  }, [myCollection, search]);

  const pickedCard = picked ? cardByCode.get(picked) : null;
  const pickedCount =
    myCollection.find((c) => c.card_id === picked)?.count ?? 0;

  // Suggestion de prix par rareté (≈ valeur effort/booster).
  const priceHint = useMemo(() => {
    if (!pickedCard) return 500;
    switch (pickedCard.rarity) {
      case "Champion":
        return 5000;
      case "Epic":
        return 1500;
      case "Rare":
        return 600;
      case "Holographic":
        return 12000;
      case "Prismatic":
        return 25000;
      default:
        return 200;
    }
  }, [pickedCard]);

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
              className="rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-400/50 focus:outline-none"
            />
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {sellable.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
                  Aucune carte disponible à vendre. Ouvre des boosters !
                </div>
              ) : (
                sellable.map((c) => {
                  const count =
                    myCollection.find((row) => row.card_id === c.cardCode)
                      ?.count ?? 0;
                  return (
                    <button
                      key={c.cardCode}
                      onClick={() => {
                        setPicked(c.cardCode);
                        // Pré-remplit le prix par rareté.
                        setPrice(
                          c.rarity === "Champion"
                            ? 5000
                            : c.rarity === "Epic"
                              ? 1500
                              : c.rarity === "Rare"
                                ? 600
                                : c.rarity === "Holographic"
                                  ? 12000
                                  : c.rarity === "Prismatic"
                                    ? 25000
                                    : 200,
                        );
                      }}
                      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/10 ${
                        LOR_RARITY_COLOR[c.rarity] ?? "border-white/10"
                      } bg-white/5`}
                    >
                      <span className="flex flex-col">
                        <span className="font-semibold">{c.name}</span>
                        <span className="text-[10px] text-zinc-500">
                          {LOR_RARITY_LABEL[c.rarity]} ·{" "}
                          {c.regions
                            .map((r) =>
                              r in RUNETERRA_REGIONS
                                ? RUNETERRA_REGIONS[r as RuneterraRegion].name
                                : r,
                            )
                            .join(" / ")}
                        </span>
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
            <div className="flex items-stretch gap-3 rounded-md border border-white/10 bg-white/5 p-3 text-sm text-zinc-200">
              <div className="w-24 shrink-0">
                {pickedCard && <LorCardFace card={pickedCard} />}
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-zinc-100">
                  {pickedCard?.name}
                </span>
                <span className="text-xs text-zinc-500">
                  {pickedCard ? LOR_RARITY_LABEL[pickedCard.rarity] : ""} ·{" "}
                  {pickedCount} en stock
                </span>
                <span className="text-xs text-zinc-400">
                  Suggestion : {priceHint.toLocaleString("fr-FR")} OS
                </span>
              </div>
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
                className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-zinc-100 focus:border-violet-400/50 focus:outline-none"
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
                className="rounded-md bg-violet-500 px-4 py-2 text-sm font-bold text-violet-950 hover:bg-violet-400"
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
