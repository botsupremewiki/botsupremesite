"use client";

import { useState } from "react";
import { skylineFormatCashFR } from "@shared/skyline";
import type { LeaderboardEntry } from "../_lib/supabase-helpers";

type Tab = "net_worth" | "monthly_profit" | "market_cap_total";

export function ClassementView({
  byNetWorth,
  byProfit,
  byMarketCap,
  currentUserId,
}: {
  byNetWorth: LeaderboardEntry[];
  byProfit: LeaderboardEntry[];
  byMarketCap: LeaderboardEntry[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState<Tab>("net_worth");

  const list =
    tab === "net_worth"
      ? byNetWorth
      : tab === "monthly_profit"
      ? byProfit
      : byMarketCap;

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">🏆 Classements</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Top 50 des magnats Skyline. Mis à jour à chaque visite (ton score
            se rafraîchit automatiquement).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton current={tab} value="net_worth" onClick={setTab}>
            💎 Patrimoine
          </TabButton>
          <TabButton current={tab} value="monthly_profit" onClick={setTab}>
            💰 Profit mensuel
          </TabButton>
          <TabButton current={tab} value="market_cap_total" onClick={setTab}>
            📈 Capitalisation
          </TabButton>
        </div>

        <section className="rounded-xl border border-white/10 bg-black/40 p-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-white/5">
                  <th className="py-2 text-left">#</th>
                  <th className="text-left">Joueur</th>
                  <th className="text-right">Patrimoine</th>
                  <th className="text-right">Profit/mois</th>
                  <th className="text-right">Capi. bourse</th>
                  <th className="text-right">Boîtes</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-zinc-500"
                    >
                      Pas encore de joueurs Skyline classés. Sois le premier !
                    </td>
                  </tr>
                ) : (
                  list.map((entry, i) => {
                    const isMe = entry.user_id === currentUserId;
                    return (
                      <tr
                        key={entry.user_id}
                        className={`border-b border-white/5 ${
                          isMe ? "bg-cyan-500/5" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        <td className="py-2 text-zinc-300">
                          {i === 0
                            ? "🥇"
                            : i === 1
                            ? "🥈"
                            : i === 2
                            ? "🥉"
                            : i + 1}
                        </td>
                        <td className="text-left">
                          <span
                            className={
                              isMe
                                ? "text-cyan-200 font-semibold"
                                : "text-zinc-200"
                            }
                          >
                            {entry.username}
                          </span>
                          {isMe ? (
                            <span className="ml-2 text-[10px] text-cyan-400">
                              (toi)
                            </span>
                          ) : null}
                        </td>
                        <td className="text-right text-emerald-300">
                          {skylineFormatCashFR(entry.net_worth)}
                        </td>
                        <td
                          className={`text-right ${
                            entry.monthly_profit >= 0
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }`}
                        >
                          {entry.monthly_profit >= 0 ? "+" : ""}
                          {skylineFormatCashFR(entry.monthly_profit)}
                        </td>
                        <td className="text-right text-purple-300">
                          {skylineFormatCashFR(entry.market_cap_total)}
                        </td>
                        <td className="text-right text-zinc-300">
                          {entry.companies_count}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
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
          ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100"
          : "border-white/10 bg-black/40 text-zinc-400 hover:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}
