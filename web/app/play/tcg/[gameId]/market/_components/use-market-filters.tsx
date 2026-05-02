"use client";

import { useMemo, useState } from "react";
import type {
  PokemonCardData,
  PokemonEnergyType,
  TcgRarity,
} from "@shared/types";
import { POKEMON_SETS } from "@shared/tcg-pokemon-sets";
import { RARITY_TIER } from "../../_components/card-visuals";

type CategoryFilter = "all" | "pokemon" | "trainer";
type SortMode = "pokedex" | "name" | "rarity" | "price-asc" | "price-desc";
type SortDir = "asc" | "desc";

const TYPE_OPTIONS: { id: PokemonEnergyType; label: string; title: string }[] = [
  { id: "grass", label: "🍃", title: "Plante" },
  { id: "fire", label: "🔥", title: "Feu" },
  { id: "water", label: "💧", title: "Eau" },
  { id: "lightning", label: "⚡", title: "Électrique" },
  { id: "psychic", label: "🌀", title: "Psy" },
  { id: "fighting", label: "👊", title: "Combat" },
  { id: "darkness", label: "🌑", title: "Obscurité" },
  { id: "metal", label: "⚙️", title: "Métal" },
  { id: "dragon", label: "🐉", title: "Dragon" },
  { id: "colorless", label: "⭐", title: "Incolore" },
];

const CATEGORY_OPTIONS: { id: CategoryFilter; label: string; title: string }[] = [
  { id: "all", label: "Tout", title: "Pokémon + Dresseurs" },
  { id: "pokemon", label: "Pokémon", title: "Pokémon uniquement" },
  { id: "trainer", label: "Dresseurs", title: "Dresseurs (Supporter + Objet)" },
];

const RARITY_OPTIONS: { id: TcgRarity; label: string; title: string }[] = [
  { id: "diamond-1", label: "◆", title: "Commune ◆" },
  { id: "diamond-2", label: "◆◆", title: "Peu commune ◆◆" },
  { id: "diamond-3", label: "◆◆◆", title: "Rare ◆◆◆" },
  { id: "diamond-4", label: "◆◆◆◆", title: "Rare ex ◆◆◆◆" },
  { id: "star-1", label: "★", title: "Full Art ★" },
  { id: "star-2", label: "★★", title: "Full Art alt ★★" },
  { id: "star-3", label: "★★★", title: "Immersive ★★★" },
  { id: "crown", label: "👑", title: "Couronne" },
];

/** Hook qui gère l'état filtres + tri pour les onglets Buy/Sell du
 *  marché. Retourne :
 *    • `cards` : la liste filtrée+triée (à mapper en tiles dans le parent)
 *    • `FiltersUI` : un composant prêt à insérer en haut de la grille
 *
 *  `priceFor` : optionnel, callback (cardId) → prix (pour activer les
 *  tris price-asc/price-desc). Si non fourni, ces options ne sont pas
 *  affichées.
 */
export function useMarketFilters({
  pool,
  priceFor,
  showSetChips = true,
}: {
  pool: PokemonCardData[];
  priceFor?: (cardId: string) => number | null;
  showSetChips?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [types, setTypes] = useState<Set<PokemonEnergyType>>(new Set());
  const [rarities, setRarities] = useState<Set<TcgRarity>>(new Set());
  const [sets, setSets] = useState<Set<string>>(new Set());
  const [exOnly, setExOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("pokedex");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const availableRarities = useMemo(() => {
    const seen = new Set<TcgRarity>();
    for (const c of pool) {
      if (category === "pokemon" && c.kind !== "pokemon") continue;
      if (category === "trainer" && c.kind !== "trainer") continue;
      seen.add(c.rarity);
    }
    return seen;
  }, [pool, category]);

  function changeCategory(v: CategoryFilter) {
    setCategory(v);
    setTypes(new Set());
    setRarities(new Set());
    setExOnly(false);
  }
  function toggleType(v: PokemonEnergyType) {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }
  function toggleRarity(v: TcgRarity) {
    setRarities((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }
  function toggleSet(v: string) {
    setSets((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((c) => {
      if (category === "pokemon" && c.kind !== "pokemon") return false;
      if (category === "trainer" && c.kind !== "trainer") return false;
      if (types.size > 0) {
        if (c.kind !== "pokemon" || !types.has(c.type)) return false;
      }
      if (rarities.size > 0 && !rarities.has(c.rarity)) return false;
      if (sets.size > 0) {
        const isPA = c.id.startsWith("P-A-");
        const prefix = isPA ? "P-A" : c.id.split("-")[0];
        let matched = false;
        for (const s of sets) {
          if (s.includes(prefix) || prefix === s) {
            matched = true;
            break;
          }
        }
        if (!matched) return false;
      }
      if (exOnly && (c.kind !== "pokemon" || !c.isEx)) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pool, search, category, types, rarities, sets, exOnly]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortMode) {
        case "price-asc":
        case "price-desc": {
          const ap = priceFor?.(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bp = priceFor?.(b.id) ?? Number.MAX_SAFE_INTEGER;
          if (ap !== bp) return (ap - bp) * (sortMode === "price-asc" ? 1 : -1);
          return a.name.localeCompare(b.name);
        }
        case "pokedex": {
          const ap = a.kind === "pokemon" ? a.pokedexId ?? 9999 : 9999;
          const bp = b.kind === "pokemon" ? b.pokedexId ?? 9999 : 9999;
          if (ap !== bp) return (ap - bp) * dir;
          return a.name.localeCompare(b.name) * dir;
        }
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "rarity": {
          const ar = RARITY_TIER[a.rarity] ?? 0;
          const br = RARITY_TIER[b.rarity] ?? 0;
          if (ar !== br) return (ar - br) * dir;
          return a.name.localeCompare(b.name) * dir;
        }
      }
    });
    return arr;
  }, [filtered, sortMode, sortDir, priceFor]);

  const facetCount =
    (category !== "all" ? 1 : 0) +
    types.size +
    rarities.size +
    sets.size +
    (exOnly ? 1 : 0);
  const filtersActive = !!search || facetCount > 0;

  function reset() {
    setSearch("");
    setCategory("all");
    setTypes(new Set());
    setRarities(new Set());
    setSets(new Set());
    setExOnly(false);
  }

  const visibleRarities =
    category === "trainer"
      ? RARITY_OPTIONS.filter((r) => availableRarities.has(r.id))
      : RARITY_OPTIONS;

  const FiltersUI = (
    <div className="flex shrink-0 flex-col gap-2">
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
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-400/50 focus:outline-none"
        >
          <option value="pokedex">Tri : N° Pokédex</option>
          <option value="rarity">Tri : Rareté</option>
          <option value="name">Tri : Nom A→Z</option>
          {priceFor && (
            <>
              <option value="price-asc">Tri : Prix croissant</option>
              <option value="price-desc">Tri : Prix décroissant</option>
            </>
          )}
        </select>
        <button
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          disabled={sortMode === "price-asc" || sortMode === "price-desc"}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-40"
          title={sortDir === "asc" ? "Croissant" : "Décroissant"}
        >
          {sortDir === "asc" ? "↑" : "↓"}
        </button>
        {filtersActive && (
          <button
            onClick={reset}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
          >
            Reset {facetCount > 0 ? `(${facetCount})` : ""}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORY_OPTIONS.map((c) => (
          <Chip
            key={c.id}
            active={category === c.id}
            onClick={() => changeCategory(c.id)}
            label={c.label}
            title={c.title}
          />
        ))}
        {category !== "trainer" && (
          <>
            <Sep />
            {TYPE_OPTIONS.map((t) => (
              <Chip
                key={t.id}
                active={types.has(t.id)}
                onClick={() => toggleType(t.id)}
                label={t.label}
                title={t.title}
              />
            ))}
          </>
        )}
        <Sep />
        {visibleRarities.map((r) => (
          <Chip
            key={r.id}
            active={rarities.has(r.id)}
            onClick={() => toggleRarity(r.id)}
            label={r.label}
            title={r.title}
          />
        ))}
        {category !== "trainer" && (
          <Chip
            active={exOnly}
            onClick={() => setExOnly((v) => !v)}
            label="EX"
            title="Pokémon EX uniquement"
          />
        )}
      </div>
      {showSetChips &&
      POKEMON_SETS.filter((s) => s.active).length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {POKEMON_SETS.filter((s) => s.active).map((s) => (
            <Chip
              key={s.id}
              active={sets.has(s.id)}
              onClick={() => toggleSet(s.id)}
              label={s.id}
              title={s.name}
            />
          ))}
        </div>
      ) : null}
    </div>
  );

  return {
    cards: sorted,
    totalCount: pool.length,
    visibleCount: sorted.length,
    FiltersUI,
  };
}

function Chip({
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

function Sep() {
  return <span className="mx-1 h-5 w-px self-center bg-white/10" />;
}
