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
type CategoryFilter =
  | "pokemon"
  | "trainer"
  | "supporter"
  | "item"
  | "basic"
  | "stage1"
  | "stage2";

// Un seul filtre "facette" actif à la fois (catégorie OU type OU rareté).
// La possession (owned/missing/dupes) est gérée séparément.
type ActiveFilter =
  | { kind: "category"; value: CategoryFilter }
  | { kind: "type"; value: PokemonEnergyType }
  | { kind: "rarity"; value: TcgRarity }
  | null;

// Filtres compacts : labels courts (emoji seul pour types/raretés, mot seul
// pour catégories) — tout tient sur une ligne. Le titre complet est en
// `title=` HTML (tooltip au hover).
const TYPE_OPTIONS: { id: PokemonEnergyType; label: string; title: string }[] = [
  { id: "fire", label: "🔥", title: "Feu" },
  { id: "water", label: "💧", title: "Eau" },
  { id: "grass", label: "🍃", title: "Plante" },
  { id: "lightning", label: "⚡", title: "Électrique" },
  { id: "psychic", label: "🌀", title: "Psy" },
  { id: "fighting", label: "👊", title: "Combat" },
  { id: "darkness", label: "🌑", title: "Obscurité" },
  { id: "metal", label: "⚙️", title: "Métal" },
  { id: "dragon", label: "🐉", title: "Dragon" },
  { id: "colorless", label: "⭐", title: "Incolore" },
];

const CATEGORY_OPTIONS: { id: CategoryFilter; label: string; title: string }[] = [
  { id: "pokemon", label: "Pokémon", title: "Pokémon (toutes catégories)" },
  { id: "trainer", label: "Dresseurs", title: "Dresseurs (Supporter + Objet)" },
];

const RARITY_OPTIONS: { id: TcgRarity; label: string; title: string }[] = [
  { id: "crown", label: "👑", title: "Couronne brillante" },
  { id: "star-3", label: "★★★", title: "Immersive" },
  { id: "star-2", label: "★★", title: "Full Art alt" },
  { id: "star-1", label: "★", title: "Full Art" },
  { id: "diamond-4", label: "◆◆◆◆", title: "Rare ex" },
  { id: "diamond-3", label: "◆◆◆", title: "Rare" },
  { id: "diamond-2", label: "◆◆", title: "Peu commune" },
  { id: "diamond-1", label: "◆", title: "Commune" },
];

export function CollectionGrid({
  pool,
  collection,
}: {
  pool: PokemonCardData[];
  collection: Map<string, number>;
}) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [ownedFilter, setOwnedFilter] = useState<CollectionFilter>("all");
  const [sortMode, setSortMode] = useState<CollectionSort>("number");
  const [zoomedCard, setZoomedCard] = useState<PokemonCardData | null>(null);

  // Toggle un filtre facette : si on clique sur le même, on désactive ;
  // sinon on remplace le filtre actif (mutuellement exclusif).
  function toggleFilter(next: ActiveFilter) {
    if (
      activeFilter &&
      next &&
      activeFilter.kind === next.kind &&
      activeFilter.value === next.value
    ) {
      setActiveFilter(null);
    } else {
      setActiveFilter(next);
    }
  }
  const isActive = (kind: "category" | "type" | "rarity", value: string) =>
    activeFilter?.kind === kind && activeFilter.value === value;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((c) => {
      const count = collection.get(c.id) ?? 0;
      if (ownedFilter === "owned" && count === 0) return false;
      if (ownedFilter === "missing" && count > 0) return false;
      if (ownedFilter === "dupes" && count < 2) return false;
      // Filtre facette unique (catégorie / type / rareté).
      if (activeFilter) {
        if (activeFilter.kind === "rarity") {
          if (c.rarity !== activeFilter.value) return false;
        } else if (activeFilter.kind === "type") {
          if (c.kind !== "pokemon" || c.type !== activeFilter.value)
            return false;
        } else if (activeFilter.kind === "category") {
          const v = activeFilter.value;
          if (v === "pokemon" && c.kind !== "pokemon") return false;
          if (v === "trainer" && c.kind !== "trainer") return false;
          if (v === "basic" && (c.kind !== "pokemon" || c.stage !== "basic"))
            return false;
          if (v === "stage1" && (c.kind !== "pokemon" || c.stage !== "stage1"))
            return false;
          if (v === "stage2" && (c.kind !== "pokemon" || c.stage !== "stage2"))
            return false;
          if (
            v === "supporter" &&
            (c.kind !== "trainer" || c.trainerType !== "supporter")
          )
            return false;
          if (
            v === "item" &&
            (c.kind !== "trainer" || c.trainerType !== "item")
          )
            return false;
        }
      }
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pool, collection, search, activeFilter, ownedFilter]);

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
    !!search || activeFilter !== null || ownedFilter !== "all";

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
                setActiveFilter(null);
                setOwnedFilter("all");
              }}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
              Reset
            </button>
          )}
        </div>
        {/* Une seule ligne : possession | catégorie | type | rareté */}
        <div className="flex flex-wrap items-center gap-1.5">
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
            active={ownedFilter === "all"}
            onClick={() => setOwnedFilter("all")}
            label="Toutes"
          />
          <FilterChip
            active={ownedFilter === "dupes"}
            onClick={() => setOwnedFilter("dupes")}
            label="Doublons"
          />
          <FilterSeparator />
          {CATEGORY_OPTIONS.map((c) => (
            <FilterChip
              key={c.id}
              active={isActive("category", c.id)}
              onClick={() => toggleFilter({ kind: "category", value: c.id })}
              label={c.label}
              title={c.title}
            />
          ))}
          <FilterSeparator />
          {TYPE_OPTIONS.map((t) => (
            <FilterChip
              key={t.id}
              active={isActive("type", t.id)}
              onClick={() => toggleFilter({ kind: "type", value: t.id })}
              label={t.label}
              title={t.title}
            />
          ))}
          <FilterSeparator />
          {RARITY_OPTIONS.map((r) => (
            <FilterChip
              key={r.id}
              active={isActive("rarity", r.id)}
              onClick={() => toggleFilter({ kind: "rarity", value: r.id })}
              label={r.label}
              title={r.title}
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
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
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

function FilterSeparator() {
  return <span className="mx-1 h-5 w-px self-center bg-white/10" />;
}
