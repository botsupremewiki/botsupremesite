"use client";

import { useState, useTransition } from "react";
import {
  skylineFormatCashFR,
  type SkylineCompanyRow,
  type SkylineLoanOfferRow,
} from "@shared/skyline";
import type { PotentialBorrower } from "../_lib/supabase-helpers";
import { offerLoanAction } from "../_lib/actions";

function rateForScore(score: number): number {
  if (score >= 800) return 0.04;
  if (score >= 600) return 0.07;
  if (score >= 400) return 0.10;
  if (score >= 200) return 0.14;
  return 0.18;
}

export function BanqueProView({
  banks,
  borrowers,
  offered,
  cash,
}: {
  banks: SkylineCompanyRow[];
  borrowers: PotentialBorrower[];
  offered: SkylineLoanOfferRow[];
  cash: number;
}) {
  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            🏦 Banque pro — prêts à risque
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            En tant que propriétaire d&apos;une banque commerciale, tu peux
            proposer des prêts directement aux autres joueurs. Ils choisissent
            d&apos;accepter ou non. Tu profites des intérêts mais tu prends le
            risque de défaut.
          </p>
        </div>

        {banks.length === 0 ? (
          <div className="rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            Tu n&apos;as pas de banque commerciale. Crée-en une (200M$) pour
            accéder à cette fonctionnalité.
          </div>
        ) : (
          <BankActions banks={banks} borrowers={borrowers} cash={cash} />
        )}

        {offered.length > 0 ? (
          <section className="rounded-xl border border-cyan-400/40 bg-black/40 p-4">
            <h2 className="text-sm font-semibold text-cyan-200">
              📤 Offres en cours ({offered.length})
            </h2>
            <ul className="mt-3 space-y-1 text-xs">
              {offered.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-1.5"
                >
                  <span className="text-zinc-300">
                    {skylineFormatCashFR(Number(o.amount_initial))} à{" "}
                    {(Number(o.rate) * 100).toFixed(1)}% sur{" "}
                    {Number(o.duration_months) / 12} ans
                  </span>
                  <span
                    className={`text-[10px] ${
                      o.status === "active"
                        ? "text-emerald-300"
                        : "text-amber-300"
                    }`}
                  >
                    {o.status === "active" ? "✓ Acceptée" : "⏳ En attente"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function BankActions({
  banks,
  borrowers,
  cash,
}: {
  banks: SkylineCompanyRow[];
  borrowers: PotentialBorrower[];
  cash: number;
}) {
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [borrowerId, setBorrowerId] = useState(borrowers[0]?.user_id ?? "");
  const [amount, setAmount] = useState(100000);
  const [rate, setRate] = useState(0.1);
  const [duration, setDuration] = useState(60);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const selectedBorrower = borrowers.find((b) => b.user_id === borrowerId);
  const suggestedRate = selectedBorrower
    ? rateForScore(selectedBorrower.credit_score)
    : 0.1;

  const handleOffer = () => {
    if (pending || !bankId || !borrowerId || amount <= 0 || rate <= 0) return;
    if (cash < amount) {
      setError("Cash insuffisant pour ce prêt");
      return;
    }
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("lender_company_id", bankId);
    fd.set("borrower_user_id", borrowerId);
    fd.set("amount", String(amount));
    fd.set("rate", String(rate));
    fd.set("duration_months", String(duration));
    startTransition(async () => {
      const res = await offerLoanAction(fd);
      if (res.ok) {
        setResult("✓ Offre envoyée. À l'emprunteur d'accepter.");
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <section className="rounded-xl border border-cyan-400/40 bg-black/40 p-4">
      <h2 className="text-sm font-semibold text-cyan-200">
        Proposer un prêt
      </h2>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
            Banque émettrice
          </label>
          <select
            value={bankId}
            onChange={(e) => setBankId(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
          >
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
            Emprunteur
          </label>
          <select
            value={borrowerId}
            onChange={(e) => setBorrowerId(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
          >
            {borrowers.map((b) => (
              <option key={b.user_id} value={b.user_id}>
                {b.username} (score {b.credit_score})
              </option>
            ))}
          </select>
          {selectedBorrower ? (
            <div className="mt-1 text-[10px] text-zinc-500 tabular-nums">
              Patrimoine{" "}
              {skylineFormatCashFR(selectedBorrower.net_worth)} · taux suggéré{" "}
              {(suggestedRate * 100).toFixed(1)}%
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
            Montant ($)
          </label>
          <input
            type="number"
            min={1000}
            step={1000}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50 tabular-nums"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
            Taux annuel (%)
          </label>
          <input
            type="number"
            step={0.5}
            min={1}
            max={30}
            value={(rate * 100).toFixed(1)}
            onChange={(e) => setRate(Number(e.target.value) / 100)}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50 tabular-nums"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
            Durée
          </label>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
          >
            <option value={60}>5 ans</option>
            <option value={120}>10 ans</option>
            <option value={180}>15 ans</option>
            <option value={240}>20 ans</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleOffer}
        disabled={pending || !bankId || !borrowerId || cash < amount}
        className="mt-3 w-full rounded-md border border-cyan-400/50 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Envoi..." : `📤 Envoyer offre (${skylineFormatCashFR(amount)})`}
      </button>
      {result ? (
        <div className="mt-2 text-xs text-emerald-300">{result}</div>
      ) : null}
      {error ? (
        <div className="mt-2 text-xs text-rose-300">{error}</div>
      ) : null}
    </section>
  );
}
