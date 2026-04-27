"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  SKYLINE_COMMERCE_PRODUCTS,
  SKYLINE_COMMERCE_SECTORS,
  SKYLINE_DISTRICTS,
  SKYLINE_FACTORY_SECTORS,
  SKYLINE_FURNITURE,
  SKYLINE_INTERMEDIATE_PRODUCTS,
  SKYLINE_LOCAL_SIZES,
  SKYLINE_MACHINE_LEVELS,
  SKYLINE_PERMITS,
  SKYLINE_PRODUCTS,
  SKYLINE_RAW_MATERIALS,
  SKYLINE_RAW_SECTORS,
  SKYLINE_SECTOR_REQUIRED_PERMITS,
  SKYLINE_SKILLS,
  skylineFormatCashFR,
  skylineRentMonthly,
  type SkylineCommerceSector,
  type SkylineCompanyRow,
  type SkylineEmployeeRow,
  type SkylineFactorySector,
  type SkylineFurnitureKind,
  type SkylineFurnitureRow,
  type SkylineInventoryRow,
  type SkylineMachineLevel,
  type SkylineMachineRow,
  type SkylinePermitKind,
  type SkylinePermitRow,
  type SkylineProductId,
  type SkylineRawMaterialId,
  type SkylineRawSector,
  type SkylineSkill,
  type SkylineTransactionRow,
} from "@shared/skyline";
import {
  acquirePermitAction,
  buyFurnitureAction,
  buyMachineAction,
  buyRawMachineAction,
  cleanCompanyAction,
  fireEmployeeAction,
  ipoCompanyAction,
  payDividendAction,
  placeFurnitureAction,
  placeMarketOrderAction,
  purchaseRawMaterialAction,
  purchaseStockAction,
  removeFurnitureAction,
  setSellPriceAction,
} from "../_lib/actions";

type Tab =
  | "stocks"
  | "furniture"
  | "layout"
  | "pricing"
  | "hr"
  | "hygiene"
  | "permits"
  | "compta"
  | "machines"
  | "production"
  | "extraction"
  | "market"
  | "bourse";

type ShareInfo = {
  id: string;
  total_shares: number;
  ipo_price: number;
  current_price: number;
  market_cap: number;
  is_listed: boolean;
  ipo_at: string | null;
} | null;

export function CompanyView({
  company,
  furniture,
  inventory,
  transactions,
  employees,
  permits,
  machines,
  share,
  cash,
}: {
  company: SkylineCompanyRow;
  furniture: SkylineFurnitureRow[];
  inventory: SkylineInventoryRow[];
  transactions: SkylineTransactionRow[];
  employees: SkylineEmployeeRow[];
  permits: SkylinePermitRow[];
  machines: SkylineMachineRow[];
  share: ShareInfo;
  cash: number;
}) {
  const isFactory = company.category === "factory";
  const isRaw = company.category === "raw";
  const isCommerce = company.category === "commerce";
  const [tab, setTab] = useState<Tab>(
    isFactory ? "production" : isRaw ? "extraction" : "stocks",
  );
  const commerceSectorMeta = isCommerce
    ? SKYLINE_COMMERCE_SECTORS[company.sector as SkylineCommerceSector]
    : null;
  const factorySectorMeta = isFactory
    ? SKYLINE_FACTORY_SECTORS[company.sector as SkylineFactorySector]
    : null;
  const rawSectorMeta = isRaw
    ? SKYLINE_RAW_SECTORS[company.sector as SkylineRawSector]
    : null;
  const sectorMeta = commerceSectorMeta ?? factorySectorMeta ?? rawSectorMeta;
  const districtMeta = SKYLINE_DISTRICTS[company.district];
  const sizeMeta = SKYLINE_LOCAL_SIZES[company.local_size];
  const rent = skylineRentMonthly(company.district, company.local_size);
  const availableProducts =
    SKYLINE_COMMERCE_PRODUCTS[company.sector as SkylineCommerceSector] ?? [];
  const factoryRecipe = factorySectorMeta;

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
          {isFactory ? (
            <>
              <TabButton current={tab} value="production" onClick={setTab}>
                🏭 Production
              </TabButton>
              <TabButton current={tab} value="machines" onClick={setTab}>
                ⚙️ Machines ({machines.length})
              </TabButton>
              <TabButton current={tab} value="stocks" onClick={setTab}>
                📦 Stocks
              </TabButton>
              <TabButton current={tab} value="market" onClick={setTab}>
                📈 Marché B2B
              </TabButton>
            </>
          ) : isRaw ? (
            <>
              <TabButton current={tab} value="extraction" onClick={setTab}>
                🌾 Extraction
              </TabButton>
              <TabButton current={tab} value="machines" onClick={setTab}>
                ⚙️ Machines ({machines.length})
              </TabButton>
              <TabButton current={tab} value="stocks" onClick={setTab}>
                📦 Stocks
              </TabButton>
              <TabButton current={tab} value="market" onClick={setTab}>
                📈 Marché B2B
              </TabButton>
            </>
          ) : (
            <>
              <TabButton current={tab} value="stocks" onClick={setTab}>
                📦 Stocks
              </TabButton>
              <TabButton current={tab} value="furniture" onClick={setTab}>
                🪑 Présentoirs ({furniture.length})
              </TabButton>
              <TabButton current={tab} value="layout" onClick={setTab}>
                🏠 Local 2D
              </TabButton>
              <TabButton current={tab} value="pricing" onClick={setTab}>
                💰 Prix de vente
              </TabButton>
            </>
          )}
          <TabButton current={tab} value="hr" onClick={setTab}>
            👥 RH ({employees.length})
          </TabButton>
          <TabButton current={tab} value="hygiene" onClick={setTab}>
            🧹 Hygiène
          </TabButton>
          <TabButton current={tab} value="permits" onClick={setTab}>
            📜 Permis
          </TabButton>
          <TabButton current={tab} value="bourse" onClick={setTab}>
            📈 Bourse
          </TabButton>
          <TabButton current={tab} value="compta" onClick={setTab}>
            📊 Compta
          </TabButton>
        </div>

        {/* Tab content */}
        {tab === "stocks" ? (
          isFactory && factoryRecipe ? (
            <FactoryStocksTab
              companyId={company.id}
              inventory={inventory}
              recipe={factoryRecipe}
              cash={cash}
            />
          ) : isRaw && rawSectorMeta ? (
            <RawStocksTab
              companyId={company.id}
              inventory={inventory}
              sectorMeta={rawSectorMeta}
            />
          ) : (
            <StocksTab
              companyId={company.id}
              inventory={inventory}
              availableProducts={availableProducts}
              cash={cash}
            />
          )
        ) : null}
        {tab === "production" && factoryRecipe ? (
          <ProductionTab
            company={company}
            inventory={inventory}
            recipe={factoryRecipe}
            machines={machines}
            employees={employees}
          />
        ) : null}
        {tab === "machines" && factoryRecipe ? (
          <MachinesTab
            companyId={company.id}
            machineKind={factoryRecipe.machineKind}
            machines={machines}
            cash={cash}
          />
        ) : null}
        {tab === "machines" && rawSectorMeta ? (
          <RawMachinesTab
            companyId={company.id}
            machineKind={rawSectorMeta.machineKind}
            machines={machines}
            cash={cash}
          />
        ) : null}
        {tab === "extraction" && rawSectorMeta ? (
          <ExtractionTab
            inventory={inventory}
            sectorMeta={rawSectorMeta}
            machines={machines}
          />
        ) : null}
        {tab === "market" ? (
          <MarketTab
            companyId={company.id}
            inventory={inventory}
            cash={cash}
          />
        ) : null}
        {tab === "bourse" ? (
          <BourseTab
            companyId={company.id}
            companyName={company.name}
            share={share}
            isOwner={true}
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
        {tab === "layout" ? (
          <LayoutTab
            companyId={company.id}
            sizeId={company.local_size}
            furniture={furniture}
          />
        ) : null}
        {tab === "pricing" ? (
          <PricingTab companyId={company.id} inventory={inventory} />
        ) : null}
        {tab === "hr" ? (
          <HRTab companyId={company.id} employees={employees} />
        ) : null}
        {tab === "hygiene" ? (
          <HygieneTab company={company} employees={employees} />
        ) : null}
        {tab === "permits" ? (
          <PermitsTab
            companyId={company.id}
            sector={company.sector as SkylineCommerceSector}
            permits={permits}
            cash={cash}
          />
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

// ──────────────────────────────────────────────────────────────────
// Onglet RH
// ──────────────────────────────────────────────────────────────────

function HRTab({
  companyId,
  employees,
}: {
  companyId: string;
  employees: SkylineEmployeeRow[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-blue-400/40 bg-black/40 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-blue-200">
            👥 Mon équipe ({employees.length})
          </h3>
          <Link
            href="/play/skyline/emploi"
            className="rounded-md border border-blue-400/50 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200 hover:bg-blue-500/20"
          >
            + Recruter
          </Link>
        </div>
        {employees.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-400">
            Aucun employé. Va sur le marché de l&apos;emploi pour recruter.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {employees.map((emp) => (
              <EmployeeCard
                key={emp.id}
                companyId={companyId}
                employee={emp}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmployeeCard({
  companyId,
  employee,
}: {
  companyId: string;
  employee: SkylineEmployeeRow;
}) {
  const skills = (employee.skills ?? {}) as Record<string, number>;
  const topSkills = Object.entries(skills)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, 3)
    .filter(([, v]) => Number(v) > 30);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleFire = () => {
    if (pending || !confirm(`Licencier ${employee.full_name} ?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("employee_id", employee.id);
    fd.set("company_id", companyId);
    startTransition(async () => {
      const res = await fireEmployeeAction(fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-100">
            {employee.full_name}
          </div>
          <div className="text-[10px] text-zinc-500 tabular-nums">
            Salaire {skylineFormatCashFR(Number(employee.salary_paid))}/mois ·
            Moral {employee.morale}
          </div>
        </div>
        <button
          onClick={handleFire}
          disabled={pending}
          className="rounded-md border border-rose-400/40 bg-rose-500/5 px-2.5 py-1 text-xs text-rose-200 transition-colors hover:bg-rose-500/15 disabled:opacity-40"
        >
          Licencier
        </button>
      </div>
      {topSkills.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {topSkills.map(([skill, value]) => {
            const meta = SKYLINE_SKILLS[skill as SkylineSkill];
            return (
              <span
                key={skill}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-300"
              >
                {meta?.glyph} {meta?.name ?? skill} · {Number(value)}
              </span>
            );
          })}
        </div>
      ) : null}
      {error ? (
        <div className="mt-1 text-[10px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Onglet Hygiène
// ──────────────────────────────────────────────────────────────────

function HygieneTab({
  company,
  employees,
}: {
  company: SkylineCompanyRow;
  employees: SkylineEmployeeRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [cleaned, setCleaned] = useState(false);
  const cleanlinessLevel = company.cleanliness;
  const grade = company.hygiene_grade ?? "A";
  const hasCleaner = employees.some((e) => {
    const skills = (e.skills ?? {}) as Record<string, number>;
    return Number(skills.entretien ?? 0) > 30;
  });

  const handleClean = () => {
    if (pending) return;
    const fd = new FormData();
    fd.set("company_id", company.id);
    startTransition(async () => {
      const res = await cleanCompanyAction(fd);
      if (res.ok) setCleaned(true);
    });
  };

  const cleanlinessColor =
    cleanlinessLevel >= 70
      ? "from-emerald-500 to-emerald-300"
      : cleanlinessLevel >= 40
      ? "from-amber-500 to-amber-300"
      : "from-rose-500 to-rose-300";

  const gradeColor =
    grade === "A" ? "text-emerald-200" : grade === "B" ? "text-amber-200" : "text-rose-200";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">
          🧹 État de propreté
        </h3>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              Score propreté
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-100 tabular-nums">
                {cleanlinessLevel}
              </span>
              <span className="text-xs text-zinc-500">/ 100</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
              <div
                className={`h-full bg-gradient-to-r ${cleanlinessColor}`}
                style={{ width: `${cleanlinessLevel}%` }}
              />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              Note hygiène (vitrine)
            </div>
            <div className={`mt-1 text-2xl font-bold ${gradeColor}`}>
              {grade}
            </div>
            <div className="text-[10px] text-zinc-500">
              {grade === "A"
                ? "Aucun impact"
                : grade === "B"
                ? "-10% clients"
                : "-30% clients + risque fermeture"}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={handleClean}
            disabled={pending || cleaned}
            className="rounded-lg border border-emerald-400/50 bg-emerald-500/10 p-4 text-left transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <div className="text-sm font-semibold text-emerald-200">
              🧽 Nettoyer manuellement
            </div>
            <div className="mt-1 text-[11px] text-zinc-400">
              {cleaned
                ? "✓ Nettoyé. Score → 100"
                : "Gratuit · reset propreté à 100. À refaire régulièrement."}
            </div>
          </button>
          <div
            className={`rounded-lg border p-4 ${
              hasCleaner
                ? "border-emerald-400/40 bg-emerald-500/5"
                : "border-white/10 bg-white/[0.02]"
            }`}
          >
            <div className="text-sm font-semibold text-zinc-200">
              {hasCleaner ? "✓ Femme de ménage embauchée" : "👩‍🦱 Femme de ménage"}
            </div>
            <div className="mt-1 text-[11px] text-zinc-400">
              {hasCleaner
                ? "Maintient la propreté > 80 en continu. Pratique."
                : "Embauche un employé avec compétence Entretien > 30 dans le marché de l'emploi pour automatiser."}
            </div>
            {!hasCleaner ? (
              <Link
                href="/play/skyline/emploi"
                className="mt-2 inline-block rounded-md border border-blue-400/50 bg-blue-500/10 px-3 py-1 text-xs text-blue-200 hover:bg-blue-500/20"
              >
                Aller au marché →
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Onglet Permis
// ──────────────────────────────────────────────────────────────────

function PermitsTab({
  companyId,
  sector,
  permits,
  cash,
}: {
  companyId: string;
  sector: SkylineCommerceSector;
  permits: SkylinePermitRow[];
  cash: number;
}) {
  const required = SKYLINE_SECTOR_REQUIRED_PERMITS[sector] ?? [];
  const acquired = new Set(permits.map((p) => p.kind));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">
          📜 Permis & licences
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          Certains permis sont obligatoires selon ton secteur. Sans eux, tu
          risques amendes ou fermeture lors d&apos;une inspection.
        </p>

        <div className="mt-4 space-y-2">
          {Object.values(SKYLINE_PERMITS).map((p) => {
            const isRequired = required.includes(p.id);
            const isAcquired = acquired.has(p.id);
            return (
              <PermitCard
                key={p.id}
                companyId={companyId}
                permitId={p.id}
                name={p.name}
                glyph={p.glyph}
                cost={p.cost}
                description={p.description}
                isRequired={isRequired}
                isAcquired={isAcquired}
                cash={cash}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PermitCard({
  companyId,
  permitId,
  name,
  glyph,
  cost,
  description,
  isRequired,
  isAcquired,
  cash,
}: {
  companyId: string;
  permitId: SkylinePermitKind;
  name: string;
  glyph: string;
  cost: number;
  description: string;
  isRequired: boolean;
  isAcquired: boolean;
  cash: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleAcquire = () => {
    if (pending || cash < cost) return;
    setError(null);
    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("kind", permitId);
    startTransition(async () => {
      const res = await acquirePermitAction(fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div
      className={`rounded-lg border p-3 ${
        isAcquired
          ? "border-emerald-400/40 bg-emerald-500/5"
          : isRequired
          ? "border-rose-400/40 bg-rose-500/5"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-zinc-100">
            {glyph} {name}
            {isRequired && !isAcquired ? (
              <span className="ml-2 rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[9px] text-rose-200">
                OBLIGATOIRE
              </span>
            ) : null}
            {isAcquired ? (
              <span className="ml-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-200">
                ✓ ACQUIS
              </span>
            ) : null}
          </div>
          <div className="text-[10px] text-zinc-500">{description}</div>
        </div>
        {!isAcquired ? (
          <button
            onClick={handleAcquire}
            disabled={pending || cash < cost}
            className="rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "..." : `Acquérir · ${skylineFormatCashFR(cost)}`}
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="mt-1 text-[10px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Onglet Local 2D (drag & drop simplifié HTML/CSS)
// ──────────────────────────────────────────────────────────────────

function LayoutTab({
  companyId,
  sizeId,
  furniture,
}: {
  companyId: string;
  sizeId: keyof typeof SKYLINE_LOCAL_SIZES;
  furniture: SkylineFurnitureRow[];
}) {
  const size = SKYLINE_LOCAL_SIZES[sizeId];
  const W = size.gridW;
  const H = size.gridH;
  const [items, setItems] = useState(() =>
    furniture.map((f) => ({ ...f })),
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onDragStart = (id: string) => setDragging(id);
  const onDropCell = (x: number, y: number) => {
    if (!dragging) return;
    const item = items.find((it) => it.id === dragging);
    if (!item) return;
    const meta = SKYLINE_FURNITURE[item.kind as SkylineFurnitureKind];
    if (!meta) return;
    if (x + meta.width > W || y + meta.height > H) return;

    setItems((prev) =>
      prev.map((it) =>
        it.id === dragging ? { ...it, grid_x: x, grid_y: y } : it,
      ),
    );
    setDragging(null);

    const fd = new FormData();
    fd.set("furniture_id", dragging);
    fd.set("grid_x", String(x));
    fd.set("grid_y", String(y));
    fd.set("rotation", "0");
    fd.set("company_id", companyId);
    startTransition(async () => {
      await placeFurnitureAction(fd);
    });
  };

  const handleRemove = (id: string) => {
    if (!confirm("Retirer ce présentoir ?")) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
    const fd = new FormData();
    fd.set("furniture_id", id);
    fd.set("company_id", companyId);
    startTransition(async () => {
      await removeFurnitureAction(fd);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">
            🏠 Local {size.name} · {size.sqm}m² · grille {W}×{H}
          </h3>
          <span className="text-[11px] text-zinc-500">
            Glisse-dépose les présentoirs sur la grille.{" "}
            {pending ? "Sauvegarde..." : null}
          </span>
        </div>

        <div className="mt-4 flex flex-col items-center gap-1">
          <div
            className="grid gap-px rounded-lg border border-white/10 bg-white/[0.02] p-2"
            style={{
              gridTemplateColumns: `repeat(${W}, 28px)`,
              gridTemplateRows: `repeat(${H}, 28px)`,
            }}
          >
            {Array.from({ length: H }).map((_, y) =>
              Array.from({ length: W }).map((_, x) => {
                const occupied = items.find(
                  (it) => it.grid_x === x && it.grid_y === y,
                );
                const meta = occupied
                  ? SKYLINE_FURNITURE[occupied.kind as SkylineFurnitureKind]
                  : null;
                return (
                  <div
                    key={`${x}-${y}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDropCell(x, y)}
                    onDoubleClick={() => occupied && handleRemove(occupied.id)}
                    className={`flex items-center justify-center rounded-sm text-base ${
                      occupied
                        ? "cursor-grab bg-pink-500/20"
                        : "bg-white/[0.02] hover:bg-white/[0.06]"
                    }`}
                    draggable={Boolean(occupied)}
                    onDragStart={() => occupied && onDragStart(occupied.id)}
                    title={
                      occupied
                        ? `${meta?.name} (double-clic pour retirer)`
                        : `Case (${x}, ${y})`
                    }
                  >
                    {meta ? (
                      <span className="leading-none">{meta.glyph}</span>
                    ) : null}
                  </div>
                );
              }),
            )}
          </div>
          <div className="text-[10px] text-zinc-500">
            Drag & drop pour déplacer · double-clic pour retirer
          </div>
        </div>

        {items.length === 0 ? (
          <div className="mt-4 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            Tu n&apos;as pas encore de présentoirs. Va dans l&apos;onglet
            <strong> Présentoirs </strong>pour en acheter.
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Onglets P5 : USINE
// ──────────────────────────────────────────────────────────────────

type FactoryRecipeMeta = (typeof SKYLINE_FACTORY_SECTORS)[SkylineFactorySector];

function FactoryStocksTab({
  companyId,
  inventory,
  recipe,
  cash,
}: {
  companyId: string;
  inventory: SkylineInventoryRow[];
  recipe: FactoryRecipeMeta;
  cash: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-orange-400/40 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-orange-200">
          🌾 Achat matières premières
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          Cette usine consomme {recipe.inputs.map((i) => i.id).join(" + ")} pour
          produire {recipe.output.id}. Achète aux fournisseurs PNJ ou via le
          marché commun (P6).
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {recipe.inputs.map((inp) => {
            const matMeta =
              SKYLINE_RAW_MATERIALS[inp.id as SkylineRawMaterialId];
            if (!matMeta) return null;
            return (
              <RawMaterialPurchaseCard
                key={inp.id}
                companyId={companyId}
                materialId={matMeta.id}
                name={matMeta.name}
                glyph={matMeta.glyph}
                refBuyPrice={matMeta.refBuyPrice}
                cash={cash}
              />
            );
          })}
        </div>
      </div>

      {inventory.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">
            Stock actuel ({inventory.length} lignes)
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-white/5">
                  <th className="py-2 text-left">Ligne</th>
                  <th className="text-right">Quantité</th>
                  <th className="text-right">Prix achat moy.</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((inv) => {
                  const mat =
                    SKYLINE_RAW_MATERIALS[inv.product_id as SkylineRawMaterialId];
                  const intermed = SKYLINE_INTERMEDIATE_PRODUCTS[inv.product_id];
                  const product = SKYLINE_PRODUCTS[inv.product_id];
                  const meta = mat ?? intermed ?? product;
                  return (
                    <tr key={inv.id} className="border-b border-white/5">
                      <td className="py-2 text-zinc-200">
                        {meta?.glyph} {meta?.name ?? inv.product_id}
                      </td>
                      <td className="text-right text-zinc-300">
                        {inv.quantity}
                      </td>
                      <td className="text-right text-zinc-400">
                        {skylineFormatCashFR(Number(inv.avg_buy_price))}
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

function RawMaterialPurchaseCard({
  companyId,
  materialId,
  name,
  glyph,
  refBuyPrice,
  cash,
}: {
  companyId: string;
  materialId: string;
  name: string;
  glyph: string;
  refBuyPrice: number;
  cash: number;
}) {
  const [quantity, setQuantity] = useState(100);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cost = quantity * refBuyPrice;
  const canAfford = cash >= cost;

  const handleBuy = () => {
    if (!canAfford || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("material_id", materialId);
    fd.set("quantity", String(quantity));
    startTransition(async () => {
      const res = await purchaseRawMaterialAction(fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-200">
          {glyph} {name}
        </div>
        <div className="text-xs tabular-nums text-zinc-400">
          {skylineFormatCashFR(refBuyPrice)} /u
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={100000}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-orange-400/50"
        />
        <button
          onClick={handleBuy}
          disabled={!canAfford || pending}
          className="flex-1 rounded-md border border-orange-400/50 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-200 transition-colors hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-40"
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

function ProductionTab({
  inventory,
  recipe,
  machines,
}: {
  company: SkylineCompanyRow;
  inventory: SkylineInventoryRow[];
  recipe: FactoryRecipeMeta;
  machines: SkylineMachineRow[];
  employees: SkylineEmployeeRow[];
}) {
  const totalCapacity = machines.reduce(
    (s, m) => s + Number(m.capacity_per_day),
    0,
  );
  const outputId = recipe.output.id;
  const outputStock = inventory.find((i) => i.product_id === outputId);
  const intermedMeta = SKYLINE_INTERMEDIATE_PRODUCTS[outputId];
  const productMeta = SKYLINE_PRODUCTS[outputId];
  const meta = intermedMeta ?? productMeta;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-orange-400/40 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-orange-200">
          🏭 Production automatique
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          Tant que tu as des matières premières en stock et au moins une machine,
          la production tourne automatiquement. Recettes par jour selon ta
          capacité totale machines.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Capacité totale"
            value={`${totalCapacity.toLocaleString("fr-FR")}/jour`}
            accent="text-orange-200"
          />
          <Stat
            label="Machines"
            value={String(machines.length)}
            accent="text-zinc-200"
          />
          <Stat
            label={`Stock ${meta?.name ?? outputId}`}
            value={String(outputStock?.quantity ?? 0)}
            accent="text-emerald-200"
          />
        </div>

        <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs">
          <div className="text-zinc-400">Recette</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {recipe.inputs.map((inp, i) => {
              const m =
                SKYLINE_RAW_MATERIALS[inp.id as SkylineRawMaterialId] ??
                SKYLINE_INTERMEDIATE_PRODUCTS[inp.id];
              return (
                <span
                  key={i}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-zinc-300"
                >
                  {m?.glyph} {inp.qty} × {m?.name ?? inp.id}
                </span>
              );
            })}
            <span className="text-zinc-500">→</span>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-emerald-200">
              {meta?.glyph} {recipe.output.qty} × {meta?.name ?? outputId}
            </span>
          </div>
        </div>

        {totalCapacity === 0 ? (
          <div className="mt-3 rounded-md border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-200">
            ⚠️ Aucune machine installée. Va dans l&apos;onglet{" "}
            <strong>Machines</strong> pour démarrer la production.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-base font-semibold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  );
}

function MachinesTab({
  companyId,
  machineKind,
  machines,
  cash,
}: {
  companyId: string;
  machineKind: string;
  machines: SkylineMachineRow[];
  cash: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">
          ⚙️ Acheter une machine
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          Plus la machine est haut de gamme, plus elle produit en volume — mais
          elle exige des employés avec compétence Utilisation machines plus élevée.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SKYLINE_MACHINE_LEVELS.map((lvl) => (
            <MachineCard
              key={lvl.id}
              companyId={companyId}
              kind={machineKind}
              level={lvl.id}
              levelName={lvl.name}
              skillRequired={lvl.skillRequired}
              multiplier={lvl.multiplier}
              cash={cash}
            />
          ))}
        </div>
      </div>

      {machines.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">
            Mes machines ({machines.length})
          </h3>
          <ul className="mt-3 space-y-1 text-xs">
            {machines.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <span className="text-zinc-200">
                  ⚙️ {m.kind} · niveau {m.level}
                </span>
                <span className="text-zinc-400 tabular-nums">
                  {m.capacity_per_day}/jour · état {m.condition}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const MACHINE_COSTS: Record<string, Record<SkylineMachineLevel, number>> = {
  moulin: { basic: 8000, pro: 30000, elite: 120000, hightech: 500000 },
  boulangerie_indus: {
    basic: 20000,
    pro: 80000,
    elite: 250000,
    hightech: 800000,
  },
  brasserie: { basic: 30000, pro: 100000, elite: 400000, hightech: 1500000 },
  viticole: { basic: 15000, pro: 60000, elite: 200000, hightech: 800000 },
  distillerie: { basic: 25000, pro: 100000, elite: 350000, hightech: 1200000 },
  abattoir: { basic: 50000, pro: 200000, elite: 800000, hightech: 3000000 },
  laiterie: { basic: 20000, pro: 80000, elite: 300000, hightech: 1000000 },
  chocolaterie: { basic: 15000, pro: 60000, elite: 200000, hightech: 700000 },
  conserverie: { basic: 30000, pro: 120000, elite: 400000, hightech: 1500000 },
};

function MachineCard({
  companyId,
  kind,
  level,
  levelName,
  skillRequired,
  multiplier,
  cash,
}: {
  companyId: string;
  kind: string;
  level: SkylineMachineLevel;
  levelName: string;
  skillRequired: number;
  multiplier: string;
  cash: number;
}) {
  const cost = MACHINE_COSTS[kind]?.[level] ?? 0;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canAfford = cash >= cost;

  const handleBuy = () => {
    if (!canAfford || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("kind", kind);
    fd.set("level", level);
    startTransition(async () => {
      const res = await buyMachineAction(fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-100">
          ⚙️ {levelName} ({multiplier})
        </div>
        <div className="text-xs text-zinc-400">
          Comp. ≥ {skillRequired}
        </div>
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

function MarketTab({
  companyId,
  inventory,
  cash,
}: {
  companyId: string;
  inventory: SkylineInventoryRow[];
  cash: number;
}) {
  const sellable = inventory.filter((i) => i.quantity > 0);
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-200">
        📈 Marché B2B (commun multijoueur)
      </h3>
      <p className="mt-1 text-xs text-zinc-400">
        Pose des ordres d&apos;achat ou de vente sur le marché commun.
        Le prix est dynamique selon offre/demande globale (P6).
      </p>
      {sellable.length === 0 ? (
        <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          Aucun stock à vendre. Produis ou achète d&apos;abord.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {sellable.map((inv) => (
            <MarketSellRow key={inv.id} companyId={companyId} inv={inv} />
          ))}
        </div>
      )}
      <div className="mt-4">
        <Link
          href="/play/skyline/marche"
          className="text-xs text-cyan-300 hover:text-cyan-200"
        >
          → Voir les cours produits sur le Marché commun
        </Link>
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">
        Cash dispo : {skylineFormatCashFR(cash)}
      </p>
    </div>
  );
}

function MarketSellRow({
  companyId,
  inv,
}: {
  companyId: string;
  inv: SkylineInventoryRow;
}) {
  const intermed = SKYLINE_INTERMEDIATE_PRODUCTS[inv.product_id];
  const product = SKYLINE_PRODUCTS[inv.product_id];
  const mat = SKYLINE_RAW_MATERIALS[inv.product_id as SkylineRawMaterialId];
  const meta = intermed ?? product ?? mat;
  const [qty, setQty] = useState(Math.min(inv.quantity, 100));
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSell = () => {
    if (pending || qty <= 0 || qty > inv.quantity) return;
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("side", "sell");
    fd.set("product_id", inv.product_id);
    fd.set("quantity", String(qty));
    startTransition(async () => {
      const res = await placeMarketOrderAction(fd);
      if (res.ok) {
        const d = res.data as { price?: number; total?: number };
        setResult(
          `Vendu ${qty}× à ${d?.price?.toFixed(2) ?? "?"}$ → +${skylineFormatCashFR(
            d?.total ?? 0,
          )}`,
        );
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
      <div className="min-w-[200px] flex-1">
        <div className="text-zinc-200">
          {meta?.glyph} {meta?.name ?? inv.product_id}
        </div>
        <div className="text-[10px] text-zinc-500">
          Stock {inv.quantity} · Coût moy.{" "}
          {skylineFormatCashFR(Number(inv.avg_buy_price))}
        </div>
      </div>
      <input
        type="number"
        min={1}
        max={inv.quantity}
        value={qty}
        onChange={(e) =>
          setQty(Math.max(1, Math.min(inv.quantity, Number(e.target.value))))
        }
        className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-right text-zinc-100 outline-none tabular-nums focus:border-cyan-400/50"
      />
      <button
        onClick={handleSell}
        disabled={pending || qty <= 0 || qty > inv.quantity}
        className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
      >
        {pending ? "..." : "Vendre marché"}
      </button>
      {result ? (
        <div className="w-full text-[10px] text-emerald-300">{result}</div>
      ) : null}
      {error ? (
        <div className="w-full text-[10px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Onglets P8 : MATIÈRES PREMIÈRES (RAW)
// ──────────────────────────────────────────────────────────────────

type RawSectorMeta = (typeof SKYLINE_RAW_SECTORS)[SkylineRawSector];

function RawStocksTab({
  inventory,
  sectorMeta,
}: {
  companyId: string;
  inventory: SkylineInventoryRow[];
  sectorMeta: RawSectorMeta;
}) {
  const outputId = sectorMeta.output;
  const outputStock = inventory.find((i) => i.product_id === outputId);
  const matMeta = SKYLINE_RAW_MATERIALS[outputId];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-emerald-400/40 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-emerald-200">
          📦 Production accumulée
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          Cette source produit directement {matMeta?.name}. Le stock s&apos;accumule
          tant que les machines tournent. Vends sur le marché B2B.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              Stock {matMeta?.name}
            </div>
            <div className="mt-1 text-2xl font-semibold text-emerald-200 tabular-nums">
              {(outputStock?.quantity ?? 0).toLocaleString("fr-FR")}
            </div>
            <div className="text-[10px] text-zinc-500">
              Coût moyen{" "}
              {skylineFormatCashFR(Number(outputStock?.avg_buy_price ?? 0))}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              Prix de référence marché
            </div>
            <div className="mt-1 text-2xl font-semibold text-cyan-200 tabular-nums">
              {skylineFormatCashFR(matMeta?.refBuyPrice ?? 0)}
            </div>
            <div className="text-[10px] text-zinc-500">
              Indicatif — le marché commun fait fluctuer
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExtractionTab({
  inventory,
  sectorMeta,
  machines,
}: {
  inventory: SkylineInventoryRow[];
  sectorMeta: RawSectorMeta;
  machines: SkylineMachineRow[];
}) {
  const totalCapacity = machines.reduce(
    (s, m) => s + Number(m.capacity_per_day),
    0,
  );
  const matMeta = SKYLINE_RAW_MATERIALS[sectorMeta.output];
  const outputStock = inventory.find((i) => i.product_id === sectorMeta.output);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-emerald-400/40 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-emerald-200">
          🌾 Production primaire
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          Pas d&apos;inputs. Les machines extraient la matière directement.
          Plus tu mets de capacité, plus tu produis en volume — base solide pour
          tout l&apos;empire vertical.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Capacité totale"
            value={`${totalCapacity.toLocaleString("fr-FR")}/jour`}
            accent="text-emerald-200"
          />
          <Stat
            label="Machines"
            value={String(machines.length)}
            accent="text-zinc-200"
          />
          <Stat
            label={`Stock ${matMeta?.name}`}
            value={(outputStock?.quantity ?? 0).toLocaleString("fr-FR")}
            accent="text-cyan-200"
          />
        </div>

        <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs">
          <div className="text-zinc-400">Production directe</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-emerald-200">
              {matMeta?.glyph} {matMeta?.name}
            </span>
            <span className="text-zinc-500">
              · {sectorMeta.machineKind === "agri" ? "agricole" :
                 sectorMeta.machineKind === "livestock" ? "élevage" :
                 sectorMeta.machineKind === "forestry" ? "sylviculture" :
                 sectorMeta.machineKind === "mining" ? "extraction minière" :
                 sectorMeta.machineKind === "oil" ? "extraction pétrolière" : ""}
            </span>
          </div>
        </div>

        {totalCapacity === 0 ? (
          <div className="mt-3 rounded-md border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-200">
            ⚠️ Aucune machine installée. Va dans l&apos;onglet{" "}
            <strong>Machines</strong> pour démarrer la production.
          </div>
        ) : null}
      </div>
    </div>
  );
}

const RAW_MACHINE_COSTS: Record<
  string,
  Record<SkylineMachineLevel, number>
> = {
  agri: { basic: 25000, pro: 100000, elite: 400000, hightech: 1500000 },
  livestock: { basic: 30000, pro: 120000, elite: 500000, hightech: 2000000 },
  forestry: { basic: 40000, pro: 150000, elite: 600000, hightech: 2500000 },
  mining: { basic: 200000, pro: 1000000, elite: 5000000, hightech: 25000000 },
  oil: { basic: 5000000, pro: 30000000, elite: 200000000, hightech: 1000000000 },
};

function RawMachinesTab({
  companyId,
  machineKind,
  machines,
  cash,
}: {
  companyId: string;
  machineKind: string;
  machines: SkylineMachineRow[];
  cash: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">
          ⚙️ Machines {machineKind}
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          Plus la machine est haut de gamme, plus elle extrait en volume — mais
          elle exige des employés avec compétence Utilisation machines plus élevée.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SKYLINE_MACHINE_LEVELS.map((lvl) => (
            <RawMachineCard
              key={lvl.id}
              companyId={companyId}
              kind={machineKind}
              level={lvl.id}
              levelName={lvl.name}
              skillRequired={lvl.skillRequired}
              multiplier={lvl.multiplier}
              cash={cash}
            />
          ))}
        </div>
      </div>

      {machines.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">
            Mes machines ({machines.length})
          </h3>
          <ul className="mt-3 space-y-1 text-xs">
            {machines.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <span className="text-zinc-200">
                  ⚙️ {m.kind} · niveau {m.level}
                </span>
                <span className="text-zinc-400 tabular-nums">
                  {m.capacity_per_day}/jour · état {m.condition}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function RawMachineCard({
  companyId,
  kind,
  level,
  levelName,
  skillRequired,
  multiplier,
  cash,
}: {
  companyId: string;
  kind: string;
  level: SkylineMachineLevel;
  levelName: string;
  skillRequired: number;
  multiplier: string;
  cash: number;
}) {
  const cost = RAW_MACHINE_COSTS[kind]?.[level] ?? 0;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canAfford = cash >= cost;

  const handleBuy = () => {
    if (!canAfford || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("level", level);
    startTransition(async () => {
      const res = await buyRawMachineAction(fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-100">
          ⚙️ {levelName} ({multiplier})
        </div>
        <div className="text-xs text-zinc-400">
          Comp. ≥ {skillRequired}
        </div>
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
// Onglet P7 : BOURSE (IPO + dividendes pour le fondateur)
// ──────────────────────────────────────────────────────────────────

function BourseTab({
  companyId,
  companyName,
  share,
  isOwner,
  cash,
}: {
  companyId: string;
  companyName: string;
  share: ShareInfo;
  isOwner: boolean;
  cash: number;
}) {
  if (!share) {
    return (
      <NotListedView
        companyId={companyId}
        companyName={companyName}
        isOwner={isOwner}
      />
    );
  }
  return (
    <ListedView
      companyId={companyId}
      share={share}
      isOwner={isOwner}
      cash={cash}
    />
  );
}

function NotListedView({
  companyId,
  companyName,
  isOwner,
}: {
  companyId: string;
  companyName: string;
  isOwner: boolean;
}) {
  const [totalShares, setTotalShares] = useState(1000000);
  const [keepPct, setKeepPct] = useState(60);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleIPO = () => {
    if (pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("total_shares", String(totalShares));
    fd.set("keep_pct", String(keepPct));
    startTransition(async () => {
      const res = await ipoCompanyAction(fd);
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  };

  return (
    <div className="rounded-xl border border-purple-400/40 bg-black/40 p-4">
      <h3 className="text-sm font-semibold text-purple-200">
        📈 Introduction en bourse (IPO)
      </h3>
      <p className="mt-1 text-xs text-zinc-400">
        Introduis {companyName} en bourse pour récupérer du cash en vendant des
        actions. Valorisation requise &gt; 5M$ (basée sur trésorerie + revenus
        × 12 + actifs).
      </p>

      {!isOwner ? (
        <div className="mt-3 rounded-md border border-zinc-400/30 bg-zinc-500/5 p-3 text-xs text-zinc-400">
          Seul le fondateur peut introduire son entreprise en bourse.
        </div>
      ) : done ? (
        <div className="mt-3 rounded-md border border-emerald-400/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          ✓ IPO réussie. Recharge la page pour voir la cotation.
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                Nombre total d&apos;actions
              </label>
              <input
                type="number"
                min={100000}
                max={100000000}
                step={100000}
                value={totalShares}
                onChange={(e) =>
                  setTotalShares(Math.max(0, Number(e.target.value)))
                }
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/50"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                Tu gardes (%)
              </label>
              <input
                type="number"
                min={30}
                max={90}
                value={keepPct}
                onChange={(e) =>
                  setKeepPct(Math.max(30, Math.min(90, Number(e.target.value))))
                }
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/50"
              />
              <div className="mt-1 text-[10px] text-zinc-500">
                Tu vends donc {100 - keepPct}% au marché
              </div>
            </div>
          </div>
          <button
            onClick={handleIPO}
            disabled={pending}
            className="mt-3 w-full rounded-md border border-purple-400/50 bg-purple-500/15 px-4 py-2 text-sm font-semibold text-purple-100 transition-colors hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Introduction..." : "📈 Introduire en bourse"}
          </button>
          {error ? (
            <div className="mt-2 text-xs text-rose-300">{error}</div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ListedView({
  companyId,
  share,
  isOwner,
  cash,
}: {
  companyId: string;
  share: NonNullable<ShareInfo>;
  isOwner: boolean;
  cash: number;
}) {
  const drift =
    ((Number(share.current_price) - Number(share.ipo_price)) /
      Number(share.ipo_price)) *
    100;
  const [divAmount, setDivAmount] = useState(10000);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleDividend = () => {
    if (pending || divAmount <= 0 || divAmount > cash) return;
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("amount", String(divAmount));
    startTransition(async () => {
      const res = await payDividendAction(fd);
      if (res.ok) {
        const d = res.data as {
          per_share?: number;
          total_paid?: number;
          holders?: number;
        };
        setResult(
          `✓ ${skylineFormatCashFR(d?.total_paid ?? 0)} versés à ${d?.holders ?? 0} actionnaire(s) (${(
            d?.per_share ?? 0
          ).toFixed(4)}$/action)`,
        );
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-purple-400/40 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-purple-200">
          🏛️ Cotation actuelle
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Cours actuel"
            value={skylineFormatCashFR(Number(share.current_price))}
            accent="text-purple-200"
          />
          <Stat
            label="Prix IPO"
            value={skylineFormatCashFR(Number(share.ipo_price))}
            accent="text-zinc-300"
          />
          <Stat
            label="Capitalisation"
            value={skylineFormatCashFR(Number(share.market_cap))}
            accent="text-emerald-200"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              Drift vs IPO
            </div>
            <div
              className={`mt-1 text-base font-semibold tabular-nums ${
                drift >= 0 ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {drift >= 0 ? "+" : ""}
              {drift.toFixed(2)}%
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              Actions totales
            </div>
            <div className="mt-1 text-base text-zinc-200 tabular-nums">
              {Number(share.total_shares).toLocaleString("fr-FR")}
            </div>
          </div>
        </div>
      </div>

      {isOwner ? (
        <div className="rounded-xl border border-amber-400/40 bg-black/40 p-4">
          <h3 className="text-sm font-semibold text-amber-200">
            💰 Verser un dividende
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Ce montant est réparti au prorata du nombre d&apos;actions détenues
            par chaque actionnaire (toi inclus). Bon pour ta réputation et
            attractif pour les investisseurs.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1000}
              max={Math.floor(cash)}
              step={1000}
              value={divAmount}
              onChange={(e) => setDivAmount(Math.max(0, Number(e.target.value)))}
              className="w-32 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-amber-400/50"
            />
            <span className="text-[11px] text-zinc-500">
              ÷ {Number(share.total_shares).toLocaleString("fr-FR")} actions
            </span>
            <button
              onClick={handleDividend}
              disabled={pending || divAmount <= 0 || divAmount > cash}
              className="ml-auto rounded-md border border-amber-400/50 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "..." : "Verser"}
            </button>
          </div>
          {result ? (
            <div className="mt-2 text-xs text-emerald-300">{result}</div>
          ) : null}
          {error ? (
            <div className="mt-2 text-xs text-rose-300">{error}</div>
          ) : null}
        </div>
      ) : null}

      <div className="text-xs text-zinc-500">
        →{" "}
        <Link
          href="/play/skyline/bourse"
          className="text-purple-300 hover:text-purple-200"
        >
          Voir la bourse complète
        </Link>{" "}
        pour acheter/vendre des actions.
      </div>
    </div>
  );
}
