"use client";

import { useMemo, useState } from "react";
import type {
  OnePieceCardData,
  OnePieceCategory,
  OnePieceColor,
  OnePieceRarity,
} from "@shared/types";
import {
  CardSlot,
  CardZoomModal,
  ONEPIECE_COLOR_GLYPH,
  ONEPIECE_COLOR_LABEL,
  ONEPIECE_RARITY_TIER,
} from "./onepiece-card-visuals";

type OwnedFilter = "all" | "owned" | "missing" | "dupes";
type SortMode = "id" | "name" | "rarity" | "count" | "cost";

// Un seul filtre "facette" actif à la fois (catégorie OU couleur OU rareté).
// Suit la même UX que la grille Pokémon.
type ActiveFilter =
  | { kind: "category"; value: OnePieceCategory }
  | { kind: "color"; value: OnePieceColor }
  | { kind: "rarity"; value: OnePieceRarity }
  | null;

const CATEGORY_OPTIONS: {
  id: OnePieceCategory;
  label: string;
  title: string;
}[] = [
  { id: "leader", label: "Leader", title: "Leaders" },
  { id: "character", label: "Persos", title: "Personnages" },
  { id: "event", label: "Évent", title: "Évènements" },
  { id: "stage", label: "Lieu", title: "Lieux" },
];

const COLOR_OPTIONS: { id: OnePieceColor; label: string; title: string }[] = (
  [
    "rouge",
    "vert",
    "bleu",
    "violet",
    "noir",
    "jaune",
  ] as const
).map((id) => ({
  id,
  label: ONEPIECE_COLOR_GLYPH[id],
  title: ONEPIECE_COLOR_LABEL[id],
}));

// Raretés affichées du plus rare au plus commun (comme la grille Pokémon).
const RARITY_OPTIONS: { id: OnePieceRarity; label: string; title: string }[] = [
  { id: "tr", label: "TR", title: "Treasure Rare" },
  { id: "sec", label: "SEC", title: "Secret Rare" },
  { id: "sp", label: "SP", title: "Special / Alt-Art" },
  { id: "l", label: "L", title: "Leader" },
  { id: "sr", label: "SR", title: "Super Rare" },
  { id: "r", label: "R", title: "Rare" },
  { id: "uc", label: "UC", title: "Peu Commune" },
  { id: "c", label: "C", title: "Commune" },
];

export function OnePieceCollectionGrid({
  pool,
  collection,
}: {
  pool: OnePieceCardData[];
  collection: Map<string, number>;
}) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("id");
  const [zoomedCard, setZoomedCard] = useState<OnePieceCardData | null>(null);

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
  const isActive = (
    kind: "category" | "color" | "rarity",
    value: string,
  ) => activeFilter?.kind === kind && activeFilter.value === value;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((c) => {
      const count = collection.get(c.id) ?? 0;
      if (ownedFilter === "owned" && count === 0) return false;
      if (ownedFilter === "missing" && count > 0) return false;
      // Format One Piece TCG : max 4 copies par deck. "Doublons" = strictement > 4.
      if (ownedFilter === "dupes" && count <= 4) return false;
      if (activeFilter) {
        if (activeFilter.kind === "rarity") {
          if (c.rarity !== activeFilter.value) return false;
        } else if (activeFilter.kind === "category") {
          if (c.kind !== activeFilter.value) return false;
        } else if (activeFilter.kind === "color") {
          // DON cards n'ont pas de couleur. Match si l'une des couleurs de la
          // carte correspond.
          if (c.kind === "don") return false;
          if (!c.color.includes(activeFilter.value)) return false;
        }
      }
      if (q) {
        const hay =
          (c.name + " " + c.id + " " + c.types.join(" ")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pool, collection, search, activeFilter, ownedFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sortMode) {
        case "id":
          return a.id.localeCompare(b.id);
        case "name":
          return a.name.localeCompare(b.name);
        case "rarity": {
          const ar = ONEPIECE_RARITY_TIER[a.rarity] ?? 0;
          const br = ONEPIECE_RARITY_TIER[b.rarity] ?? 0;
          if (ar !== br) return br - ar;
          return a.name.localeCompare(b.name);
        }
        case "count": {
          const ca = collection.get(a.id) ?? 0;
          const cb = collection.get(b.id) ?? 0;
          if (ca !== cb) return cb - ca;
          return a.name.localeCompare(b.name);
        }
        case "cost": {
          // Leaders triés à la fin (pas de cost). DON aussi.
          const ca = "cost" in a ? a.cost : 99;
          const cb = "cost" in b ? b.cost : 99;
          if (ca !== cb) return ca - cb;
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
            placeholder="🔍 Rechercher par nom, id ou famille…"
            className="flex-1 min-w-[180px] rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-rose-400/50 focus:outline-none"
          />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-rose-400/50 focus:outline-none"
          >
            <option value="id">Tri : N° set</option>
            <option value="rarity">Tri : Rareté</option>
            <option value="name">Tri : Nom A→Z</option>
            <option value="cost">Tri : Coût</option>
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
            label="Doublons (>4)"
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
          {COLOR_OPTIONS.map((c) => (
            <FilterChip
              key={c.id}
              active={isActive("color", c.id)}
              onClick={() => toggleFilter({ kind: "color", value: c.id })}
              label={c.label}
              title={c.title}
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 pr-1">
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
          ? "border-rose-400/60 bg-rose-400/10 text-rose-100"
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
