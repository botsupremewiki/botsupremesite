"use client";

import type { PokemonCardData, PokemonEnergyType, TcgRarity } from "@shared/types";

// Tier numérique pour le tri par rareté (du plus commun au plus rare).
export const RARITY_TIER: Record<TcgRarity, number> = {
  promo: 0,
  "diamond-1": 1,
  "diamond-2": 2,
  "diamond-3": 3,
  "diamond-4": 4,
  "star-1": 5,
  "star-2": 6,
  "star-3": 7,
  crown: 8,
};

// Glyph affiché à côté de la carte / dans les filtres.
export const RARITY_GLYPH: Record<TcgRarity, string> = {
  promo: "·",
  "diamond-1": "◆",
  "diamond-2": "◆◆",
  "diamond-3": "◆◆◆",
  "diamond-4": "◆◆◆◆",
  "star-1": "★",
  "star-2": "★★",
  "star-3": "★★★",
  crown: "👑",
};

// Label FR humain.
export const RARITY_LABEL: Record<TcgRarity, string> = {
  promo: "Sans rareté",
  "diamond-1": "Commune ◆",
  "diamond-2": "Peu commune ◆◆",
  "diamond-3": "Rare ◆◆◆",
  "diamond-4": "Rare ex ◆◆◆◆",
  "star-1": "Full Art ★",
  "star-2": "Full Art ★★",
  "star-3": "Immersive ★★★",
  crown: "Couronne 👑",
};

// Border + glow Tailwind pour souligner la rareté autour d'une carte.
export const RARITY_COLOR: Record<TcgRarity, string> = {
  promo: "border-zinc-500/40 text-zinc-200",
  "diamond-1": "border-zinc-500/40 text-zinc-200",
  "diamond-2": "border-emerald-400/40 text-emerald-200",
  "diamond-3": "border-sky-400/60 text-sky-200",
  "diamond-4":
    "border-amber-300/70 text-amber-100 shadow-[0_0_24px_rgba(252,211,77,0.45)]",
  "star-1":
    "border-fuchsia-400/70 text-fuchsia-100 shadow-[0_0_24px_rgba(232,121,249,0.45)]",
  "star-2":
    "border-rose-400/70 text-rose-100 shadow-[0_0_28px_rgba(251,113,133,0.5)]",
  "star-3":
    "border-orange-300/80 text-orange-100 shadow-[0_0_36px_rgba(253,186,116,0.6)]",
  crown:
    "border-yellow-200/90 text-yellow-50 shadow-[0_0_44px_rgba(254,240,138,0.7)]",
};

export const TYPE_GLYPH: Record<PokemonEnergyType, string> = {
  fire: "🔥",
  water: "💧",
  grass: "🍃",
  lightning: "⚡",
  psychic: "🌀",
  fighting: "👊",
  darkness: "🌑",
  metal: "⚙️",
  dragon: "🐉",
  fairy: "🧚",
  colorless: "⭐",
};

export const TYPE_BG: Record<PokemonEnergyType, string> = {
  fire: "from-orange-500/30 to-red-700/40",
  water: "from-blue-400/30 to-blue-700/40",
  grass: "from-emerald-400/30 to-emerald-700/40",
  lightning: "from-yellow-400/30 to-yellow-600/40",
  psychic: "from-fuchsia-400/30 to-purple-700/40",
  fighting: "from-amber-700/30 to-stone-700/40",
  darkness: "from-zinc-700/40 to-slate-900/60",
  metal: "from-slate-300/20 to-slate-500/30",
  dragon: "from-amber-400/30 to-violet-700/40",
  fairy: "from-pink-300/30 to-rose-500/40",
  colorless: "from-zinc-300/20 to-zinc-500/30",
};

export const TYPE_LABEL_FR: Record<PokemonEnergyType, string> = {
  fire: "Feu",
  water: "Eau",
  grass: "Plante",
  lightning: "Électrique",
  psychic: "Psy",
  fighting: "Combat",
  darkness: "Obscurité",
  metal: "Métal",
  dragon: "Dragon",
  fairy: "Fée",
  colorless: "Incolore",
};

export function CardSlot({
  card,
  count,
  onClick,
}: {
  card: PokemonCardData;
  count: number;
  onClick?: () => void;
}) {
  const owned = count > 0;
  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col gap-1 rounded-xl border bg-black/40 p-2 transition-opacity ${
        owned ? RARITY_COLOR[card.rarity] : "border-white/5 opacity-30"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <CardFace card={card} faded={!owned} />
      {count > 1 && (
        <div className="absolute right-2 top-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 shadow">
          ×{count}
        </div>
      )}
    </div>
  );
}

/** Affiche la vraie carte officielle (image full-card tcgdex en FR).
 *  HP, attaques, faiblesse, illustrateur, etc. sont déjà dessinés sur l'image
 *  — pas besoin d'overlay HTML. */
export function CardFace({
  card,
  faded,
  large,
}: {
  card: PokemonCardData;
  faded?: boolean;
  large?: boolean;
}) {
  const glow =
    card.rarity === "crown"
      ? "shadow-[0_0_36px_rgba(254,240,138,0.7)]"
      : card.rarity === "star-3"
        ? "shadow-[0_0_28px_rgba(253,186,116,0.55)]"
        : card.rarity === "star-2"
          ? "shadow-[0_0_22px_rgba(251,113,133,0.45)]"
          : card.rarity === "star-1"
            ? "shadow-[0_0_18px_rgba(232,121,249,0.4)]"
            : card.rarity === "diamond-4"
              ? "shadow-[0_0_14px_rgba(252,211,77,0.4)]"
              : "";
  return (
    <div
      className={`relative overflow-hidden rounded-md ${
        large ? "h-full" : "aspect-[5/7]"
      } ${glow} ${faded ? "grayscale opacity-50" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.image}
        alt={card.name}
        className="h-full w-full object-contain"
        loading="lazy"
      />
    </div>
  );
}

/** Modal plein écran pour zoomer une carte. Click outside ou Esc pour fermer. */
export function CardZoomModal({
  card,
  onClose,
}: {
  card: PokemonCardData | null;
  onClose: () => void;
}) {
  if (!card) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92vh] w-auto"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.image}
          alt={card.name}
          className="h-[88vh] w-auto rounded-lg object-contain"
        />
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 rounded-full bg-zinc-900 p-2 text-zinc-200 shadow-lg ring-1 ring-white/20 hover:bg-zinc-800"
          aria-label="Fermer"
        >
          ✕
        </button>
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-zinc-900/95 px-3 py-1 text-xs text-zinc-200">
          {card.name} · {RARITY_LABEL[card.rarity]}
          {card.illustrator ? ` · 🎨 ${card.illustrator}` : ""}
        </div>
      </div>
    </div>
  );
}
