"use client";

import Link from "next/link";

export type CombatNavMode = "bot" | "pvp" | "ranked" | "history" | "stats";

const ITEMS: { mode: CombatNavMode; label: string; sub: string }[] = [
  { mode: "bot", label: "🤖", sub: "Bot" },
  { mode: "pvp", label: "🆚", sub: "PvP" },
  { mode: "ranked", label: "🏆", sub: "Classé" },
  { mode: "history", label: "📜", sub: "Historique" },
  { mode: "stats", label: "📊", sub: "Stats" },
];

export function CombatNav({
  gameId,
  current,
}: {
  gameId: string;
  current: CombatNavMode;
}) {
  return (
    <nav className="flex flex-wrap gap-1.5">
      {ITEMS.map((it) => {
        const active = it.mode === current;
        return (
          <Link
            key={it.mode}
            href={`/play/tcg/${gameId}/battle/${it.mode}`}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
              active
                ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
                : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
            }`}
          >
            <span>{it.label}</span>
            <span>{it.sub}</span>
          </Link>
        );
      })}
    </nav>
  );
}
