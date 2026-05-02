"use client";

import type { PokemonCardData } from "@shared/types";
import type { HistoryListing } from "../page";

/** Vue table d'historique pour les sous-onglets "Mes achats" (kind=buy)
 *  et "Mes ventes effectuées" (kind=sell). Chaque ligne = un listing
 *  passé, avec la date, la carte et le prix. */
export function HistoryView({
  rows,
  cardById,
  kind,
}: {
  rows: HistoryListing[];
  cardById: Map<string, PokemonCardData>;
  kind: "buy" | "sell";
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
        {kind === "buy"
          ? "Tu n'as encore rien acheté. Va sur l'onglet Catalogue pour faire tes courses !"
          : "Tu n'as encore rien vendu. Mets quelques cartes en vente pour commencer."}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto pr-1">
      {rows.map((row) => {
        const card = cardById.get(row.card_id);
        if (!card) return null;
        const isSold = row.status === "sold";
        const dateStr = new Date(
          row.sold_at ?? row.created_at,
        ).toLocaleString("fr-FR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        return (
          <div
            key={row.id}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 p-2.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.image}
              alt={card.name}
              className="h-16 w-12 rounded object-contain"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold text-zinc-100">
                {card.name}
              </span>
              <span className="text-[10px] text-zinc-500">{dateStr}</span>
              {!isSold && row.status !== "active" && (
                <span className="text-[10px] uppercase tracking-widest text-rose-400">
                  {row.status}
                </span>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span
                className={`tabular-nums font-bold ${
                  kind === "buy" ? "text-rose-300" : "text-emerald-300"
                }`}
              >
                {kind === "buy" ? "−" : "+"}
                {row.price_os.toLocaleString("fr-FR")} OS
              </span>
              <span className="text-[10px] text-zinc-500">
                {kind === "buy" ? "Acheté" : isSold ? "Vendu" : row.status}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
