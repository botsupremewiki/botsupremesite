"use client";

import { useState, useTransition } from "react";
import {
  type SkylineCompanyRow,
  type SkylineLoanRow,
  skylineFormatCashFR,
} from "@shared/skyline";
import { repayLoanAction, requestLoanAction } from "../_lib/actions";

function rateForCreditScore(score: number): number {
  if (score >= 800) return 0.04;
  if (score >= 600) return 0.07;
  if (score >= 400) return 0.10;
  if (score >= 200) return 0.14;
  return 0.18;
}

function monthlyPayment(amount: number, rate: number, months: number): number {
  if (rate === 0) return amount / months;
  return (amount * (rate / 12)) / (1 - Math.pow(1 + rate / 12, -months));
}

export function BanqueView({
  cash,
  creditScore,
  netWorth,
  bankruptcyPending,
  loans,
  companies,
  hasUsedStarterLoan,
}: {
  cash: number;
  creditScore: number;
  netWorth: number;
  bankruptcyPending: boolean;
  loans: SkylineLoanRow[];
  companies: SkylineCompanyRow[];
  hasUsedStarterLoan: boolean;
}) {
  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">🏦 Banque</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Demander un prêt, suivre tes mensualités, surveiller ton score de
            crédit.
          </p>
        </div>

        {bankruptcyPending ? (
          <div className="rounded-md border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            🚨 <strong>Faillite imminente</strong> — ton compte est sous
            -10% de ton patrimoine. Tu as 7 jours jeu (7h réelles) pour
            redresser, sinon procédure de saisie progressive.
          </div>
        ) : null}

        {/* Stats banque */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Cash"
            value={skylineFormatCashFR(cash)}
            accent="text-emerald-200"
          />
          <Stat
            label="Patrimoine total"
            value={skylineFormatCashFR(netWorth)}
            accent="text-pink-200"
          />
          <CreditScoreStat score={creditScore} />
        </div>

        {/* Demande de prêt */}
        <LoanRequestForm
          creditScore={creditScore}
          companies={companies}
          hasUsedStarterLoan={hasUsedStarterLoan}
        />

        {/* Prêts en cours */}
        <section className="rounded-xl border border-white/10 bg-black/40 p-4">
          <h2 className="text-sm font-semibold text-zinc-200">
            Prêts en cours ({loans.length})
          </h2>
          {loans.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              Aucun prêt actif. Demande-en un pour booster ton entreprise.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {loans.map((l) => (
                <LoanCard key={l.id} loan={l} cash={cash} />
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
    <div className="rounded-xl border border-white/10 bg-black/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  );
}

function CreditScoreStat({ score }: { score: number }) {
  const rating =
    score >= 800
      ? { label: "Excellent", color: "text-emerald-200" }
      : score >= 600
      ? { label: "Bon", color: "text-emerald-300" }
      : score >= 400
      ? { label: "Moyen", color: "text-amber-200" }
      : score >= 200
      ? { label: "Faible", color: "text-orange-300" }
      : { label: "Mauvais", color: "text-rose-300" };
  const rate = rateForCreditScore(score);
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        Score crédit
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${rating.color}`}>
        {score} <span className="text-xs">· {rating.label}</span>
      </div>
      <div className="text-[10px] text-zinc-500">
        Taux estimé : <span className="text-zinc-300 tabular-nums">{(rate * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}

function LoanRequestForm({
  creditScore,
  companies,
  hasUsedStarterLoan,
}: {
  creditScore: number;
  companies: SkylineCompanyRow[];
  hasUsedStarterLoan: boolean;
}) {
  const [amount, setAmount] = useState(20000);
  const [years, setYears] = useState(10);
  const [companyId, setCompanyId] = useState<string>("");
  const [isStarter, setIsStarter] = useState(!hasUsedStarterLoan);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { msg: string; kind: "ok" | "err" } | null
  >(null);

  const months = years * 12;
  const rate = isStarter ? 0.08 : rateForCreditScore(creditScore);
  const monthlyPmt = monthlyPayment(amount, rate, months);
  const totalCost = monthlyPmt * months;

  const handleSubmit = () => {
    if (pending) return;
    setResult(null);
    if (isStarter && amount > 40000) {
      setResult({ msg: "Prêt création max 40 000$", kind: "err" });
      return;
    }
    const fd = new FormData();
    fd.set("amount", String(amount));
    fd.set("duration_months", String(months));
    if (companyId) fd.set("company_id", companyId);
    if (isStarter) fd.set("is_starter", "on");
    startTransition(async () => {
      const res = await requestLoanAction(fd);
      if (res.ok) {
        setResult({
          msg: `Prêt accordé : ${skylineFormatCashFR(amount)} crédités.`,
          kind: "ok",
        });
      } else {
        setResult({ msg: res.error, kind: "err" });
      }
    });
  };

  return (
    <section className="rounded-xl border border-cyan-400/40 bg-black/40 p-4">
      <h2 className="text-base font-semibold text-cyan-200">
        Nouvelle demande de prêt
      </h2>

      {!hasUsedStarterLoan ? (
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 p-3">
          <input
            type="checkbox"
            checked={isStarter}
            onChange={(e) => setIsStarter(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <div className="text-sm font-semibold text-amber-200">
              ✨ Prêt création débutant
            </div>
            <div className="text-[10px] text-amber-300/80">
              Max 40 000$ · taux 8% fixe · sans apport · 1× seulement.
            </div>
          </div>
        </label>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
            Montant ($)
          </label>
          <input
            type="number"
            min={1000}
            max={isStarter ? 40000 : 10000000}
            step={1000}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
            Durée (années)
          </label>
          <select
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
          >
            <option value={5}>5 ans</option>
            <option value={10}>10 ans</option>
            <option value={15}>15 ans</option>
            <option value={20}>20 ans</option>
          </select>
        </div>
      </div>

      {companies.length > 0 ? (
        <div className="mt-3">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
            Affecter à (optionnel)
          </label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
          >
            <option value="">Prêt personnel</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs tabular-nums">
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="text-[10px] text-zinc-500">Taux</div>
          <div className="text-zinc-300">{(rate * 100).toFixed(1)}%</div>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="text-[10px] text-zinc-500">Mensualité</div>
          <div className="text-amber-200">
            {skylineFormatCashFR(monthlyPmt)}
          </div>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="text-[10px] text-zinc-500">Total à rembourser</div>
          <div className="text-zinc-300">{skylineFormatCashFR(totalCost)}</div>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={pending || amount <= 0}
        className="mt-3 w-full rounded-md border border-cyan-400/50 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Demande en cours..." : "Demander le prêt"}
      </button>
      {result ? (
        <div
          className={`mt-2 rounded-md border p-2 text-xs ${
            result.kind === "ok"
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          {result.msg}
        </div>
      ) : null}
    </section>
  );
}

function LoanCard({ loan, cash }: { loan: SkylineLoanRow; cash: number }) {
  const [repayAmount, setRepayAmount] = useState(
    Math.min(Number(loan.amount_remaining), 1000),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const remaining = Number(loan.amount_remaining);
  const initial = Number(loan.amount_initial);
  const progress = ((initial - remaining) / initial) * 100;

  const handleRepay = () => {
    if (pending || repayAmount <= 0 || repayAmount > cash) return;
    setError(null);
    const fd = new FormData();
    fd.set("loan_id", loan.id);
    fd.set("amount", String(repayAmount));
    startTransition(async () => {
      const res = await repayLoanAction(fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-200">
          {loan.is_starter_loan ? "✨ Prêt création" : "💵 Prêt"} ·{" "}
          {skylineFormatCashFR(initial)} initial
        </div>
        <div className="text-xs text-zinc-400 tabular-nums">
          {(Number(loan.rate) * 100).toFixed(1)}% · {loan.duration_months / 12} ans
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500 tabular-nums">
        <span>Remboursé {progress.toFixed(0)}%</span>
        <span>Restant {skylineFormatCashFR(remaining)}</span>
      </div>
      <div className="mt-1 text-[10px] text-zinc-500">
        Mensualité {skylineFormatCashFR(Number(loan.monthly_payment))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={Math.min(cash, remaining)}
          value={repayAmount}
          onChange={(e) => setRepayAmount(Math.max(0, Number(e.target.value)))}
          className="w-28 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-cyan-400/50"
        />
        <button
          onClick={handleRepay}
          disabled={pending || repayAmount <= 0 || repayAmount > cash}
          className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "..." : "Rembourser"}
        </button>
      </div>
      {error ? (
        <div className="mt-1 text-[10px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}
