"use client";

/**
 * CommandPalette : Cmd+K / Ctrl+K pour ouvrir une palette de
 * navigation rapide. Liste statique d'actions (pages, raccourcis).
 *
 * Le composant écoute le hotkey et se rend lui-même quand ouvert.
 * À placer une seule fois dans le layout /play.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { useFocusTrap } from "@/lib/a11y";

type Cmd = {
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: string;
  keywords?: string;
};

const COMMANDS: Cmd[] = [
  { id: "plaza", label: "Plaza", hint: "Aller à la plaza centrale", href: "/play", icon: "🏛️", keywords: "home accueil" },
  { id: "tcg-pokemon", label: "TCG Pokémon", hint: "Hub Pokémon TCG", href: "/play/tcg/pokemon", icon: "🃏" },
  { id: "tcg-boosters", label: "Boosters Pokémon", hint: "Ouvrir des packs", href: "/play/tcg/pokemon/boosters", icon: "🎴" },
  { id: "tcg-collection", label: "Ma Collection Pokémon", hint: "Voir mes cartes", href: "/play/tcg/pokemon/collection", icon: "📚" },
  { id: "tcg-decks", label: "Mes Decks", hint: "Construire / partager", href: "/play/tcg/pokemon/decks", icon: "🛠️" },
  { id: "tcg-bot", label: "Match vs Bot", hint: "Combat entraînement", href: "/play/tcg/pokemon/battle/bot", icon: "🤖" },
  { id: "tcg-pvp", label: "Match PvP libre", hint: "Affronter un joueur", href: "/play/tcg/pokemon/battle/pvp", icon: "🆚" },
  { id: "tcg-ranked", label: "Match classé", hint: "PvP avec ELO", href: "/play/tcg/pokemon/battle/ranked", icon: "🏆" },
  { id: "tcg-history", label: "Historique de combat", hint: "Mes 100 derniers matchs", href: "/play/tcg/pokemon/battle/history", icon: "📜" },
  { id: "tcg-stats", label: "Stats / ELO", hint: "Mon profil de combat", href: "/play/tcg/pokemon/battle/stats", icon: "📊" },
  { id: "tcg-seasons", label: "Saisons ranked", hint: "Classement + récompenses", href: "/play/tcg/pokemon/seasons", icon: "📅" },
  { id: "tcg-tournaments", label: "Tournois", hint: "Brackets élimination", href: "/play/tcg/pokemon/tournaments", icon: "🏟️" },
  { id: "tcg-quests", label: "Quêtes journalières", hint: "5 défis quotidiens", href: "/play/tcg/pokemon/quests", icon: "🎯" },
  { id: "tcg-bp", label: "Battle Pass", hint: "50 niveaux saison", href: "/play/tcg/pokemon/battle-pass", icon: "🎫" },
  { id: "tcg-meta", label: "Méta global", hint: "Stats agrégées site", href: "/play/tcg/pokemon/meta", icon: "📈" },
  { id: "tcg-replays", label: "Replays", hint: "Mes 50 derniers logs", href: "/play/tcg/pokemon/replays", icon: "🎬" },
  { id: "tcg-trade", label: "Échange de cartes", hint: "Proposer / accepter", href: "/play/tcg/pokemon/trade", icon: "🤝" },
  { id: "tcg-wonder", label: "Pioche Mystère", hint: "Cristaux → carte aléatoire", href: "/play/tcg/pokemon/wonder-pick", icon: "🎲" },
  { id: "tcg-starter", label: "Starter decks", hint: "Decks préfabriqués", href: "/play/tcg/pokemon/starter-decks", icon: "🎴" },
  { id: "tcg-auto", label: "Auto-deckbuilder", hint: "IA construit ton deck", href: "/play/tcg/pokemon/auto-deck", icon: "🤖" },
  { id: "tcg-tutorial", label: "Tutoriel TCG", hint: "8 étapes guidées", href: "/play/tcg/pokemon/tutorial", icon: "🎓" },
  { id: "objectifs", label: "Objectifs", hint: "Daily reward + achievements", href: "/play/objectifs", icon: "🎁" },
  { id: "amis", label: "Amis", hint: "Liste / demandes", href: "/play/amis", icon: "🤝" },
  { id: "profil", label: "Mon profil", hint: "Stats privées", href: "/play/profil", icon: "👤" },
  { id: "cosmetics", label: "Cosmétiques", hint: "Titre + bordure", href: "/play/profil/cosmetics", icon: "✨" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  // Hotkey : Cmd+K ou Ctrl+K.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? COMMANDS.filter((c) =>
        `${c.label} ${c.hint} ${c.keywords ?? ""}`
          .toLowerCase()
          .includes(q),
      )
    : COMMANDS;

  function go(c: Cmd) {
    setOpen(false);
    router.push(c.href);
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-start justify-center bg-black/60 p-4 pt-[20vh]"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Palette de commandes"
        >
          <motion.div
            ref={trapRef}
            initial={{ scale: 0.97, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-3">
              <Search size={18} aria-hidden="true" className="text-zinc-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(filtered.length - 1, a + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(0, a - 1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const c = filtered[active];
                    if (c) go(c);
                  }
                }}
                placeholder="Rechercher une page…"
                className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                aria-label="Rechercher"
              />
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">
                Esc
              </kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  Aucun résultat
                </div>
              ) : (
                filtered.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(c)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      i === active
                        ? "bg-amber-300/15 text-amber-100"
                        : "text-zinc-200 hover:bg-white/5"
                    }`}
                  >
                    <span aria-hidden="true" className="text-lg">
                      {c.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{c.label}</div>
                      <div className="truncate text-[11px] text-zinc-500">
                        {c.hint}
                      </div>
                    </div>
                    {i === active ? (
                      <kbd className="rounded border border-amber-300/40 bg-amber-300/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                        ↵
                      </kbd>
                    ) : null}
                  </button>
                ))
              )}
            </div>
            <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-3 py-1.5 text-[10px] text-zinc-500">
              <span>Navigation rapide</span>
              <span>
                <kbd className="mr-1 rounded border border-white/10 bg-white/5 px-1">
                  ↑↓
                </kbd>{" "}
                pour naviguer
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
