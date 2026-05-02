"use client";

import { useMemo, useState } from "react";
import type { PokemonCardData, TcgGameId } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { RARITY_COLOR } from "../../_components/card-visuals";
import type { MarketListing } from "../page";
import { CartSidebar, type CartItem } from "./cart-sidebar";
import { useMarketFilters } from "./use-market-filters";

/** Onglet Acheter : grille de toutes les annonces actives. Pour chaque
 *  carte on affiche la meilleure offre disponible. Click "Acheter" =
 *  ajoute au panier. Click "✕" = retire du panier. Click "Valider achat" =
 *  loop sur les listings et appelle buy_tcg_listing en série. */
export function BuyTab({
  profile,
  listings,
  pool,
  cardById,
  ownedMap,
  onTxSuccess,
  onError,
  onOk,
}: {
  profile: Profile;
  gameId: TcgGameId;
  listings: MarketListing[];
  pool: PokemonCardData[];
  cardById: Map<string, PokemonCardData>;
  ownedMap: Map<string, number>;
  onTxSuccess: (userIds?: string[]) => void;
  onError: (msg: string) => void;
  onOk: (msg: string) => void;
}) {
  // Pour chaque card_id : meilleure offre (la moins chère parmi les
  // listings actifs). Note : les annonces du user lui-même sont exclues.
  const bestByCard = useMemo(() => {
    const m = new Map<string, MarketListing>();
    for (const l of listings) {
      if (l.seller_id === profile.id) continue; // pas s'auto-acheter
      const existing = m.get(l.card_id);
      if (!existing || l.price_os < existing.price_os) {
        m.set(l.card_id, l);
      }
    }
    return m;
  }, [listings, profile.id]);

  // Pool filtré aux cartes actuellement en vente.
  const onSalePool = useMemo(
    () => pool.filter((c) => bestByCard.has(c.id)),
    [pool, bestByCard],
  );

  const priceFor = useMemo(
    () => (cardId: string) => bestByCard.get(cardId)?.price_os ?? null,
    [bestByCard],
  );

  const { cards, FiltersUI, visibleCount, totalCount } = useMarketFilters({
    pool: onSalePool,
    priceFor,
  });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [validating, setValidating] = useState(false);

  function addToCart(card: PokemonCardData) {
    const listing = bestByCard.get(card.id);
    if (!listing) return;
    setCart((prev) => {
      if (prev.some((it) => it.card.id === card.id)) return prev; // déjà
      return [
        ...prev,
        { card, listingId: listing.id, price: listing.price_os },
      ];
    });
  }
  function removeFromCart(cardId: string) {
    setCart((prev) => prev.filter((it) => it.card.id !== cardId));
  }
  function clearCart() {
    setCart([]);
  }
  const cartIds = useMemo(
    () => new Set(cart.map((it) => it.card.id)),
    [cart],
  );

  /** Boucle sur les listings du panier et achète chacun via la RPC
   *  buy_tcg_listing. On continue même si une ligne échoue (on collecte
   *  les erreurs et on annonce un résumé à la fin). */
  async function validateBuys() {
    if (cart.length === 0) return;
    if (validating) return;
    const supabase = createClient();
    if (!supabase) {
      onError("Connexion Supabase impossible.");
      return;
    }
    setValidating(true);
    let successes = 0;
    let totalSpent = 0;
    const sellerIds = new Set<string>();
    const failures: string[] = [];
    try {
      for (const item of cart) {
        if (!item.listingId) continue;
        const { data, error } = await supabase.rpc("buy_tcg_listing", {
          p_listing_id: item.listingId,
        });
        if (error) {
          failures.push(`${item.card.name}: ${error.message}`);
          continue;
        }
        const r = data as { ok?: boolean; error?: string; price?: number };
        if (!r?.ok) {
          failures.push(`${item.card.name}: ${r?.error ?? "achat impossible"}`);
          continue;
        }
        successes++;
        totalSpent += r.price ?? item.price;
        // Find seller from listings
        const listing = listings.find((l) => l.id === item.listingId);
        if (listing) sellerIds.add(listing.seller_id);
      }
      if (successes > 0) {
        onOk(
          `✓ ${successes} carte${successes > 1 ? "s" : ""} achetée${
            successes > 1 ? "s" : ""
          } pour ${totalSpent.toLocaleString("fr-FR")} OS.${
            failures.length > 0
              ? ` (${failures.length} échec${failures.length > 1 ? "s" : ""})`
              : ""
          }`,
        );
      } else if (failures.length > 0) {
        onError(`Aucun achat n'a réussi. ${failures[0]}`);
      }
      setCart([]);
      onTxSuccess([profile.id, ...sellerIds]);
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      <CartSidebar
        title="🛒 Panier d'achat"
        items={cart}
        onRemove={removeFromCart}
        onClear={clearCart}
        onValidate={validateBuys}
        validating={validating}
        validateLabel={`Valider l'achat (${cart.length})`}
        emptyHint="Clique 'Acheter' sur une carte pour l'ajouter ici."
        totalLabel="Total à payer"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        {FiltersUI}
        <div className="text-[11px] text-zinc-500">
          {visibleCount} carte{visibleCount > 1 ? "s" : ""} en vente sur{" "}
          {totalCount} dans le set.
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {cards.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
              Aucune carte en vente ne correspond à tes filtres.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {cards.map((card) => {
                const listing = bestByCard.get(card.id)!;
                const inCart = cartIds.has(card.id);
                const ownCount = ownedMap.get(card.id) ?? 0;
                return (
                  <BuyCardTile
                    key={card.id}
                    card={card}
                    price={listing.price_os}
                    inCart={inCart}
                    ownCount={ownCount}
                    onAdd={() => addToCart(card)}
                    onRemove={() => removeFromCart(card.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BuyCardTile({
  card,
  price,
  inCart,
  ownCount,
  onAdd,
  onRemove,
}: {
  card: PokemonCardData;
  price: number;
  inCart: boolean;
  ownCount: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`relative flex flex-col gap-1.5 rounded-xl border bg-black/40 p-2 transition-colors ${
        inCart
          ? "border-emerald-400/60 bg-emerald-400/5"
          : RARITY_COLOR[card.rarity].split(" ")[0] ?? "border-white/10"
      }`}
    >
      {ownCount > 0 && (
        <span
          className="absolute right-2 top-2 z-10 rounded-full bg-black/80 px-1.5 py-0.5 text-[9px] font-bold text-zinc-300"
          title={`Tu possèdes déjà ${ownCount} exemplaire${ownCount > 1 ? "s" : ""}`}
        >
          ×{ownCount}
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.image}
        alt={card.name}
        className="aspect-[5/7] w-full rounded object-contain"
      />
      <div className="flex items-center justify-between gap-1 px-1 text-[11px]">
        <span className="truncate font-semibold text-zinc-100">
          {card.name}
        </span>
        <span className="tabular-nums font-bold text-amber-300">
          {price.toLocaleString("fr-FR")} OS
        </span>
      </div>
      <div className="flex gap-1">
        {inCart ? (
          <button
            onClick={onRemove}
            className="flex-1 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-[11px] font-bold text-emerald-200 hover:bg-emerald-400/20"
          >
            ✓ Dans panier
          </button>
        ) : (
          <button
            onClick={onAdd}
            className="flex-1 rounded-md bg-emerald-500 px-2 py-1 text-[11px] font-bold text-emerald-950 hover:bg-emerald-400"
          >
            🛒 Acheter
          </button>
        )}
        <button
          onClick={onRemove}
          disabled={!inCart}
          title="Retirer du panier"
          className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-zinc-400 hover:bg-rose-500/20 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
