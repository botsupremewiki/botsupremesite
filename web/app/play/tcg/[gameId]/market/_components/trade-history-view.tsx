"use client";

import type { PokemonCardData } from "@shared/types";
import type { TradeHistoryRow } from "../page";

/** Liste des trades effectués (acceptés, refusés, annulés). Pour chaque
 *  trade : date, partenaire, cartes échangées, statut. */
export function TradeHistoryView({
  rows,
  cardById,
}: {
  rows: TradeHistoryRow[];
  cardById: Map<string, PokemonCardData>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
        Aucun échange effectué pour l&apos;instant.
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto pr-1">
      {rows.map((row) => {
        const date = new Date(row.created_at).toLocaleString("fr-FR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        const partnerName = row.is_sender
          ? row.recipient_username
          : row.sender_username;
        const myCards = row.is_sender
          ? row.offered_cards
          : row.requested_cards;
        const theirCards = row.is_sender
          ? row.requested_cards
          : row.offered_cards;
        return (
          <div
            key={row.id}
            className="rounded-lg border border-white/10 bg-black/40 p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-400">{date}</span>
                <span className="text-zinc-500">·</span>
                <span className="font-semibold text-zinc-200">
                  avec {partnerName}
                </span>
              </div>
              <StatusBadge status={row.status} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <CardsCol
                label="Mes cartes"
                cards={myCards}
                cardById={cardById}
              />
              <CardsCol
                label="Reçues"
                cards={theirCards}
                cardById={cardById}
              />
            </div>
            {row.message && (
              <div className="mt-2 rounded border border-white/5 bg-white/[0.02] p-2 text-xs italic text-zinc-300">
                &laquo; {row.message} &raquo;
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CardsCol({
  label,
  cards,
  cardById,
}: {
  label: string;
  cards: { cardId: string; count: number }[];
  cardById: Map<string, PokemonCardData>;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {cards.length === 0 ? (
          <span className="text-[10px] italic text-zinc-600">—</span>
        ) : (
          cards.map((c, i) => {
            const data = cardById.get(c.cardId);
            if (!data) return null;
            return (
              <div key={i} className="relative" title={`${data.name} ×${c.count}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.image}
                  alt={data.name}
                  className="h-16 w-12 rounded object-contain"
                />
                {c.count > 1 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-amber-950">
                    ×{c.count}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    accepted: {
      label: "✓ Effectué",
      cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    },
    pending: {
      label: "⏳ En attente",
      cls: "border-amber-400/40 bg-amber-400/10 text-amber-200",
    },
    declined: {
      label: "✕ Refusé",
      cls: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    },
    cancelled: {
      label: "⊘ Annulé",
      cls: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
    },
  };
  const meta = map[status] ?? {
    label: status,
    cls: "border-white/10 bg-white/[0.03] text-zinc-300",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-widest ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}
