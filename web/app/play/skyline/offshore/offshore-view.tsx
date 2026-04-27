"use client";

import { useState, useTransition } from "react";
import {
  SKYLINE_OS_TO_DOLLARS_CAP_PER_DAY,
  SKYLINE_SHELL_WEEKLY_CAP,
  skylineDollarsToOS,
  skylineOSToDollars,
  skylineFormatCashFR,
  type SkylineOffshoreLogRow,
} from "@shared/skyline";
import {
  pontInverseAction,
  pontShellAction,
  pontWireAction,
} from "../_lib/actions";

type LastResult = {
  msg: string;
  kind: "ok" | "err" | "audit";
} | null;

export function OffshoreView({
  cash,
  os,
  osToDollarsToday,
  shellDollarsThisWeek,
  log,
}: {
  cash: number;
  os: number;
  osToDollarsToday: number;
  shellDollarsThisWeek: number;
  log: SkylineOffshoreLogRow[];
}) {
  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            🪙 Pont $ ↔ OS
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Convertir tes dollars Skyline en Or Suprême (et inversement). Le pont
            est le seul lien entre Skyline et les autres univers.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-400/40 bg-black/40 p-4">
            <div className="text-[11px] uppercase tracking-widest text-zinc-400">
              Cash Skyline
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-200 tabular-nums">
              {skylineFormatCashFR(cash)}
            </div>
          </div>
          <div className="rounded-xl border border-amber-400/40 bg-black/40 p-4">
            <div className="text-[11px] uppercase tracking-widest text-zinc-400">
              Or Suprême
            </div>
            <div className="mt-1 text-2xl font-bold text-amber-200 tabular-nums">
              {os.toLocaleString("fr-FR")} OS
            </div>
          </div>
        </div>

        {/* Ponts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WireBridge cash={cash} />
          <ShellBridge
            cash={cash}
            shellDollarsThisWeek={shellDollarsThisWeek}
          />
        </div>

        <InverseBridge os={os} osToDollarsToday={osToDollarsToday} />

        {/* Historique */}
        {log.length > 0 ? (
          <section className="rounded-xl border border-white/10 bg-black/40 p-4">
            <h2 className="text-sm font-semibold text-zinc-200">
              Historique des conversions
            </h2>
            <ul className="mt-3 space-y-1 text-xs">
              {log.map((l) => {
                const audited = l.was_audited;
                const methodLabel =
                  l.method === "wire"
                    ? "Virement bancaire"
                    : l.method === "shell"
                    ? "Société écran"
                    : "Inverse OS → $";
                return (
                  <li
                    key={l.id}
                    className={`flex items-center justify-between gap-2 rounded border px-3 py-2 ${
                      audited
                        ? "border-rose-400/30 bg-rose-500/5"
                        : "border-white/5 bg-white/[0.02]"
                    }`}
                  >
                    <div>
                      <div className="text-zinc-200">
                        {audited ? "🚨 " : ""}
                        {methodLabel}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {new Date(l.created_at).toLocaleString("fr-FR")}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      {l.method === "os_to_dollars" ? (
                        <span className="text-emerald-300">
                          +{skylineFormatCashFR(Number(l.dollars_out))}
                        </span>
                      ) : audited ? (
                        <span className="text-rose-300">
                          AUDITÉ · -{skylineFormatCashFR(Number(l.fine_amount))}
                        </span>
                      ) : (
                        <span className="text-amber-300">
                          +{l.os_out} OS
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function WireBridge({ cash }: { cash: number }) {
  const [dollars, setDollars] = useState(1000);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LastResult>(null);
  const preview = skylineDollarsToOS(dollars, "wire");

  const handleSubmit = () => {
    if (pending || dollars <= 0 || dollars > cash) return;
    setResult(null);
    const fd = new FormData();
    fd.set("dollars", String(dollars));
    startTransition(async () => {
      const res = await pontWireAction(fd);
      if (res.ok) {
        setResult({
          msg: `Virement réussi : ${res.data} OS reçus.`,
          kind: "ok",
        });
      } else {
        setResult({ msg: res.error, kind: "err" });
      }
    });
  };

  return (
    <div className="rounded-xl border border-emerald-400/40 bg-black/40 p-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🏦</span>
        <div>
          <div className="text-base font-semibold text-emerald-200">
            Virement bancaire
          </div>
          <div className="text-[11px] text-zinc-500">
            Légal · taxe 60% · aucun risque
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs tabular-nums">
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="text-[10px] text-zinc-500">Taux</div>
          <div className="text-zinc-300">1$ → 0.001 OS</div>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="text-[10px] text-zinc-500">Cap</div>
          <div className="text-zinc-300">Illimité</div>
        </div>
      </div>
      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-widest text-zinc-500">
          Montant à convertir ($)
        </label>
        <input
          type="number"
          min={1}
          max={Math.floor(cash)}
          value={dollars}
          onChange={(e) => setDollars(Math.max(0, Number(e.target.value)))}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/50"
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-zinc-500">
            Taxe : {skylineFormatCashFR(preview.taxedDollars)}
          </span>
          <span className="font-semibold text-amber-200">
            → {preview.receivedOS} OS
          </span>
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={pending || dollars <= 0 || dollars > cash}
        className="mt-3 w-full rounded-md border border-emerald-400/50 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Virement en cours..." : "Effectuer le virement"}
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
    </div>
  );
}

function ShellBridge({
  cash,
  shellDollarsThisWeek,
}: {
  cash: number;
  shellDollarsThisWeek: number;
}) {
  const [dollars, setDollars] = useState(1000);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LastResult>(null);
  const preview = skylineDollarsToOS(dollars, "shell");
  const remainingCap = SKYLINE_SHELL_WEEKLY_CAP - shellDollarsThisWeek;
  const overCap = dollars > remainingCap;

  const handleSubmit = () => {
    if (pending || dollars <= 0 || dollars > cash || overCap) return;
    setResult(null);
    const fd = new FormData();
    fd.set("dollars", String(dollars));
    startTransition(async () => {
      const res = await pontShellAction(fd);
      if (res.ok) {
        const d = res.data as {
          os_received: number;
          was_audited: boolean;
          fine: number;
        };
        if (d.was_audited) {
          setResult({
            msg: `🚨 AUDIT FISCAL — ta tentative de conversion a été saisie. Amende : ${skylineFormatCashFR(
              d.fine,
            )}.`,
            kind: "audit",
          });
        } else {
          setResult({
            msg: `Conversion réussie : ${d.os_received} OS reçus.`,
            kind: "ok",
          });
        }
      } else {
        setResult({ msg: res.error, kind: "err" });
      }
    });
  };

  return (
    <div className="rounded-xl border border-amber-400/40 bg-black/40 p-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🌴</span>
        <div>
          <div className="text-base font-semibold text-amber-200">
            Société écran (offshore)
          </div>
          <div className="text-[11px] text-zinc-500">
            Taxe 20% · risque audit 5% · cap hebdo
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs tabular-nums">
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="text-[10px] text-zinc-500">Taux</div>
          <div className="text-zinc-300">1$ → 0.005 OS</div>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="text-[10px] text-zinc-500">Restant cette semaine</div>
          <div className="text-zinc-300">
            {skylineFormatCashFR(Math.max(0, remainingCap))}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-widest text-zinc-500">
          Montant à convertir ($)
        </label>
        <input
          type="number"
          min={1}
          max={Math.min(cash, remainingCap)}
          value={dollars}
          onChange={(e) => setDollars(Math.max(0, Number(e.target.value)))}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400/50"
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-zinc-500">
            Taxe : {skylineFormatCashFR(preview.taxedDollars)}
          </span>
          <span className="font-semibold text-amber-200">
            → {preview.receivedOS} OS
          </span>
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={pending || dollars <= 0 || dollars > cash || overCap}
        className="mt-3 w-full rounded-md border border-amber-400/50 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Conversion en cours..." : "Convertir via société écran"}
      </button>
      {result ? (
        <div
          className={`mt-2 rounded-md border p-2 text-xs ${
            result.kind === "audit"
              ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
              : result.kind === "ok"
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          {result.msg}
        </div>
      ) : null}
    </div>
  );
}

function InverseBridge({
  os,
  osToDollarsToday,
}: {
  os: number;
  osToDollarsToday: number;
}) {
  const [osAmount, setOSAmount] = useState(1);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LastResult>(null);
  const dollars = skylineOSToDollars(osAmount);
  const remainingCap = SKYLINE_OS_TO_DOLLARS_CAP_PER_DAY - osToDollarsToday;
  const overCap = osAmount > remainingCap;

  const handleSubmit = () => {
    if (pending || osAmount <= 0 || osAmount > os || overCap) return;
    setResult(null);
    const fd = new FormData();
    fd.set("os", String(osAmount));
    startTransition(async () => {
      const res = await pontInverseAction(fd);
      if (res.ok) {
        setResult({
          msg: `Conversion réussie : +${skylineFormatCashFR(Number(res.data))} reçus.`,
          kind: "ok",
        });
      } else {
        setResult({ msg: res.error, kind: "err" });
      }
    });
  };

  return (
    <div className="rounded-xl border border-pink-400/40 bg-black/40 p-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">↩️</span>
        <div>
          <div className="text-base font-semibold text-pink-200">
            Inverse : OS → $
          </div>
          <div className="text-[11px] text-zinc-500">
            Pour démarrer ou relancer après faillite. Cap{" "}
            {SKYLINE_OS_TO_DOLLARS_CAP_PER_DAY} OS / jour.
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs tabular-nums">
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="text-[10px] text-zinc-500">Taux</div>
          <div className="text-zinc-300">1 OS → 500$</div>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="text-[10px] text-zinc-500">Restant aujourd&apos;hui</div>
          <div className="text-zinc-300">{Math.max(0, remainingCap)} OS</div>
        </div>
      </div>
      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-widest text-zinc-500">
          Quantité d&apos;OS à convertir
        </label>
        <input
          type="number"
          min={1}
          max={Math.min(os, remainingCap)}
          value={osAmount}
          onChange={(e) => setOSAmount(Math.max(0, Number(e.target.value)))}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-pink-400/50"
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-zinc-500">
            {osAmount} OS
          </span>
          <span className="font-semibold text-emerald-200">
            → +{skylineFormatCashFR(dollars)}
          </span>
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={pending || osAmount <= 0 || osAmount > os || overCap}
        className="mt-3 w-full rounded-md border border-pink-400/50 bg-pink-500/15 px-4 py-2 text-sm font-semibold text-pink-100 transition-colors hover:bg-pink-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Conversion en cours..." : "Convertir OS → $"}
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
    </div>
  );
}
