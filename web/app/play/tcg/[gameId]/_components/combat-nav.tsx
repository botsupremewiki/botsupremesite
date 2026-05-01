"use client";

import Link from "next/link";
import {
  Bot,
  Swords,
  Trophy,
  ScrollText,
  BarChart3,
  Calendar,
  Tent,
  Target,
  Ticket,
  TrendingUp,
  Film,
  Handshake,
  type LucideIcon,
} from "lucide-react";

export type CombatNavMode =
  | "bot"
  | "pvp"
  | "ranked"
  | "history"
  | "stats"
  | "seasons"
  | "tournaments"
  | "quests"
  | "meta"
  | "replays"
  | "battle-pass"
  | "trade";

const ITEMS: { mode: CombatNavMode; Icon: LucideIcon; sub: string }[] = [
  { mode: "bot", Icon: Bot, sub: "Bot" },
  { mode: "pvp", Icon: Swords, sub: "PvP" },
  { mode: "ranked", Icon: Trophy, sub: "Classé" },
  { mode: "history", Icon: ScrollText, sub: "Historique" },
  { mode: "stats", Icon: BarChart3, sub: "Stats" },
  { mode: "seasons", Icon: Calendar, sub: "Saisons" },
  { mode: "tournaments", Icon: Tent, sub: "Tournois" },
  { mode: "quests", Icon: Target, sub: "Quêtes" },
  { mode: "battle-pass", Icon: Ticket, sub: "Pass" },
  { mode: "meta", Icon: TrendingUp, sub: "Méta" },
  { mode: "replays", Icon: Film, sub: "Replays" },
  { mode: "trade", Icon: Handshake, sub: "Trade" },
];

export function CombatNav({
  gameId,
  current,
}: {
  gameId: string;
  current: CombatNavMode;
}) {
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Navigation combat">
      {ITEMS.map((it) => {
        const active = it.mode === current;
        const Icon = it.Icon;
        const href =
          it.mode === "trade"
            ? `/play/tcg/${gameId}/trade`
            : it.mode === "seasons"
              ? `/play/tcg/${gameId}/seasons`
              : it.mode === "tournaments"
                ? `/play/tcg/${gameId}/tournaments`
                : it.mode === "quests"
                  ? `/play/tcg/${gameId}/quests`
                  : it.mode === "meta"
                    ? `/play/tcg/${gameId}/meta`
                    : it.mode === "replays"
                      ? `/play/tcg/${gameId}/replays`
                      : it.mode === "battle-pass"
                        ? `/play/tcg/${gameId}/battle-pass`
                        : `/play/tcg/${gameId}/battle/${it.mode}`;
        return (
          <Link
            key={it.mode}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
              active
                ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
                : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
            }`}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{it.sub}</span>
          </Link>
        );
      })}
    </nav>
  );
}
