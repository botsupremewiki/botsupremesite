"use client";

import type {
  RuneterraCardData,
  RuneterraCardType,
  RuneterraRarity,
} from "@shared/types";

// Tier numérique pour le tri par rareté (du plus commun au plus rare).
export const LOR_RARITY_TIER: Record<RuneterraRarity, number> = {
  None: 0,
  Common: 1,
  Rare: 2,
  Epic: 3,
  Champion: 4,
};

export const LOR_RARITY_LABEL: Record<RuneterraRarity, string> = {
  None: "Sans rareté",
  Common: "Commune",
  Rare: "Rare",
  Epic: "Épique",
  Champion: "Champion",
};

// Border + glow Tailwind par rareté.
export const LOR_RARITY_COLOR: Record<RuneterraRarity, string> = {
  None: "border-zinc-600/40 text-zinc-200",
  Common: "border-zinc-400/40 text-zinc-200",
  Rare: "border-sky-400/60 text-sky-200",
  Epic:
    "border-fuchsia-400/70 text-fuchsia-100 shadow-[0_0_20px_rgba(232,121,249,0.4)]",
  Champion:
    "border-amber-300/80 text-amber-100 shadow-[0_0_28px_rgba(252,211,77,0.55)]",
};

export const LOR_TYPE_LABEL: Record<RuneterraCardType, string> = {
  Unit: "Unité",
  Spell: "Sort",
  Ability: "Compétence",
  Trap: "Piège",
  Landmark: "Site",
  Equipment: "Équipement",
};

export const LOR_SPELL_SPEED_LABEL: Record<string, string> = {
  Burst: "Instantané",
  Fast: "Rapide",
  Slow: "Lent",
  Focus: "Focalisé",
};

export function LorCardSlot({
  card,
  count,
  onClick,
}: {
  card: RuneterraCardData;
  count: number;
  onClick?: () => void;
}) {
  const owned = count > 0;
  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col gap-1 rounded-xl border bg-black/40 p-2 transition-opacity ${
        owned ? LOR_RARITY_COLOR[card.rarity] : "border-white/5 opacity-30"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <LorCardFace card={card} faded={!owned} />
      {count > 1 && (
        <div className="absolute right-2 top-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 shadow">
          ×{count}
        </div>
      )}
    </div>
  );
}

/** Affiche la carte officielle Runeterra (image avec cadre depuis CDN Riot).
 *  Stats + description + mots-clés sont dessinés sur l'image — pas d'overlay. */
export function LorCardFace({
  card,
  faded,
  large,
}: {
  card: RuneterraCardData;
  faded?: boolean;
  large?: boolean;
}) {
  const glow =
    card.rarity === "Champion"
      ? "shadow-[0_0_28px_rgba(252,211,77,0.55)]"
      : card.rarity === "Epic"
        ? "shadow-[0_0_20px_rgba(232,121,249,0.4)]"
        : "";
  return (
    <div
      className={`relative overflow-hidden rounded-md ${
        large ? "h-full" : "aspect-[2/3]"
      } ${glow} ${faded ? "grayscale opacity-50" : ""}`}
    >
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image}
          alt={card.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-xs text-zinc-500">
          {card.name}
        </div>
      )}
    </div>
  );
}

/** Modal plein écran pour zoomer une carte. Click outside ou Esc pour fermer. */
export function LorCardZoomModal({
  card,
  onClose,
}: {
  card: RuneterraCardData | null;
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
        {card.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image}
            alt={card.name}
            className="h-[88vh] w-auto rounded-lg object-contain"
          />
        )}
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 rounded-full bg-zinc-900 p-2 text-zinc-200 shadow-lg ring-1 ring-white/20 hover:bg-zinc-800"
          aria-label="Fermer"
        >
          ✕
        </button>
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-zinc-900/95 px-3 py-1 text-xs text-zinc-200">
          {card.name} · {LOR_RARITY_LABEL[card.rarity]}
          {card.artistName ? ` · 🎨 ${card.artistName}` : ""}
        </div>
      </div>
    </div>
  );
}
