"use client";

import type { PokemonCardData, PokemonEnergyType, TcgRarity } from "@shared/types";

export const RARITY_TIER: Record<TcgRarity, number> = {
  common: 0,
  energy: 0,
  uncommon: 1,
  rare: 2,
  "holo-rare": 3,
};

export const RARITY_LABEL: Record<TcgRarity, string> = {
  common: "Commune",
  energy: "Énergie",
  uncommon: "Peu commune",
  rare: "Rare",
  "holo-rare": "Holo rare",
};

export const RARITY_COLOR: Record<TcgRarity, string> = {
  common: "border-zinc-500/40 text-zinc-200",
  energy: "border-zinc-500/40 text-zinc-200",
  uncommon: "border-emerald-400/50 text-emerald-200",
  rare: "border-sky-400/60 text-sky-200",
  "holo-rare":
    "border-amber-300/70 text-amber-100 shadow-[0_0_24px_rgba(252,211,77,0.45)]",
};

export const TYPE_GLYPH: Record<PokemonEnergyType, string> = {
  fire: "🔥",
  water: "💧",
  grass: "🍃",
  lightning: "⚡",
  psychic: "🌀",
  fighting: "👊",
  colorless: "⭐",
};

export const TYPE_BG: Record<PokemonEnergyType, string> = {
  fire: "from-orange-500/30 to-red-700/40",
  water: "from-blue-400/30 to-blue-700/40",
  grass: "from-emerald-400/30 to-emerald-700/40",
  lightning: "from-yellow-400/30 to-yellow-600/40",
  psychic: "from-fuchsia-400/30 to-purple-700/40",
  fighting: "from-amber-700/30 to-stone-700/40",
  colorless: "from-zinc-300/20 to-zinc-500/30",
};

export function CardSlot({
  card,
  count,
}: {
  card: PokemonCardData;
  count: number;
}) {
  const owned = count > 0;
  return (
    <div
      className={`relative flex flex-col gap-1 rounded-xl border bg-black/40 p-2 transition-opacity ${
        owned ? RARITY_COLOR[card.rarity] : "border-white/5 opacity-30"
      }`}
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

export function CardFace({
  card,
  faded,
  large,
}: {
  card: PokemonCardData;
  faded?: boolean;
  large?: boolean;
}) {
  if (card.kind === "energy") {
    // Cartes énergie (legacy) — rendu emoji centré.
    const bg = TYPE_BG[card.energyType] ?? TYPE_BG.colorless;
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-md bg-gradient-to-b ${bg} ${
          large ? "h-full" : "aspect-[5/7]"
        } p-3 ${faded ? "grayscale" : ""}`}
      >
        <div className={large ? "text-7xl" : "text-4xl"}>{card.art}</div>
        <div className="text-center text-xs font-semibold text-zinc-100">
          {card.name}
        </div>
      </div>
    );
  }

  // Pokémon : vraies cartes officielles (URL pokemontcg.io). On affiche
  // l'image full-card — HP, attacks, weakness sont déjà dessinés dessus.
  const isUrl = card.art?.startsWith("http");
  if (isUrl) {
    const glow =
      card.rarity === "holo-rare"
        ? "shadow-[0_0_20px_rgba(252,211,77,0.55)]"
        : card.rarity === "rare"
          ? "shadow-[0_0_12px_rgba(125,211,252,0.4)]"
          : "";
    return (
      <div
        className={`relative overflow-hidden rounded-md ${
          large ? "h-full" : "aspect-[5/7]"
        } ${glow} ${faded ? "grayscale opacity-50" : ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.art}
          alt={card.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback rendu HTML (legacy emoji-based) — pour cartes anciennes encore en base.
  const bg = TYPE_BG[card.type] ?? TYPE_BG.colorless;
  return (
    <div
      className={`flex flex-col gap-1 rounded-md bg-gradient-to-b ${bg} ${
        large ? "h-full" : "aspect-[5/7]"
      } p-2 ${faded ? "grayscale" : ""}`}
    >
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-semibold text-zinc-100">{card.name}</span>
        <span className="tabular-nums text-rose-200">PV {card.hp}</span>
      </div>
      <div className="flex items-center justify-center rounded bg-black/30 py-3">
        <span className={large ? "text-6xl" : "text-4xl"}>{card.art}</span>
      </div>
      {card.ability && (
        <div className="rounded bg-black/40 px-1.5 py-1 text-[8px] leading-tight text-zinc-100">
          <span className="text-amber-300">★ {card.ability.name}</span>
          {large ? ` — ${card.ability.text}` : ""}
        </div>
      )}
      <div className="flex flex-col gap-0.5 text-[8px] leading-tight">
        {card.attacks.slice(0, large ? 2 : 1).map((a, i) => (
          <div key={i} className="rounded bg-black/40 px-1.5 py-1 text-zinc-100">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-0.5">
                {a.cost.map((c, j) => (
                  <span key={j}>{TYPE_GLYPH[c]}</span>
                ))}
                <span className="ml-1 font-semibold">{a.name}</span>
              </span>
              {a.damage !== undefined && (
                <span className="font-bold text-rose-200">
                  {a.damage}
                  {a.damageSuffix ?? ""}
                </span>
              )}
            </div>
            {large && a.text && (
              <div className="mt-0.5 text-[7px] text-zinc-300">{a.text}</div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between text-[8px] text-zinc-300">
        <span>
          {card.weakness && (
            <>
              <span className="text-rose-300">Faiblesse</span>{" "}
              {TYPE_GLYPH[card.weakness]}×2
            </>
          )}
        </span>
        <span>{RARITY_LABEL[card.rarity]}</span>
      </div>
    </div>
  );
}
