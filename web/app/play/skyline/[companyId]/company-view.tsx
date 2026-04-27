"use client";

import { useState, useTransition } from "react";
import {
  SKYLINE_COMMERCE_PRODUCTS,
  SKYLINE_COMMERCE_SECTORS,
  SKYLINE_DISTRICTS,
  SKYLINE_FURNITURE,
  SKYLINE_LOCAL_SIZES,
  SKYLINE_PRODUCTS,
  skylineFormatCashFR,
  skylineRentMonthly,
  type SkylineCommerceSector,
  type SkylineCompanyRow,
  type SkylineFurnitureKind,
  type SkylineFurnitureRow,
  type SkylineInventoryRow,
  type SkylineProductId,
  type SkylineTransactionRow,
} from "@shared/skyline";
import {
  buyFurnitureAction,
  purchaseStockAction,
  setSellPriceAction,
} from "../_lib/actions";

type Tab = "stocks" | "furniture" | "pricing" | "compta";

export function CompanyView({
  company,
  furniture,
  inventory,
  transactions,
  cash,
}: {
  company: SkylineCompanyRow;
  furniture: SkylineFurnitureRow[];
  inventory: SkylineInventoryRow[];
  transactions: SkylineTransactionRow[];
  cash: number;
}) {
  const [tab, setTab] = useState<Tab>("stocks");
  const sectorMeta =
    SKYLINE_COMMERCE_SECTORS[company.sector as SkylineCommerceSector];
  const districtMeta = SKYLINE_DISTRICTS[company.district];
  const sizeMeta = SKYLINE_LOCAL_SIZES[company.local_size];
  const rent = skylineRentMonthly(company.district, company.local_size);
  const availableProducts =
    SKYLINE_COMMERCE_PRODUCTS[company.sector as SkylineCommerceSector] ?? [];

  return (
    <main
      className={`flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(236,72,153,0.06),transparent_60%)] p-6`}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        {/* Banner */}
        <div className={`rounded-xl border bg-black/40 p-4 ${districtMeta.border}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-zinc-400">
                {sectorMeta?.name ?? company.sector}
              </div>
              <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-zinc-100">
                {sectorMeta?.glyph} {company.name}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {districtMeta.glyph} {districtMeta.name} · Local {sizeMeta.name} ({sizeMeta.sqm}m²) ·{" "}
                {company.is_owned ? "🏠 Propriétaire" : `📜 Loué (${skylineFormatCashFR(rent)}/mois)`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                Trésorerie
              </div>
              <div className="text-lg font-semibold text-emerald-200 tabular-nums">
                {skylineFormatCashFR(Number(company.cash))}
              </div>
              <div className="mt-1 text-[10px] text-zinc-500">
                Revenus mensuels
              </div>
              <div className="text-sm font-semibold text-emerald-300 tabular-nums">
                +{skylineFormatCashFR(Number(company.monthly_revenue))}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <TabButton current={tab} value="stocks" onClick={setTab}>
            📦 Stocks
          </TabButton>
          <TabButton current={tab} value="furniture" onClick={setTab}>
            🪑 Présentoirs ({furniture.length})
          </TabButton>
          <TabButton current={tab} value="pricing" onClick={setTab}>
            💰 Prix de vente
          </TabButton>
          <TabButton current={tab} value="compta" onClick={setTab}>
            📊 Compta
          </TabButton>
        </div>

        {/* Tab content */}
        {tab === "stocks" ? (
          <StocksTab
            companyId={company.id}
            inventory={inventory}
            availableProducts={availableProducts}
            cash={cash}
          />
        ) : null}
        {tab === "furniture" ? (
          <FurnitureTab
            companyId={company.id}
            furniture={furniture}
            cash={cash}
          />
        ) : null}
        {tab === "pricing" ? (
          <PricingTab companyId={company.id} inventory={inventory} />
        ) : null}
        {tab === "compta" ? <ComptaTab transactions={transactions} /> : null}
      </div>
    </main>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: Tab;
  value: Tab;
  onClick: (t: Tab) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-pink-400/60 bg-pink-500/15 text-pink-100"
          : "border-white/10 bg-black/40 text-zinc-400 hover:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────
// Onglet Stocks
// ──────────────────────────────────────────────────────────────────

function StocksTab({
  companyId,
  inventory,
  availableProducts,
  cash,
}: {
  companyId: string;
  inventory: SkylineInventoryRow[];
  availableProducts: SkylineProductId[];
  cash: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">
          Achat au marché de gros
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          Tu achètes des produits aux fournisseurs PNJ au prix de gros. Tu les
          revends ensuite en boutique avec ta marge.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {availableProducts.map((pid) => {
            const product = SKYLINE_PRODUCTS[pid];
            if (!product) return null;
            return (
              <PurchaseCard
                key={pid}
                companyId={companyId}
                productId={pid}
                productName={product.name}
                glyph={product.glyph}
                refBuyPrice={product.refBuyPrice}
                cash={cash}
              />
            );
          })}
        </div>
      </div>

      {inventory.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">
            Stock actuel ({inventory.length} produits)
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-white/5">
                  <th className="py-2 text-left">Produit</th>
                  <th className="text-right">Quantité</th>
                  <th className="text-right">Prix achat moy.</th>
                  <th className="text-right">Prix vente</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((inv) => {
                  const product = SKYLINE_PRODUCTS[inv.product_id];
                  return (
                    <tr key={inv.id} className="border-b border-white/5">
                      <td className="py-2 text-zinc-200">
                        {product?.glyph} {product?.name ?? inv.product_id}
                      </td>
                      <td className="text-right text-zinc-300">
                        {inv.quantity}
                      </td>
                      <td className="text-right text-zinc-400">
                        {skylineFormatCashFR(Number(inv.avg_buy_price))}
                      </td>
                      <td className="text-right text-emerald-300">
                        {skylineFormatCashFR(Number(inv.sell_price))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PurchaseCard({
  companyId,
  productId,
  productName,
  glyph,
  refBuyPrice,
  cash,
}: {
  companyId: string;
  productId: SkylineProductId;
  productName: string;
  glyph: string;
  refBuyPrice: number;
  cash: number;
}) {
  const [quantity, setQuantity] = useState(10);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cost = quantity * refBuyPrice;
  const canAfford = cash >= cost;

  const handleBuy = () => {
    if (!canAfford || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("product_id", productId);
    fd.set("quantity", String(quantity));
    startTransition(async () => {
      const result = await purchaseStockAction(fd);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-200">
          {glyph} {productName}
        </div>
        <div className="text-xs tabular-nums text-zinc-400">
          {skylineFormatCashFR(refBuyPrice)} /u
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={1000}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          className="w-20 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-pink-400/50"
        />
        <button
          onClick={handleBuy}
          disabled={!canAfford || pending}
          className="flex-1 rounded-md border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Acheter · {skylineFormatCashFR(cost)}
        </button>
      </div>
      {error ? (
        <div className="mt-1 text-[10px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Onglet Présentoirs
// ──────────────────────────────────────────────────────────────────

function FurnitureTab({
  companyId,
  furniture,
  cash,
}: {
  companyId: string;
  furniture: SkylineFurnitureRow[];
  cash: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">
          Acheter un présentoir / équipement
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          P1 : placement abstrait. Le local 2D arrive en P3 avec drag & drop.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.values(SKYLINE_FURNITURE).map((f) => (
            <FurnitureCard
              key={f.id}
              companyId={companyId}
              kind={f.id}
              name={f.name}
              glyph={f.glyph}
              cost={f.cost}
              capacity={f.capacity}
              description={f.description}
              cash={cash}
            />
          ))}
        </div>
      </div>

      {furniture.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">
            Mes équipements ({furniture.length})
          </h3>
          <ul className="mt-3 space-y-1 text-xs">
            {furniture.map((f) => {
              const meta = SKYLINE_FURNITURE[f.kind as SkylineFurnitureKind];
              return (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-2"
                >
                  <span className="text-zinc-200">
                    {meta?.glyph} {meta?.name ?? f.kind}
                  </span>
                  <span className="text-zinc-500">
                    Capacité {meta?.capacity ?? 0}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function FurnitureCard({
  companyId,
  kind,
  name,
  glyph,
  cost,
  capacity,
  description,
  cash,
}: {
  companyId: string;
  kind: SkylineFurnitureKind;
  name: string;
  glyph: string;
  cost: number;
  capacity: number;
  description: string;
  cash: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canAfford = cash >= cost;

  const handleBuy = () => {
    if (!canAfford || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("kind", kind);
    startTransition(async () => {
      const result = await buyFurnitureAction(fd);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="text-2xl">{glyph}</div>
      <div>
        <div className="text-sm font-semibold text-zinc-100">{name}</div>
        <div className="text-[10px] text-zinc-500">{description}</div>
      </div>
      <div className="text-[11px] text-zinc-400">
        Capacité {capacity} u
      </div>
      <button
        onClick={handleBuy}
        disabled={!canAfford || pending}
        className="rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "..." : `Acheter · ${skylineFormatCashFR(cost)}`}
      </button>
      {error ? (
        <div className="text-[10px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Onglet Pricing
// ──────────────────────────────────────────────────────────────────

function PricingTab({
  companyId,
  inventory,
}: {
  companyId: string;
  inventory: SkylineInventoryRow[];
}) {
  if (inventory.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-center text-sm text-zinc-400">
        Achète d&apos;abord du stock pour fixer des prix.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-200">Prix de vente</h3>
      <p className="mt-1 text-xs text-zinc-400">
        Si trop cher → invendus. Si trop bas → marges nulles. Le prix de
        référence est une indication.
      </p>
      <div className="mt-3 space-y-2">
        {inventory.map((inv) => (
          <PricingRow key={inv.id} companyId={companyId} inv={inv} />
        ))}
      </div>
    </div>
  );
}

function PricingRow({
  companyId,
  inv,
}: {
  companyId: string;
  inv: SkylineInventoryRow;
}) {
  const product = SKYLINE_PRODUCTS[inv.product_id];
  const refSell = product?.refSellPrice ?? 0;
  const [price, setPrice] = useState(Number(inv.sell_price));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const margin = ((price - Number(inv.avg_buy_price)) / price) * 100;

  const handleSave = () => {
    if (pending) return;
    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("product_id", inv.product_id);
    fd.set("price", String(price));
    startTransition(async () => {
      const result = await setSellPriceAction(fd);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
      <div className="min-w-[200px] flex-1">
        <div className="text-zinc-200">
          {product?.glyph} {product?.name ?? inv.product_id}
        </div>
        <div className="text-[10px] text-zinc-500">
          Stock {inv.quantity} · Achat {skylineFormatCashFR(Number(inv.avg_buy_price))} ·
          Réf. vente {skylineFormatCashFR(refSell)}
        </div>
      </div>
      <input
        type="number"
        step={0.1}
        min={0}
        value={price}
        onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
        className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-right text-zinc-100 outline-none tabular-nums focus:border-pink-400/50"
      />
      <span
        className={`min-w-[60px] text-right tabular-nums ${
          margin > 0 ? "text-emerald-300" : "text-rose-300"
        }`}
      >
        {margin.toFixed(0)}%
      </span>
      <button
        onClick={handleSave}
        disabled={pending}
        className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
      >
        {saved ? "✓ OK" : pending ? "..." : "Valider"}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Onglet Compta
// ──────────────────────────────────────────────────────────────────

function ComptaTab({ transactions }: { transactions: SkylineTransactionRow[] }) {
  const totalIn = transactions
    .filter((t) => Number(t.amount) > 0)
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = transactions
    .filter((t) => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/5 p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">
            Entrées
          </div>
          <div className="mt-1 text-lg font-semibold text-emerald-200 tabular-nums">
            +{skylineFormatCashFR(totalIn)}
          </div>
        </div>
        <div className="rounded-xl border border-rose-400/40 bg-rose-500/5 p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">
            Sorties
          </div>
          <div className="mt-1 text-lg font-semibold text-rose-200 tabular-nums">
            -{skylineFormatCashFR(totalOut)}
          </div>
        </div>
        <div
          className={`rounded-xl border p-3 ${
            totalIn - totalOut >= 0
              ? "border-emerald-400/40 bg-emerald-500/5"
              : "border-rose-400/40 bg-rose-500/5"
          }`}
        >
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">
            Solde
          </div>
          <div
            className={`mt-1 text-lg font-semibold tabular-nums ${
              totalIn - totalOut >= 0 ? "text-emerald-200" : "text-rose-200"
            }`}
          >
            {totalIn - totalOut >= 0 ? "+" : ""}
            {skylineFormatCashFR(totalIn - totalOut)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">
          Dernières transactions
        </h3>
        {transactions.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">
            Aucune transaction pour cette entreprise.
          </p>
        ) : (
          <ul className="mt-3 space-y-1 text-xs">
            {transactions.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-zinc-300">{tx.description}</div>
                  <div className="text-[10px] text-zinc-500">
                    {new Date(tx.created_at).toLocaleString("fr-FR")} · {tx.kind}
                  </div>
                </div>
                <span
                  className={`tabular-nums font-semibold ${
                    Number(tx.amount) >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {Number(tx.amount) >= 0 ? "+" : ""}
                  {skylineFormatCashFR(Number(tx.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
