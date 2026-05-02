"use client";

import { useMemo, useState } from "react";
import type {
  RuneterraCardData,
  RuneterraCardType,
  RuneterraRarity,
  RuneterraRegion,
} from "@shared/types";
import { RUNETERRA_REGIONS } from "@shared/types";
import {
  LorCardSlot,
  LorCardZoomModal,
  LOR_RARITY_TIER,
} from "./lor-card-visuals";

type CollectionFilter = "all" | "owned" | "missing" | "dupes";
type CollectionSort = "region" | "cost" | "name" | "rarity" | "count";

// Filtre facette unique actif à la fois (région, coût, type, rareté).
type ActiveFilter =
  | { kind: "region"; value: RuneterraRegion }
  | { kind: "cost"; value: number } // 0..7 (7 = "7+")
  | { kind: "type"; value: RuneterraCardType }
  | { kind: "rarity"; value: RuneterraRarity }
  | null;

const REGION_ORDER: RuneterraRegion[] = [
  "Demacia",
  "Freljord",
  "Ionia",
  "Noxus",
  "PiltoverZaun",
  "ShadowIsles",
];

const REGION_OPTIONS = REGION_ORDER.map((id) => ({
  id,
  label: RUNETERRA_REGIONS[id].abbreviation,
  title: RUNETERRA_REGIONS[id].name,
}));

const COST_OPTIONS: { value: number; label: string; title: string }[] = [
  { value: 0, label: "0", title: "Coût 0" },
  { value: 1, label: "1", title: "Coût 1" },
  { value: 2, label: "2", title: "Coût 2" },
  { value: 3, label: "3", title: "Coût 3" },
  { value: 4, label: "4", title: "Coût 4" },
  { value: 5, label: "5", title: "Coût 5" },
  { value: 6, label: "6", title: "Coût 6" },
  { value: 7, label: "7+", title: "Coût 7 ou plus" },
];

const TYPE_OPTIONS: { id: RuneterraCardType; label: string; title: string }[] =
  [
    { id: "Unit", label: "Unités", title: "Unités (créatures)" },
    { id: "Spell", label: "Sorts", title: "Sorts" },
  ];

const RARITY_OPTIONS: {
  id: RuneterraRarity;
  label: string;
  title: string;
}[] = [
  { id: "Champion", label: "★ Champion", title: "Champion" },
  { id: "Epic", label: "Épique", title: "Épique" },
  { id: "Rare", label: "Rare", title: "Rare" },
  { id: "Common", label: "Commune", title: "Commune" },
];

export function LorCollectionGrid({
  pool,
  collection,
}: {
  pool: RuneterraCardData[];
  collection: Map<string, number>;
}) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [ownedFilter, setOwnedFilter] = useState<CollectionFilter>("all");
  const [sortMode, setSortMode] = useState<CollectionSort>("region");
  const [zoomedCard, setZoomedCard] = useState<RuneterraCardData | null>(null);

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
    kind: "region" | "cost" | "type" | "rarity",
    value: string | number,
  ) => activeFilter?.kind === kind && activeFilter.value === value;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((c) => {
      const count = collection.get(c.cardCode) ?? 0;
      if (ownedFilter === "owned" && count === 0) return false;
      if (ownedFilter === "missing" && count > 0) return false;
      if (ownedFilter === "dupes" && count < 2) return false;
      if (activeFilter) {
        if (activeFilter.kind === "region") {
          if (!c.regions.includes(activeFilter.value)) return false;
        } else if (activeFilter.kind === "cost") {
          if (activeFilter.value === 7) {
            if (c.cost < 7) return false;
          } else if (c.cost !== activeFilter.value) return false;
        } else if (activeFilter.kind === "type") {
          if (c.type !== activeFilter.value) return false;
        } else if (activeFilter.kind === "rarity") {
          if (c.rarity !== activeFilter.value) return false;
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
        case "region": {
          // Région primaire (la première figurant dans REGION_ORDER), puis
          // champions d'abord, puis coût, puis nom.
          const aReg = a.regions.find((r) =>
            REGION_ORDER.includes(r as RuneterraRegion),
          );
          const bReg = b.regions.find((r) =>
            REGION_ORDER.includes(r as RuneterraRegion),
          );
          const aIdx = aReg
            ? REGION_ORDER.indexOf(aReg as RuneterraRegion)
            : 999;
          const bIdx = bReg
            ? REGION_ORDER.indexOf(bReg as RuneterraRegion)
            : 999;
          if (aIdx !== bIdx) return aIdx - bIdx;
          const aChamp = a.supertype === "Champion" ? 0 : 1;
          const bChamp = b.supertype === "Champion" ? 0 : 1;
          if (aChamp !== bChamp) return aChamp - bChamp;
          if (a.cost !== b.cost) return a.cost - b.cost;
          return a.name.localeCompare(b.name);
        }
        case "cost":
          if (a.cost !== b.cost) return a.cost - b.cost;
          return a.name.localeCompare(b.name);
        case "name":
          return a.name.localeCompare(b.name);
        case "rarity": {
          const ar = LOR_RARITY_TIER[a.rarity] ?? 0;
          const br = LOR_RARITY_TIER[b.rarity] ?? 0;
          if (ar !== br) return br - ar;
          return a.name.localeCompare(b.name);
        }
        case "count": {
          const ca = collection.get(a.cardCode) ?? 0;
          const cb = collection.get(b.cardCode) ?? 0;
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
            className="flex-1 min-w-[180px] rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-sky-400/50 focus:outline-none"
          />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as CollectionSort)}
            className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-sky-400/50 focus:outline-none"
          >
            <option value="region">Tri : Région</option>
            <option value="cost">Tri : Coût</option>
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
          {REGION_OPTIONS.map((r) => (
            <FilterChip
              key={r.id}
              active={isActive("region", r.id)}
              onClick={() => toggleFilter({ kind: "region", value: r.id })}
              label={r.label}
              title={r.title}
            />
          ))}
          <FilterSeparator />
          {COST_OPTIONS.map((c) => (
            <FilterChip
              key={c.value}
              active={isActive("cost", c.value)}
              onClick={() => toggleFilter({ kind: "cost", value: c.value })}
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 pr-1">
            {sorted.map((c) => {
              const count = collection.get(c.cardCode) ?? 0;
              return (
                <LorCardSlot
                  key={c.cardCode}
                  card={c}
                  count={count}
                  onClick={() => setZoomedCard(c)}
                />
              );
            })}
          </div>
        )}
      </div>
      <LorCardZoomModal card={zoomedCard} onClose={() => setZoomedCard(null)} />
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
          ? "border-sky-400/60 bg-sky-400/10 text-sky-100"
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
