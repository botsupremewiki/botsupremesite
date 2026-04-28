"use client";

import { useMemo, useState } from "react";
import type {
  PokemonCardData,
  PokemonEnergyType,
  TcgRarity,
} from "@shared/types";
import { CardSlot, CardZoomModal, RARITY_TIER } from "./card-visuals";

type CollectionFilter = "all" | "owned" | "missing" | "dupes";
type CollectionSort = "number" | "name" | "rarity" | "count";

const TYPE_OPTIONS: { id: PokemonEnergyType; label: string }[] = [
  { id: "fire", label: "🔥 Feu" },
  { id: "water", label: "💧 Eau" },
  { id: "grass", label: "🍃 Plante" },
  { id: "lightning", label: "⚡ Élec" },
  { id: "psychic", label: "🌀 Psy" },
  { id: "fighting", label: "👊 Combat" },
  { id: "darkness", label: "🌑 Obscurité" },
  { id: "metal", label: "⚙️ Métal" },
  { id: "dragon", label: "🐉 Dragon" },
  { id: "colorless", label: "⭐ Incolore" },
];

const RARITY_OPTIONS: { id: TcgRarity; label: string }[] = [
  { id: "crown", label: "👑 Couronne" },
  { id: "star-3", label: "★★★ Immersive" },
  { id: "star-2", label: "★★ Full Art" },
  { id: "star-1", label: "★ Full Art" },
  { id: "diamond-4", label: "◆◆◆◆ ex" },
  { id: "diamond-3", label: "◆◆◆ Rare" },
  { id: "diamond-2", label: "◆◆ Peu c." },
  { id: "diamond-1", label: "◆ Commune" },
];

export function CollectionGrid({
  pool,
  collection,
}: {
  pool: PokemonCardData[];
  collection: Map<string, number>;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PokemonEnergyType | null>(null);
  const [rarityFilter, setRarityFilter] = useState<TcgRarity | null>(null);
  const [ownedFilter, setOwnedFilter] = useState<CollectionFilter>("all");
  const [sortMode, setSortMode] = useState<CollectionSort>("number");
  const [zoomedCard, setZoomedCard] = useState<PokemonCardData | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((c) => {
      const count = collection.get(c.id) ?? 0;
      if (ownedFilter === "owned" && count === 0) return false;
      if (ownedFilter === "missing" && count > 0) return false;
      if (ownedFilter === "dupes" && count < 2) return false;
      if (rarityFilter && c.rarity !== rarityFilter) return false;
      if (typeFilter && (c.kind !== "pokemon" || c.type !== typeFilter))
        return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pool, collection, search, typeFilter, rarityFilter, ownedFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sortMode) {
        case "number":
          return a.number - b.number;
        case "name":
          return a.name.localeCompare(b.name);
        case "rarity": {
          const ar = RARITY_TIER[a.rarity] ?? 0;
          const br = RARITY_TIER[b.rarity] ?? 0;
          if (ar !== br) return br - ar;
          return a.name.localeCompare(b.name);
        }
        case "count": {
          const ca = collection.get(a.id) ?? 0;
          const cb = collection.get(b.id) ?? 0;
          if (ca !== cb) return cb - ca;
          return a.name.localeCompare(b.name);
        }
      }
    });
    return arr;
  }, [filtered, sortMode, collection]);

  const filtersActive =
    !!search ||
    typeFilter !== null ||
    rarityFilter !== null ||
    ownedFilter !== "all";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Rechercher par nom…"
            className="flex-1 min-w-[180px] rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400/50 focus:outline-none"
          />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as CollectionSort)}
            className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-400/50 focus:outline-none"
          >
            <option value="number">Tri : N° Pokédex</option>
            <option value="rarity">Tri : Rareté</option>
            <option value="name">Tri : Nom A→Z</option>
            <option value="count">Tri : Possédées</option>
          </select>
          {filtersActive && (
            <button
              onClick={() => {
                setSearch("");
                setTypeFilter(null);
                setRarityFilter(null);
                setOwnedFilter("all");
              }}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={ownedFilter === "all"}
            onClick={() => setOwnedFilter("all")}
            label="Toutes"
          />
          <FilterChip
            active={ownedFilter === "owned"}
            onClick={() => setOwnedFilter("owned")}
            label="Possédées"
          />
          <FilterChip
            active={ownedFilter === "missing"}
            onClick={() => setOwnedFilter("missing")}
            label="Manquantes"
          />
          <FilterChip
            active={ownedFilter === "dupes"}
            onClick={() => setOwnedFilter("dupes")}
            label="Doublons"
          />
          <span className="mx-1 w-px self-stretch bg-white/10" />
          {TYPE_OPTIONS.map((t) => (
            <FilterChip
              key={t.id}
              active={typeFilter === t.id}
              onClick={() =>
                setTypeFilter(typeFilter === t.id ? null : t.id)
              }
              label={t.label}
            />
          ))}
          <span className="mx-1 w-px self-stretch bg-white/10" />
          {RARITY_OPTIONS.map((r) => (
            <FilterChip
              key={r.id}
              active={rarityFilter === r.id}
              onClick={() =>
                setRarityFilter(rarityFilter === r.id ? null : r.id)
              }
              label={r.label}
            />
          ))}
        </div>
        {filtersActive && (
          <div className="text-[11px] text-zinc-500">
            {sorted.length} résultat{sorted.length > 1 ? "s" : ""} sur{" "}
            {pool.length}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
            Aucune carte ne correspond à ces filtres.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pr-1">
            {sorted.map((c) => {
              const count = collection.get(c.id) ?? 0;
              return (
                <CardSlot
                  key={c.id}
                  card={c}
                  count={count}
                  onClick={() => setZoomedCard(c)}
                />
              );
            })}
          </div>
        )}
      </div>
      <CardZoomModal card={zoomedCard} onClose={() => setZoomedCard(null)} />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
        active
          ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
      }`}
    >
      {label}
    </button>
  );
}
