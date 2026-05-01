"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function HistoryFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [opponent, setOpponent] = useState(params.get("opponent") ?? "");
  const [deck, setDeck] = useState(params.get("deck") ?? "");
  const [outcome, setOutcome] = useState<"all" | "wins" | "losses">(
    (params.get("outcome") as "all" | "wins" | "losses" | null) ?? "all",
  );
  const [mode, setMode] = useState<"all" | "ranked" | "fun">(
    (params.get("mode") as "all" | "ranked" | "fun" | null) ?? "all",
  );
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  function apply() {
    const sp = new URLSearchParams();
    if (opponent.trim()) sp.set("opponent", opponent.trim());
    if (deck.trim()) sp.set("deck", deck.trim());
    if (outcome !== "all") sp.set("outcome", outcome);
    if (mode !== "all") sp.set("mode", mode);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    startTransition(() => {
      router.push(sp.size > 0 ? `?${sp.toString()}` : `?`);
    });
  }

  function reset() {
    setOpponent("");
    setDeck("");
    setOutcome("all");
    setMode("all");
    setFrom("");
    setTo("");
    startTransition(() => router.push("?"));
  }

  const hasFilters =
    opponent || deck || outcome !== "all" || mode !== "all" || from || to;

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Adversaire
          </div>
          <input
            type="text"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="Pseudo…"
            className="mt-0.5 w-32 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-amber-300/40"
          />
        </label>
        <label className="block">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Deck
          </div>
          <input
            type="text"
            value={deck}
            onChange={(e) => setDeck(e.target.value)}
            placeholder="Nom de deck…"
            className="mt-0.5 w-32 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-amber-300/40"
          />
        </label>
        <label className="block">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Résultat
          </div>
          <select
            value={outcome}
            onChange={(e) =>
              setOutcome(e.target.value as "all" | "wins" | "losses")
            }
            className="mt-0.5 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100"
          >
            <option value="all">Tous</option>
            <option value="wins">Victoires</option>
            <option value="losses">Défaites</option>
          </select>
        </label>
        <label className="block">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Mode
          </div>
          <select
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as "all" | "ranked" | "fun")
            }
            className="mt-0.5 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100"
          >
            <option value="all">Tous</option>
            <option value="ranked">Classé</option>
            <option value="fun">Fun</option>
          </select>
        </label>
        <label className="block">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Du
          </div>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100"
          />
        </label>
        <label className="block">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Au
          </div>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-0.5 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100"
          />
        </label>
        <button
          type="button"
          onClick={apply}
          className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
        >
          🔎 Filtrer
        </button>
        {hasFilters ? (
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/10"
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}
