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
type CollectionSort = "pokedex" | "name" | "rarity";
type SortDir = "asc" | "desc";
/**
 * Catégorie EXCLUSIVE (radio) :
 * - "all" : tout afficher (par défaut)
 * - "pokemon" : Pokémon uniquement → on affiche les chips de TYPES + toutes
 *   les raretés (diamond-1 → crown) + un toggle "EX seulement" après crown
 * - "trainer" : Dresseurs uniquement → on cache les TYPES + on n'affiche
 *   que les raretés que les Dresseurs peuvent avoir (en pratique
 *   diamond-1 à diamond-3, calculées dynamiquement depuis le pool)
 *
 * Changer de catégorie reset les filtres types/raretés/exOnly pour
 * éviter les états incohérents.
 */
type CategoryFilter = "all" | "pokemon" | "trainer";

// Filtres facette : multi-select pour types et raretés (chaque kind a son
// propre Set ; entre kinds c'est un AND, dans un kind c'est un OR).
// Catégorie est exclusive.
type FacetState = {
  category: CategoryFilter;
  types: Set<PokemonEnergyType>;
  rarities: Set<TcgRarity>;
  /** Set Pocket (A1+P-A, A1a, A2…). Vide = tous les sets. */
  sets: Set<string>;
  exOnly: boolean;
};

const EMPTY_FACETS: FacetState = {
  category: "all",
  types: new Set(),
  rarities: new Set(),
  sets: new Set(),
  exOnly: false,
};

// Filtres compacts : labels courts (emoji seul pour types/raretés, mot seul
// pour catégories) — tout tient sur une ligne. Le titre complet est en
// `title=` HTML (tooltip au hover).
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

// Ordre des raretés du moins rare au plus rare (croissant). L'utilisateur
// scanne de gauche à droite : commence par les communes puis monte vers les
// alt-arts et la couronne. EX est un toggle séparé qui apparaît APRÈS la
// couronne uniquement quand category === "pokemon".
const RARITY_OPTIONS: { id: TcgRarity; label: string; title: string }[] = [
  { id: "diamond-1", label: "◆", title: "Commune (1 losange)" },
  { id: "diamond-2", label: "◆◆", title: "Peu commune (2 losanges)" },
  { id: "diamond-3", label: "◆◆◆", title: "Rare (3 losanges)" },
  { id: "diamond-4", label: "◆◆◆◆", title: "Rare ex (4 losanges)" },
  { id: "star-1", label: "★", title: "Full Art (1 étoile)" },
  { id: "star-2", label: "★★", title: "Full Art alt (2 étoiles)" },
  { id: "star-3", label: "★★★", title: "Immersive (3 étoiles)" },
  { id: "crown", label: "👑", title: "Couronne brillante" },
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
  const [sortMode, setSortMode] = useState<CollectionSort>("pokedex");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [zoomedCard, setZoomedCard] = useState<PokemonCardData | null>(null);

  /** Calcule dynamiquement les raretés présentes dans le pool pour la
   *  catégorie active (pour Dresseurs : on n'affiche que les chips qui
   *  matchent au moins une carte → pas de star/crown qui ne s'appliquent
   *  qu'aux Pokémon). */
  const availableRarities = useMemo(() => {
    const seen = new Set<TcgRarity>();
    for (const c of pool) {
      if (facets.category === "pokemon" && c.kind !== "pokemon") continue;
      if (facets.category === "trainer" && c.kind !== "trainer") continue;
      seen.add(c.rarity);
    }
    return seen;
  }, [pool, facets.category]);

  /** Reset des filtres dépendants de la catégorie au changement (types,
   *  raretés, exOnly). Évite les incohérences (ex. type Feu sélectionné
   *  alors qu'on est passé sur Dresseurs). */
  function setCategory(v: CategoryFilter) {
    setFacets((f) => ({
      ...f,
      category: v,
      types: new Set(),
      rarities: new Set(),
      exOnly: false,
    }));
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
      // Catégorie exclusive : "all" laisse tout passer.
      if (facets.category === "pokemon" && c.kind !== "pokemon") return false;
      if (facets.category === "trainer" && c.kind !== "trainer") return false;
      // Types : applicable seulement aux Pokémon. Si la catégorie est
      // "trainer", on ignore les types (réinitialisés au switch de toute
      // façon).
      if (facets.types.size > 0) {
        if (c.kind !== "pokemon" || !facets.types.has(c.type)) return false;
      }
      // Raretés multi-select : OR dans le kind.
      if (facets.rarities.size > 0 && !facets.rarities.has(c.rarity))
        return false;
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
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortMode) {
        case "pokedex": {
          // Bug fix : utiliser pokedexId (numéro Pokédex national) au lieu
          // de `number` (= numéro de carte du set, qui mélange Pokémon et
          // Dresseurs). Les Dresseurs n'ont pas de pokedexId → 9999 pour
          // les pousser en fin de liste, puis on stabilise par nom.
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
          // Asc = du moins rare au plus rare ; desc = inverse.
          if (ar !== br) return (ar - br) * dir;
          return a.name.localeCompare(b.name) * dir;
        }
      }
    });
    return arr;
  }, [filtered, sortMode, sortDir]);

  const facetCount =
    (facets.category !== "all" ? 1 : 0) +
    facets.types.size +
    facets.rarities.size +
    facets.sets.size +
    (facets.exOnly ? 1 : 0);
  const filtersActive =
    !!search || facetCount > 0 || ownedFilter !== "all";

  // Pour Dresseurs : on filtre la liste de chips de raretés à celles
  // effectivement présentes dans le pool (typiquement diamond-1 à
  // diamond-3 + parfois diamond-4 ou promo). Pour Pokémon : toutes les
  // raretés sont permises (un Pokémon peut être star-3 ou crown).
  const visibleRarities =
    facets.category === "trainer"
      ? RARITY_OPTIONS.filter((r) => availableRarities.has(r.id))
      : RARITY_OPTIONS;

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
            <option value="pokedex">Tri : N° Pokédex</option>
            <option value="rarity">Tri : Rareté</option>
            <option value="name">Tri : Nom A→Z</option>
          </select>
          <button
            onClick={() =>
              setSortDir((d) => (d === "asc" ? "desc" : "asc"))
            }
            className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-zinc-200 hover:bg-white/10"
            title={
              sortDir === "asc"
                ? "Croissant — clic pour passer en décroissant"
                : "Décroissant — clic pour passer en croissant"
            }
            aria-label={
              sortDir === "asc"
                ? "Tri croissant"
                : "Tri décroissant"
            }
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
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
          {/* Catégorie EXCLUSIVE (radio) — switch reset les filtres
              dépendants (types/raretés/exOnly). */}
          {CATEGORY_OPTIONS.map((c) => (
            <FilterChip
              key={c.id}
              active={facets.category === c.id}
              onClick={() => setCategory(c.id)}
              label={c.label}
              title={c.title}
            />
          ))}
          {/* Types Pokémon : visibles seulement si catégorie === "pokemon"
              ou "all" (où "all" autorise types). Cachés sur "trainer". */}
          {facets.category !== "trainer" && (
            <>
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
            </>
          )}
          <FilterSeparator />
          {/* Raretés dans l'ordre croissant : ◆ → ◆◆ → ◆◆◆ → ◆◆◆◆ → ★
              → ★★ → ★★★ → 👑. Pour Dresseurs on filtre dynamiquement aux
              raretés effectivement présentes (typiquement ◆ à ◆◆◆). */}
          {visibleRarities.map((r) => (
            <FilterChip
              key={r.id}
              active={facets.rarities.has(r.id)}
              onClick={() => toggleRarity(r.id)}
              label={r.label}
              title={r.title}
            />
          ))}
          {/* "EX seulement" placé APRÈS la couronne (logique : un EX est
              une variante d'un Pokémon haute rareté, donc à la fin de
              l'échelle). Visible uniquement si on cible des Pokémon. */}
          {facets.category !== "trainer" && (
            <FilterChip
              active={facets.exOnly}
              onClick={() => setFacets((f) => ({ ...f, exOnly: !f.exOnly }))}
              label="EX"
              title="N'afficher que les Pokémon EX"
            />
          )}
        </div>
        {POKEMON_SETS.filter((s) => s.active).length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {POKEMON_SETS.filter((s) => s.active).map((s) => (
              <FilterChip
                key={s.id}
                active={facets.sets.has(s.id)}
                onClick={() => toggleSet(s.id)}
                label={s.id}
                title={s.name}
              />
            ))}
          </div>
        ) : null}
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
