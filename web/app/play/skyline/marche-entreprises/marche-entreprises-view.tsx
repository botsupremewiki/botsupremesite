"use client";

import { useState, useTransition } from "react";
import { skylineFormatCashFR } from "@shared/skyline";
import type { CompanyForSaleListing } from "../_lib/supabase-helpers";
import { buyCompanyAction } from "../_lib/actions";

export function MarcheEntreprisesView({
  listings,
  cash,
  userId,
}: {
  listings: CompanyForSaleListing[];
  cash: number;
  userId: string;
}) {
  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            🏢 Marché d&apos;entreprises
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Entreprises mises en vente par les autres joueurs. Acheter une
            entreprise transfère intégralement ses actifs (locaux, équipement,
            stocks, employés). Limite : tu ne peux posséder qu&apos;une seule
            entreprise par secteur.
          </p>
        </div>

        {listings.length === 0 ? (
          <div className="rounded-md border border-zinc-400/30 bg-zinc-500/5 p-3 text-xs text-zinc-400">
            Aucune entreprise en vente actuellement. Reviens plus tard.
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map((l) => (
              <ListingCard
                key={l.company_id}
                listing={l}
                cash={cash}
                isOwn={l.seller_user_id === userId}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function ListingCard({
  listing,
  cash,
  isOwn,
}: {
  listing: CompanyForSaleListing;
  cash: number;
  isOwn: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState(false);
  const canAfford = cash >= listing.asking_price;

  const handleBuy = () => {
    if (pending || isOwn || !canAfford) return;
    if (!confirm(`Acheter ${listing.company_name} pour ${skylineFormatCashFR(listing.asking_price)} ?`))
      return;
    setError(null);
    const fd = new FormData();
    fd.set("company_id", listing.company_id);
    startTransition(async () => {
      const res = await buyCompanyAction(fd);
      if (res.ok) setBought(true);
      else setError(res.error);
    });
  };

  if (bought) {
    return (
      <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/5 p-3 text-xs text-emerald-200">
        ✓ Achat effectué — {listing.company_name} est maintenant à toi. Va dans
        tes entreprises pour la voir.
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-4 ${
        isOwn
          ? "border-amber-400/40 bg-amber-500/5"
          : "border-white/10 bg-black/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-zinc-100">
            🏢 {listing.company_name}
            {isOwn ? (
              <span className="ml-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                Ton listing
              </span>
            ) : null}
          </div>
          <div className="text-[11px] text-zinc-500">
            {listing.company_category} · {listing.company_sector} ·{" "}
            {listing.company_district}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-amber-200 tabular-nums">
            {skylineFormatCashFR(listing.asking_price)}
          </div>
          <div className="text-[10px] text-zinc-500">prix demandé</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] tabular-nums text-zinc-500">
        <div>
          Revenus mensuels{" "}
          <span className="text-emerald-300">
            +{skylineFormatCashFR(listing.monthly_revenue)}
          </span>
        </div>
        <div>
          Listée le{" "}
          <span className="text-zinc-400">
            {new Date(listing.listed_at).toLocaleDateString("fr-FR")}
          </span>
        </div>
      </div>

      {!isOwn ? (
        <button
          onClick={handleBuy}
          disabled={pending || !canAfford}
          className="mt-3 w-full rounded-md border border-emerald-400/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending
            ? "Achat..."
            : !canAfford
            ? "Cash insuffisant"
            : `Acheter · ${skylineFormatCashFR(listing.asking_price)}`}
        </button>
      ) : null}
      {error ? (
        <div className="mt-2 text-xs text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}
