"use client";

import type {
  OnePieceAttribute,
  OnePieceCardData,
  OnePieceCategory,
  OnePieceColor,
  OnePieceRarity,
} from "@shared/types";

// Tier numérique pour le tri (du plus commun au plus rare).
export const ONEPIECE_RARITY_TIER: Record<OnePieceRarity, number> = {
  c: 1,
  uc: 2,
  r: 3,
  sr: 4,
  sec: 7,
  l: 5, // Leaders : entre SR et SEC
  p: 0,
  tr: 8, // Treasure (gold) : tout en haut
  sp: 6, // Special / alt-art
  don: 0,
};

// Glyph affiché dans les filtres.
export const ONEPIECE_RARITY_GLYPH: Record<OnePieceRarity, string> = {
  c: "C",
  uc: "UC",
  r: "R",
  sr: "SR",
  sec: "SEC",
  l: "L",
  p: "P",
  tr: "TR",
  sp: "SP",
  don: "DON",
};

export const ONEPIECE_RARITY_LABEL: Record<OnePieceRarity, string> = {
  c: "Commune",
  uc: "Peu Commune",
  r: "Rare",
  sr: "Super Rare",
  sec: "Secret Rare",
  l: "Leader",
  p: "Promo",
  tr: "Treasure Rare",
  sp: "Special / Alt-Art",
  don: "DON!!",
};

// Border + glow Tailwind selon la rareté.
export const ONEPIECE_RARITY_COLOR: Record<OnePieceRarity, string> = {
  c: "border-zinc-500/40 text-zinc-200",
  uc: "border-emerald-400/40 text-emerald-200",
  r: "border-sky-400/60 text-sky-200",
  sr: "border-amber-300/70 text-amber-100 shadow-[0_0_24px_rgba(252,211,77,0.45)]",
  sec: "border-fuchsia-400/70 text-fuchsia-100 shadow-[0_0_28px_rgba(232,121,249,0.5)]",
  l: "border-rose-400/70 text-rose-100 shadow-[0_0_22px_rgba(251,113,133,0.45)]",
  p: "border-zinc-500/40 text-zinc-200",
  tr: "border-yellow-200/90 text-yellow-50 shadow-[0_0_44px_rgba(254,240,138,0.7)]",
  sp: "border-orange-300/80 text-orange-100 shadow-[0_0_32px_rgba(253,186,116,0.55)]",
  don: "border-zinc-500/40 text-zinc-200",
};

export const ONEPIECE_COLOR_GLYPH: Record<OnePieceColor, string> = {
  rouge: "🔴",
  vert: "🟢",
  bleu: "🔵",
  violet: "🟣",
  noir: "⚫",
  jaune: "🟡",
};

export const ONEPIECE_COLOR_LABEL: Record<OnePieceColor, string> = {
  rouge: "Rouge",
  vert: "Vert",
  bleu: "Bleu",
  violet: "Violet",
  noir: "Noir",
  jaune: "Jaune",
};

export const ONEPIECE_COLOR_BG: Record<OnePieceColor, string> = {
  rouge: "from-red-500/30 to-red-800/40",
  vert: "from-emerald-500/30 to-emerald-800/40",
  bleu: "from-sky-500/30 to-blue-800/40",
  violet: "from-violet-500/30 to-purple-900/40",
  noir: "from-zinc-700/40 to-slate-950/60",
  jaune: "from-yellow-300/30 to-amber-700/40",
};

export const ONEPIECE_ATTRIBUTE_GLYPH: Record<OnePieceAttribute, string> = {
  frappe: "👊",
  tranche: "⚔️",
  distance: "🏹",
  special: "✨",
  sagesse: "📜",
};

export const ONEPIECE_ATTRIBUTE_LABEL: Record<OnePieceAttribute, string> = {
  frappe: "Frappe",
  tranche: "Tranche",
  distance: "Distance",
  special: "Spécial",
  sagesse: "Sagesse",
};

export const ONEPIECE_CATEGORY_LABEL: Record<OnePieceCategory, string> = {
  leader: "Leader",
  character: "Personnage",
  event: "Évènement",
  stage: "Lieu",
  don: "DON!!",
};

export function CardSlot({
  card,
  count,
  onClick,
}: {
  card: OnePieceCardData;
  count: number;
  onClick?: () => void;
}) {
  const owned = count > 0;
  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col gap-1 rounded-xl border bg-black/40 p-2 transition-opacity ${
        owned ? ONEPIECE_RARITY_COLOR[card.rarity] : "border-white/5 opacity-30"
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

/** Affiche la vraie carte officielle (image full-card Bandai FR).
 *  Power, life, attaques, type, etc. sont déjà dessinés sur l'image. */
export function CardFace({
  card,
  faded,
  large,
}: {
  card: OnePieceCardData;
  faded?: boolean;
  large?: boolean;
}) {
  const glow =
    card.rarity === "tr"
      ? "shadow-[0_0_36px_rgba(254,240,138,0.7)]"
      : card.rarity === "sec"
        ? "shadow-[0_0_28px_rgba(232,121,249,0.55)]"
        : card.rarity === "sp"
          ? "shadow-[0_0_24px_rgba(253,186,116,0.5)]"
          : card.rarity === "sr"
            ? "shadow-[0_0_18px_rgba(252,211,77,0.4)]"
            : card.rarity === "l"
              ? "shadow-[0_0_18px_rgba(251,113,133,0.4)]"
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
  card: OnePieceCardData | null;
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
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 max-w-[90vw] truncate rounded-full border border-white/20 bg-zinc-900/95 px-3 py-1 text-xs text-zinc-200">
          {card.name} · {ONEPIECE_RARITY_LABEL[card.rarity]} ·{" "}
          {ONEPIECE_CATEGORY_LABEL[card.kind]}
        </div>
      </div>
    </div>
  );
}
