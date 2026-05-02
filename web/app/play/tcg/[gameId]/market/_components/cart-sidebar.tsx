"use client";

import type { PokemonCardData } from "@shared/types";

export type CartItem = {
  /** Carte ajoutée au panier. */
  card: PokemonCardData;
  /** Pour ACHAT : id du listing à acheter. Pour VENTE : null (pas de
   *  listing tant que le user n'a pas validé). */
  listingId: string | null;
  /** Prix unitaire (OS). Pour achat = prix du listing. Pour vente = prix
   *  saisi par le user dans la grille. */
  price: number;
};

/** Panier latéral utilisé par les onglets Acheter et Vendre. Affiche la
 *  liste des cartes sélectionnées avec leur prix, le total, un bouton
 *  Valider et la possibilité de retirer une carte du panier. */
export function CartSidebar({
  title,
  items,
  onRemove,
  onClear,
  onValidate,
  validating,
  validateLabel,
  emptyHint,
  /** Pour Vendre uniquement : permet à l'user de modifier le prix d'une
   *  ligne directement dans le panier. */
  onChangePrice,
  totalLabel = "Total",
}: {
  title: string;
  items: CartItem[];
  onRemove: (cardId: string) => void;
  onClear: () => void;
  onValidate: () => void;
  validating: boolean;
  validateLabel: string;
  emptyHint: string;
  onChangePrice?: (cardId: string, price: number) => void;
  totalLabel?: string;
}) {
  const total = items.reduce((s, it) => s + it.price, 0);
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">
          {title}{" "}
          <span className="text-zinc-500">({items.length})</span>
        </span>
        {items.length > 0 && (
          <button
            onClick={onClear}
            className="text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            Vider
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 p-3 text-center text-[11px] italic text-zinc-500">
            {emptyHint}
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((it) => (
              <li
                key={it.card.id}
                className="flex items-start gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.card.image}
                  alt={it.card.name}
                  className="h-12 w-9 shrink-0 rounded object-contain"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-xs font-semibold text-zinc-100">
                    {it.card.name}
                  </span>
                  {onChangePrice ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={100}
                        step={100}
                        value={it.price}
                        onChange={(e) =>
                          onChangePrice(
                            it.card.id,
                            Math.max(100, Number(e.target.value) || 0),
                          )
                        }
                        className="w-20 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-right text-[11px] tabular-nums text-amber-300 focus:border-amber-400/50 focus:outline-none"
                      />
                      <span className="text-[10px] text-zinc-500">OS</span>
                    </div>
                  ) : (
                    <span className="text-[11px] tabular-nums font-bold text-amber-300">
                      {it.price.toLocaleString("fr-FR")} OS
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onRemove(it.card.id)}
                  title="Retirer du panier"
                  className="shrink-0 rounded text-zinc-500 hover:text-rose-400"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">{totalLabel}</span>
            <span className="font-bold tabular-nums text-amber-300">
              {total.toLocaleString("fr-FR")} OS
            </span>
          </div>
          <button
            onClick={onValidate}
            disabled={validating}
            className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-bold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-50"
          >
            {validating ? "Traitement…" : validateLabel}
          </button>
        </div>
      )}
    </aside>
  );
}
