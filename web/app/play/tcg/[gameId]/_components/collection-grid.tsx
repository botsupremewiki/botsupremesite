"use client";

import { useMemo, useState } from "react";
import type {
  PokemonCardData,
  PokemonEnergyType,
  TcgRarity,
} from "@shared/types";
import { POKEMON_SETS } from "@shared/tcg-pokemon-sets";
import { CardSlot, CardZoomModal, RARITY_TIER } from "./card-visuals";

type CollectionFilter = "all" | "owned" | "missing" | "dupes";
type CollectionSort = "number" | "name" | "rarity" | "count" | "hp";
type CategoryFilter =
  | "pokemon"
  | "trainer"
  | "supporter"
  | "item"
  | "basic"
  | "stage1"
  | "stage2";
type PackFilter = "mewtwo" | "charizard" | "pikachu" | "promo";

// Filtres facette : multi-select. Chaque "kind" a son propre Set ; entre
// kinds c'est un AND, dans un kind c'est un OR. Permet par exemple
// "Pokémon Feu OU Eau" + "Rare ou + + EX seulement".
type FacetState = {
  categories: Set<CategoryFilter>;
  types: Set<PokemonEnergyType>;
  rarities: Set<TcgRarity>;
  packs: Set<PackFilter>;
  /** Set Pocket (A1+P-A, A1a, A2…). Vide = tous les sets. */
  sets: Set<string>;
  exOnly: boolean;
};

const EMPTY_FACETS: FacetState = {
  categories: new Set(),
  types: new Set(),
  rarities: new Set(),
  packs: new Set(),
  sets: new Set(),
  exOnly: false,
};

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

const PACK_OPTIONS: { id: PackFilter; label: string; title: string }[] = [
  { id: "mewtwo", label: "Mewtwo", title: "Pack Mewtwo" },
  { id: "charizard", label: "Dracaufeu", title: "Pack Dracaufeu" },
  { id: "pikachu", label: "Pikachu", title: "Pack Pikachu" },
  { id: "promo", label: "Promo", title: "Promo (P-A)" },
];

export function CollectionGrid({
  pool,
  collection,
}: {
  pool: PokemonCardData[];
  collection: Map<string, number>;
}) {
  const [search, setSearch] = useState("");
  const [facets, setFacets] = useState<FacetState>(EMPTY_FACETS);
  const [ownedFilter, setOwnedFilter] = useState<CollectionFilter>("all");
  const [sortMode, setSortMode] = useState<CollectionSort>("number");
  const [zoomedCard, setZoomedCard] = useState<PokemonCardData | null>(null);

  // Toggle un facet : add si absent, remove si présent. Multi-select donc
  // chaque kind a son propre Set.
  function toggleCategory(v: CategoryFilter) {
    setFacets((f) => {
      const next = new Set(f.categories);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return { ...f, categories: next };
    });
  }
  function toggleType(v: PokemonEnergyType) {
    setFacets((f) => {
      const next = new Set(f.types);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return { ...f, types: next };
    });
  }
  function toggleRarity(v: TcgRarity) {
    setFacets((f) => {
      const next = new Set(f.rarities);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return { ...f, rarities: next };
    });
  }
  function togglePack(v: PackFilter) {
    setFacets((f) => {
      const next = new Set(f.packs);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return { ...f, packs: next };
    });
  }
  function toggleSet(v: string) {
    setFacets((f) => {
      const next = new Set(f.sets);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return { ...f, sets: next };
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((c) => {
      const count = collection.get(c.id) ?? 0;
      if (ownedFilter === "owned" && count === 0) return false;
      if (ownedFilter === "missing" && count > 0) return false;
      if (ownedFilter === "dupes" && count < 2) return false;
      // Multi-select : OR dans un kind, AND entre kinds.
      if (facets.rarities.size > 0 && !facets.rarities.has(c.rarity))
        return false;
      if (facets.types.size > 0) {
        if (c.kind !== "pokemon" || !facets.types.has(c.type)) return false;
      }
      if (facets.categories.size > 0) {
        let ok = false;
        for (const v of facets.categories) {
          if (v === "pokemon" && c.kind === "pokemon") ok = true;
          else if (v === "trainer" && c.kind === "trainer") ok = true;
          else if (v === "basic" && c.kind === "pokemon" && c.stage === "basic")
            ok = true;
          else if (
            v === "stage1" && c.kind === "pokemon" && c.stage === "stage1"
          ) ok = true;
          else if (
            v === "stage2" && c.kind === "pokemon" && c.stage === "stage2"
          ) ok = true;
          else if (
            v === "supporter" &&
            c.kind === "trainer" &&
            c.trainerType === "supporter"
          ) ok = true;
          else if (
            v === "item" &&
            c.kind === "trainer" &&
            c.trainerType === "item"
          ) ok = true;
        }
        if (!ok) return false;
      }
      if (facets.packs.size > 0) {
        // pack peut être string id ou absent (cartes anciennes).
        const pack = (c as { pack?: string }).pack;
        if (!pack || !facets.packs.has(pack as PackFilter)) return false;
      }
      if (facets.sets.size > 0) {
        // Match par préfixe d'id (A1-001, A1a-005, P-A-001…).
        const isPA = c.id.startsWith("P-A-");
        const prefix = isPA ? "P-A" : c.id.split("-")[0];
        let matched = false;
        for (const s of facets.sets) {
          if (s.includes(prefix) || prefix === s) {
            matched = true;
            break;
          }
        }
        if (!matched) return false;
      }
      if (facets.exOnly) {
        if (c.kind !== "pokemon" || !c.isEx) return false;
      }
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pool, collection, search, facets, ownedFilter]);

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
        case "hp": {
          const ah = a.kind === "pokemon" ? a.hp : 0;
          const bh = b.kind === "pokemon" ? b.hp : 0;
          if (ah !== bh) return bh - ah;
          return a.name.localeCompare(b.name);
        }
      }
    });
    return arr;
  }, [filtered, sortMode, collection]);

  const facetCount =
    facets.categories.size +
    facets.types.size +
    facets.rarities.size +
    facets.packs.size +
    facets.sets.size +
    (facets.exOnly ? 1 : 0);
  const filtersActive =
    !!search || facetCount > 0 || ownedFilter !== "all";

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
            <option value="hp">Tri : PV (haut→bas)</option>
          </select>
          {filtersActive && (
            <button
              onClick={() => {
                setSearch("");
                setFacets(EMPTY_FACETS);
                setOwnedFilter("all");
              }}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
              Reset {facetCount > 0 ? `(${facetCount})` : ""}
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
              active={facets.categories.has(c.id)}
              onClick={() => toggleCategory(c.id)}
              label={c.label}
              title={c.title}
            />
          ))}
          <FilterSeparator />
          {TYPE_OPTIONS.map((t) => (
            <FilterChip
              key={t.id}
              active={facets.types.has(t.id)}
              onClick={() => toggleType(t.id)}
              label={t.label}
              title={t.title}
            />
          ))}
          <FilterSeparator />
          {RARITY_OPTIONS.map((r) => (
            <FilterChip
              key={r.id}
              active={facets.rarities.has(r.id)}
              onClick={() => toggleRarity(r.id)}
              label={r.label}
              title={r.title}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PACK_OPTIONS.map((p) => (
            <FilterChip
              key={p.id}
              active={facets.packs.has(p.id)}
              onClick={() => togglePack(p.id)}
              label={p.label}
              title={p.title}
            />
          ))}
          <FilterSeparator />
          <FilterChip
            active={facets.exOnly}
            onClick={() => setFacets((f) => ({ ...f, exOnly: !f.exOnly }))}
            label="EX seulement"
            title="N'afficher que les Pokémon EX"
          />
          {POKEMON_SETS.filter((s) => s.active).length > 1 ? (
            <>
              <FilterSeparator />
              {POKEMON_SETS.filter((s) => s.active).map((s) => (
                <FilterChip
                  key={s.id}
                  active={facets.sets.has(s.id)}
                  onClick={() => toggleSet(s.id)}
                  label={s.id}
                  title={s.name}
                />
              ))}
            </>
          ) : null}
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
