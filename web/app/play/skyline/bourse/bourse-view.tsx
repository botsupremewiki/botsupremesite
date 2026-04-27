"use client";

import { useState, useTransition } from "react";
import { skylineFormatCashFR } from "@shared/skyline";
import { placeShareOrderAction } from "../_lib/actions";

type Listed = {
  id: string;
  company_id: string;
  total_shares: number;
  ipo_price: number;
  current_price: number;
  market_cap: number;
  ipo_at: string | null;
  is_listed: boolean;
  company_name: string;
  company_sector: string;
  company_user_id: string;
};

type Holding = {
  user_id: string;
  company_id: string;
  shares: number;
  avg_buy_price: number;
  company_name?: string;
  current_price?: number;
};

export function BourseView({
  listed,
  holdings,
  cash,
  userId,
}: {
  listed: Listed[];
  holdings: Holding[];
  cash: number;
  userId: string;
}) {
  const totalPortfolio = holdings.reduce(
    (s, h) => s + Number(h.shares) * Number(h.current_price ?? 0),
    0,
  );
  const totalCost = holdings.reduce(
    (s, h) => s + Number(h.shares) * Number(h.avg_buy_price),
    0,
  );
  const pnl = totalPortfolio - totalCost;

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">📈 Bourse Skyline</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Cotations des entreprises introduites en bourse. Ordres au prix
            marché, dividendes versés par les fondateurs. P7 — version simplifiée.
          </p>
        </div>

        {/* Portefeuille */}
        <section className="rounded-xl border border-purple-400/40 bg-black/40 p-4">
          <h2 className="text-sm font-semibold text-purple-200">
            💼 Mon portefeuille ({holdings.length} positions)
          </h2>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Cash dispo"
              value={skylineFormatCashFR(cash)}
              accent="text-emerald-200"
            />
            <Stat
              label="Valeur portefeuille"
              value={skylineFormatCashFR(totalPortfolio)}
              accent="text-purple-200"
            />
            <Stat
              label="P&L latent"
              value={`${pnl >= 0 ? "+" : ""}${skylineFormatCashFR(pnl)}`}
              accent={pnl >= 0 ? "text-emerald-300" : "text-rose-300"}
            />
          </div>
          {holdings.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-zinc-500">
                  <tr className="border-b border-white/5">
                    <th className="py-2 text-left">Entreprise</th>
                    <th className="text-right">Actions</th>
                    <th className="text-right">Coût moyen</th>
                    <th className="text-right">Cours actuel</th>
                    <th className="text-right">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => {
                    const cost = Number(h.shares) * Number(h.avg_buy_price);
                    const value =
                      Number(h.shares) * Number(h.current_price ?? 0);
                    const hPnl = value - cost;
                    return (
                      <tr key={h.company_id} className="border-b border-white/5">
                        <td className="py-2 text-zinc-200">
                          {h.company_name ?? h.company_id}
                        </td>
                        <td className="text-right text-zinc-300">{h.shares}</td>
                        <td className="text-right text-zinc-400">
                          {skylineFormatCashFR(Number(h.avg_buy_price))}
                        </td>
                        <td className="text-right text-zinc-100">
                          {skylineFormatCashFR(Number(h.current_price ?? 0))}
                        </td>
                        <td
                          className={`text-right ${
                            hPnl >= 0 ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {hPnl >= 0 ? "+" : ""}
                          {skylineFormatCashFR(hPnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">
              Aucune position. Achète des actions ci-dessous.
            </p>
          )}
        </section>

        {/* Cotations */}
        <section className="rounded-xl border border-white/10 bg-black/40 p-4">
          <h2 className="text-sm font-semibold text-zinc-200">
            🏛️ Entreprises cotées ({listed.length})
          </h2>
          {listed.length === 0 ? (
            <p className="mt-3 text-xs text-zinc-500">
              Aucune entreprise cotée pour l&apos;instant. Quand une entreprise
              avec valorisation &gt; 5M$ est introduite en bourse (depuis sa
              propre vue), elle apparaît ici.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {listed.map((l) => (
                <ListedCard
                  key={l.id}
                  listed={l}
                  cash={cash}
                  isFounder={l.company_user_id === userId}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
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
      <div className={`mt-1 text-lg font-semibold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  );
}

function ListedCard({
  listed,
  cash,
  isFounder,
}: {
  listed: Listed;
  cash: number;
  isFounder: boolean;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState(10);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = qty * Number(listed.current_price);
  const drift =
    ((Number(listed.current_price) - Number(listed.ipo_price)) /
      Number(listed.ipo_price)) *
    100;

  const handleSubmit = () => {
    if (pending || qty <= 0) return;
    if (side === "buy" && total > cash) {
      setError("Cash insuffisant");
      return;
    }
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("company_id", listed.company_id);
    fd.set("side", side);
    fd.set("quantity", String(qty));
    startTransition(async () => {
      const res = await placeShareOrderAction(fd);
      if (res.ok) {
        const d = res.data as { price?: number; total?: number; shares?: number };
        setResult(
          `✓ ${side === "buy" ? "Acheté" : "Vendu"} ${d?.shares ?? qty} @ ${skylineFormatCashFR(
            d?.price ?? 0,
          )} = ${skylineFormatCashFR(d?.total ?? 0)}`,
        );
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-zinc-100">
            🏛️ {listed.company_name}
            {isFounder ? (
              <span className="ml-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                Fondateur
              </span>
            ) : null}
          </div>
          <div className="text-[10px] text-zinc-500">{listed.company_sector}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-purple-200 tabular-nums">
            {skylineFormatCashFR(Number(listed.current_price))}
          </div>
          <div
            className={`text-[10px] tabular-nums ${
              drift >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {drift >= 0 ? "+" : ""}
            {drift.toFixed(1)}% vs IPO ({skylineFormatCashFR(Number(listed.ipo_price))})
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] tabular-nums text-zinc-500 sm:grid-cols-3">
        <div>
          Capi.{" "}
          <span className="text-zinc-300">
            {skylineFormatCashFR(Number(listed.market_cap))}
          </span>
        </div>
        <div>
          Actions totales{" "}
          <span className="text-zinc-300">{listed.total_shares.toLocaleString("fr-FR")}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <button
            onClick={() => setSide("buy")}
            className={`rounded-md border px-3 py-1 text-xs font-semibold ${
              side === "buy"
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 bg-white/[0.02] text-zinc-400"
            }`}
          >
            Acheter
          </button>
          <button
            onClick={() => setSide("sell")}
            className={`rounded-md border px-3 py-1 text-xs font-semibold ${
              side === "sell"
                ? "border-rose-400/50 bg-rose-500/15 text-rose-200"
                : "border-white/10 bg-white/[0.02] text-zinc-400"
            }`}
          >
            Vendre
          </button>
        </div>
        <input
          type="number"
          min={1}
          max={1000000}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/50"
        />
        <span className="text-xs tabular-nums text-zinc-400">
          Total : {skylineFormatCashFR(total)}
        </span>
        <button
          onClick={handleSubmit}
          disabled={pending || qty <= 0}
          className="ml-auto rounded-md border border-purple-400/50 bg-purple-500/15 px-3 py-1 text-xs font-semibold text-purple-200 transition-colors hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "..." : `Passer l'ordre`}
        </button>
      </div>
      {result ? (
        <div className="mt-2 text-[11px] text-emerald-300">{result}</div>
      ) : null}
      {error ? (
        <div className="mt-2 text-[11px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}
