"use client";

import { useMemo, useState } from "react";
import type { PokemonCardData, TcgGameId } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { RARITY_COLOR } from "../../_components/card-visuals";
import type { MarketListing } from "../page";
import { CartSidebar, type CartItem } from "./cart-sidebar";
import { useMarketFilters } from "./use-market-filters";

const DEFAULT_PRICE = 500;

/** Onglet Vendre : grille des cartes possédées en ≥2 exemplaires (on
 *  garde 1 en collection). Click "Vendre" = ajoute au panier avec un
 *  prix par défaut, modifiable dans le panier. Validation = boucle sur
 *  create_tcg_listing. */
export function SellTab({
  profile,
  gameId,
  pool,
  cardById,
  ownedMap,
  activeListings,
  onTxSuccess,
  onError,
  onOk,
}: {
  profile: Profile;
  gameId: TcgGameId;
  pool: PokemonCardData[];
  cardById: Map<string, PokemonCardData>;
  ownedMap: Map<string, number>;
  activeListings: MarketListing[];
  onTxSuccess: (userIds?: string[]) => void;
  onError: (msg: string) => void;
  onOk: (msg: string) => void;
}) {
  // Combien de copies sont déjà listées par moi (pour ne pas autoriser à
  // mettre en vente plus que ce qu'on a en stock disponible).
  const listedByCard = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of activeListings) {
      m.set(l.card_id, (m.get(l.card_id) ?? 0) + 1);
    }
    return m;
  }, [activeListings]);

  // Pool : seulement les cartes dont je possède au moins 2 exemplaires
  // (et on tient compte de celles déjà listées pour calculer le dispo).
  const sellablePool = useMemo(() => {
    return pool.filter((c) => {
      const owned = ownedMap.get(c.id) ?? 0;
      const listed = listedByCard.get(c.id) ?? 0;
      // Doit avoir au moins 2 exemplaires en collection ET au moins 1 dispo
      // (= owned - listed) pour pouvoir lister une nouvelle copie.
      return owned >= 2 && owned - listed >= 1;
    });
  }, [pool, ownedMap, listedByCard]);

  const { cards, FiltersUI, visibleCount } = useMarketFilters({
    pool: sellablePool,
  });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [validating, setValidating] = useState(false);

  function addToCart(card: PokemonCardData) {
    setCart((prev) => {
      if (prev.some((it) => it.card.id === card.id)) return prev;
      return [...prev, { card, listingId: null, price: DEFAULT_PRICE }];
    });
  }
  function removeFromCart(cardId: string) {
    setCart((prev) => prev.filter((it) => it.card.id !== cardId));
  }
  function clearCart() {
    setCart([]);
  }
  function changePrice(cardId: string, price: number) {
    setCart((prev) =>
      prev.map((it) =>
        it.card.id === cardId ? { ...it, price: Math.max(100, price) } : it,
      ),
    );
  }
  const cartIds = useMemo(
    () => new Set(cart.map((it) => it.card.id)),
    [cart],
  );

  /** Boucle sur le panier et appelle create_tcg_listing pour chaque
   *  carte. On collecte les erreurs et on annonce un résumé final. */
  async function validateSells() {
    if (cart.length === 0) return;
    if (validating) return;
    const supabase = createClient();
    if (!supabase) {
      onError("Connexion Supabase impossible.");
      return;
    }
    // game_id est dérivé du gameId prop (passé au useMarketFilters parent)
    // — mais on ne l'a pas direct ici. On le récupère via le profile context
    // ? Non, on a besoin du gameId. Je vais le faire passer par le wrapper.
    setValidating(true);
    let successes = 0;
    const failures: string[] = [];
    try {
      for (const item of cart) {
        const { error } = await supabase.rpc("create_tcg_listing", {
          p_game_id: gameId,
          p_card_id: item.card.id,
          p_price_os: item.price,
        });
        if (error) {
          failures.push(`${item.card.name}: ${error.message}`);
          continue;
        }
        successes++;
      }
      if (successes > 0) {
        onOk(
          `✓ ${successes} carte${successes > 1 ? "s" : ""} mise${
            successes > 1 ? "s" : ""
          } en vente.${
            failures.length > 0
              ? ` (${failures.length} échec${failures.length > 1 ? "s" : ""})`
              : ""
          }`,
        );
      } else if (failures.length > 0) {
        onError(`Aucune mise en vente n'a réussi. ${failures[0]}`);
      }
      setCart([]);
      onTxSuccess([profile.id]);
    } finally {
      setValidating(false);
    }
  }

  return (
    <SellTabInner
      profile={profile}
      cards={cards}
      visibleCount={visibleCount}
      ownedMap={ownedMap}
      listedByCard={listedByCard}
      cart={cart}
      cartIds={cartIds}
      validating={validating}
      FiltersUI={FiltersUI}
      addToCart={addToCart}
      removeFromCart={removeFromCart}
      clearCart={clearCart}
      changePrice={changePrice}
      validateSells={validateSells}
      cardById={cardById}
    />
  );
}

// Inner component – pas strictement nécessaire mais permet de garder le
// JSX lisible et de séparer logique & rendu.
function SellTabInner({
  cards,
  visibleCount,
  ownedMap,
  listedByCard,
  cart,
  cartIds,
  validating,
  FiltersUI,
  addToCart,
  removeFromCart,
  clearCart,
  changePrice,
  validateSells,
}: {
  profile: Profile;
  cards: PokemonCardData[];
  visibleCount: number;
  ownedMap: Map<string, number>;
  listedByCard: Map<string, number>;
  cart: CartItem[];
  cartIds: Set<string>;
  validating: boolean;
  FiltersUI: React.ReactNode;
  addToCart: (card: PokemonCardData) => void;
  removeFromCart: (cardId: string) => void;
  clearCart: () => void;
  changePrice: (cardId: string, price: number) => void;
  validateSells: () => void;
  cardById: Map<string, PokemonCardData>;
}) {
  return (
    <div className="flex h-full min-h-0 gap-3">
      <CartSidebar
        title="💰 À mettre en vente"
        items={cart}
        onRemove={removeFromCart}
        onClear={clearCart}
        onValidate={validateSells}
        validating={validating}
        validateLabel={`Mettre en vente (${cart.length})`}
        emptyHint="Clique 'Vendre' sur une de tes cartes pour l'ajouter ici."
        onChangePrice={changePrice}
        totalLabel="Total à recevoir"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        {FiltersUI}
        <div className="text-[11px] text-zinc-500">
          {visibleCount} carte{visibleCount > 1 ? "s" : ""} disponible
          {visibleCount > 1 ? "s" : ""} à la vente (≥2 exemplaires possédés).
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {cards.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
              Aucune carte vendable. Ouvre des boosters pour avoir des doublons !
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {cards.map((card) => {
                const owned = ownedMap.get(card.id) ?? 0;
                const listed = listedByCard.get(card.id) ?? 0;
                const sellable = owned - listed;
                const inCart = cartIds.has(card.id);
                return (
                  <SellCardTile
                    key={card.id}
                    card={card}
                    owned={owned}
                    sellable={sellable}
                    inCart={inCart}
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

function SellCardTile({
  card,
  owned,
  sellable,
  inCart,
  onAdd,
  onRemove,
}: {
  card: PokemonCardData;
  owned: number;
  sellable: number;
  inCart: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`relative flex flex-col gap-1.5 rounded-xl border bg-black/40 p-2 transition-colors ${
        inCart
          ? "border-amber-400/60 bg-amber-400/5"
          : RARITY_COLOR[card.rarity].split(" ")[0] ?? "border-white/10"
      }`}
    >
      <span
        className="absolute right-2 top-2 z-10 rounded-full bg-black/80 px-1.5 py-0.5 text-[9px] font-bold text-zinc-300"
        title={`${owned} possédées · ${sellable} vendable${sellable > 1 ? "s" : ""} (1 conservée mini)`}
      >
        ×{owned}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.image}
        alt={card.name}
        className="aspect-[5/7] w-full rounded object-contain"
      />
      <div className="px-1 text-[11px]">
        <div className="truncate font-semibold text-zinc-100">{card.name}</div>
      </div>
      <div className="flex gap-1">
        {inCart ? (
          <button
            onClick={onRemove}
            className="flex-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-400/20"
          >
            ✓ Dans panier
          </button>
        ) : (
          <button
            onClick={onAdd}
            className="flex-1 rounded-md bg-amber-500 px-2 py-1 text-[11px] font-bold text-amber-950 hover:bg-amber-400"
          >
            💰 Vendre
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
