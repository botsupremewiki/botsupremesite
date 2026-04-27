"use client";

import { useState, useTransition } from "react";
import {
  skylineFormatCashFR,
  type SkylineCompanyRow,
  type SkylineHoldingRow,
} from "@shared/skyline";
import {
  createHoldingAction,
  holdingTransferCashAction,
  linkCompanyToHoldingAction,
  unlinkCompanyFromHoldingAction,
} from "../_lib/actions";

export function HoldingsView({
  holdings,
  holdingsLinks,
  companies,
}: {
  holdings: SkylineHoldingRow[];
  holdingsLinks: Record<string, string[]>;
  companies: SkylineCompanyRow[];
}) {
  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">🏛️ Holdings</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Une holding regroupe plusieurs entreprises pour centraliser ta
            trésorerie et transférer du cash librement entre filiales.
            Débloquée à partir de 5 entreprises.
          </p>
        </div>

        <CreateHoldingForm canCreate={companies.length >= 5} companyCount={companies.length} />

        {holdings.length === 0 ? (
          <div className="rounded-md border border-zinc-400/30 bg-zinc-500/5 p-3 text-xs text-zinc-400">
            Aucune holding. Crée-en une ci-dessus pour regrouper tes entreprises.
          </div>
        ) : (
          <div className="space-y-4">
            {holdings.map((h) => (
              <HoldingCard
                key={h.id}
                holding={h}
                linkedCompanyIds={holdingsLinks[h.id] ?? []}
                companies={companies}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function CreateHoldingForm({
  canCreate,
  companyCount,
}: {
  canCreate: boolean;
  companyCount: number;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleCreate = () => {
    if (!canCreate || pending || !name.trim()) return;
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    startTransition(async () => {
      const res = await createHoldingAction(fd);
      if (res.ok) setName("");
      else setError(res.error);
    });
  };

  return (
    <section className="rounded-xl border border-purple-400/40 bg-black/40 p-4">
      <h2 className="text-sm font-semibold text-purple-200">
        Créer une holding
      </h2>
      {!canCreate ? (
        <p className="mt-2 text-xs text-zinc-400">
          Tu dois posséder au moins 5 entreprises (actuel : {companyCount}).
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder="Nom de la holding (ex : Skyline Group)"
            className="flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/50"
          />
          <button
            onClick={handleCreate}
            disabled={pending || !name.trim()}
            className="rounded-md border border-purple-400/50 bg-purple-500/15 px-4 py-2 text-sm font-semibold text-purple-100 transition-colors hover:bg-purple-500/25 disabled:opacity-40"
          >
            {pending ? "..." : "Créer"}
          </button>
        </div>
      )}
      {error ? (
        <div className="mt-2 text-xs text-rose-300">{error}</div>
      ) : null}
    </section>
  );
}

function HoldingCard({
  holding,
  linkedCompanyIds,
  companies,
}: {
  holding: SkylineHoldingRow;
  linkedCompanyIds: string[];
  companies: SkylineCompanyRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const linked = companies.filter((c) => linkedCompanyIds.includes(c.id));
  const unlinked = companies.filter((c) => !linkedCompanyIds.includes(c.id));

  const handleLink = (companyId: string) => {
    if (pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("holding_id", holding.id);
    fd.set("company_id", companyId);
    startTransition(async () => {
      const res = await linkCompanyToHoldingAction(fd);
      if (!res.ok) setError(res.error);
    });
  };

  const handleUnlink = (companyId: string) => {
    if (pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("holding_id", holding.id);
    fd.set("company_id", companyId);
    startTransition(async () => {
      const res = await unlinkCompanyFromHoldingAction(fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
      <h3 className="text-base font-semibold text-zinc-100">🏛️ {holding.name}</h3>
      <div className="text-[10px] text-zinc-500">
        {linked.length} entreprise(s) liée(s)
      </div>

      {linked.length > 0 ? (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Filiales
          </div>
          <ul className="mt-2 space-y-1 text-xs">
            {linked.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-1.5"
              >
                <span className="text-zinc-200">
                  {c.name}{" "}
                  <span className="text-zinc-500">· {c.sector}</span>
                </span>
                <button
                  onClick={() => handleUnlink(c.id)}
                  disabled={pending}
                  className="text-[10px] text-rose-300 hover:text-rose-200 disabled:opacity-40"
                >
                  Délier
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unlinked.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-zinc-400">
            + Lier une entreprise ({unlinked.length} dispo)
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
            {unlinked.map((c) => (
              <button
                key={c.id}
                onClick={() => handleLink(c.id)}
                disabled={pending}
                className="rounded border border-white/10 bg-white/[0.02] px-3 py-1 text-left text-zinc-300 hover:bg-white/[0.05] disabled:opacity-40"
              >
                + {c.name} <span className="text-zinc-500">({c.sector})</span>
              </button>
            ))}
          </div>
        </details>
      ) : null}

      {linked.length >= 2 ? (
        <TransferForm holding={holding} linkedCompanies={linked} />
      ) : null}

      {error ? (
        <div className="mt-2 text-[10px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}

function TransferForm({
  holding,
  linkedCompanies,
}: {
  holding: SkylineHoldingRow;
  linkedCompanies: SkylineCompanyRow[];
}) {
  const [from, setFrom] = useState(linkedCompanies[0].id);
  const [to, setTo] = useState(linkedCompanies[1]?.id ?? linkedCompanies[0].id);
  const [amount, setAmount] = useState(1000);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleTransfer = () => {
    if (pending || amount <= 0 || from === to) return;
    setError(null);
    setSuccess(false);
    const fd = new FormData();
    fd.set("holding_id", holding.id);
    fd.set("from_company", from);
    fd.set("to_company", to);
    fd.set("amount", String(amount));
    startTransition(async () => {
      const res = await holdingTransferCashAction(fd);
      if (res.ok) setSuccess(true);
      else setError(res.error);
    });
  };

  return (
    <div className="mt-4 rounded-md border border-amber-400/40 bg-amber-500/5 p-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        Transfert de cash entre filiales
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-amber-400/50"
        >
          {linkedCompanies.map((c) => (
            <option key={c.id} value={c.id}>
              De : {c.name}
            </option>
          ))}
        </select>
        <select
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-amber-400/50"
        >
          {linkedCompanies.map((c) => (
            <option key={c.id} value={c.id}>
              Vers : {c.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-amber-400/50 tabular-nums"
        />
      </div>
      <button
        onClick={handleTransfer}
        disabled={pending || from === to || amount <= 0}
        className="mt-2 w-full rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
      >
        {pending
          ? "Transfert..."
          : `Transférer ${skylineFormatCashFR(amount)}`}
      </button>
      {success ? (
        <div className="mt-1 text-[10px] text-emerald-300">✓ Transfert effectué</div>
      ) : null}
      {error ? (
        <div className="mt-1 text-[10px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}
