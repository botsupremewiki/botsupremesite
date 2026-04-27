"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  PokemonCardData,
  PokemonEnergyType,
  TcgClientMessage,
  TcgDeck,
  TcgDeckEntry,
  TcgGameId,
  TcgRarity,
  TcgServerMessage,
} from "@shared/types";
import { BATTLE_CONFIG, TCG_GAMES } from "@shared/types";
import {
  POKEMON_BASE_SET,
  POKEMON_BASE_SET_BY_ID,
} from "@shared/tcg-pokemon-base";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { CardFace } from "../_components/card-visuals";

type ConnStatus = "connecting" | "connected" | "disconnected";

const DECK_TARGET = BATTLE_CONFIG.deckSize;
const MAX_COPIES = BATTLE_CONFIG.maxCopies;
const DECK_NAME_MAX = 40;

// Empty deck draft used when creating a new deck.
const EMPTY_DRAFT = {
  id: null as string | null,
  name: "Nouveau deck",
  entries: new Map<string, number>(),
};

const RARITY_TIER: Record<TcgRarity, number> = {
  common: 0,
  energy: 0,
  uncommon: 1,
  rare: 2,
  "holo-rare": 3,
};

const RARITY_LABEL: Record<TcgRarity, string> = {
  common: "Commune",
  energy: "Énergie",
  uncommon: "Peu commune",
  rare: "Rare",
  "holo-rare": "Holo rare",
};

const RARITY_BORDER: Record<TcgRarity, string> = {
  common: "border-zinc-700/50",
  energy: "border-zinc-700/50",
  uncommon: "border-emerald-500/50",
  rare: "border-sky-500/60",
  "holo-rare": "border-amber-300/70",
};

const TYPE_BG: Record<PokemonEnergyType, string> = {
  fire: "from-orange-500/30 to-red-700/40",
  water: "from-blue-400/30 to-blue-700/40",
  grass: "from-emerald-400/30 to-emerald-700/40",
  lightning: "from-yellow-400/30 to-yellow-600/40",
  psychic: "from-fuchsia-400/30 to-purple-700/40",
  fighting: "from-amber-700/30 to-stone-700/40",
  colorless: "from-zinc-300/20 to-zinc-500/30",
};

export function DecksClient({
  profile,
  gameId,
}: {
  profile: Profile | null;
  gameId: TcgGameId;
}) {
  const game = TCG_GAMES[gameId];
  const pool = gameId === "pokemon" ? POKEMON_BASE_SET : [];
  const cardById =
    gameId === "pokemon" ? POKEMON_BASE_SET_BY_ID : new Map<string, PokemonCardData>();

  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [gold, setGold] = useState<number>(profile?.gold ?? 0);
  const [collection, setCollection] = useState<Map<string, number>>(new Map());
  const [decks, setDecks] = useState<TcgDeck[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  // Working draft of the deck currently being edited.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>(EMPTY_DRAFT.name);
  const [draftEntries, setDraftEntries] = useState<Map<string, number>>(
    new Map(),
  );

  const totalCount = useMemo(
    () =>
      Array.from(draftEntries.values()).reduce((s, n) => s + n, 0),
    [draftEntries],
  );
  const dirty = useMemo(() => {
    if (!draftId) return draftEntries.size > 0 || draftName !== EMPTY_DRAFT.name;
    const orig = decks.find((d) => d.id === draftId);
    if (!orig) return true;
    if (orig.name !== draftName) return true;
    if (orig.cards.length !== draftEntries.size) return true;
    for (const e of orig.cards) {
      if ((draftEntries.get(e.cardId) ?? 0) !== e.count) return true;
    }
    return false;
  }, [draftId, draftName, draftEntries, decks]);

  useEffect(() => {
    let cancelled = false;
    const partyHost =
      process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999";
    const scheme =
      partyHost.startsWith("localhost") ||
      partyHost.startsWith("127.") ||
      partyHost.startsWith("192.168.")
        ? "ws"
        : "wss";
    const params = new URLSearchParams();
    if (profile) {
      params.set("authId", profile.id);
      params.set("name", profile.username);
      params.set("gold", String(profile.gold));
    }
    const url = `${scheme}://${partyHost}/parties/tcg/${gameId}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: TcgServerMessage;
      try {
        msg = JSON.parse(e.data as string) as TcgServerMessage;
      } catch {
        return;
      }
      handleMessage(msg);
    });
    function handleMessage(msg: TcgServerMessage) {
      switch (msg.type) {
        case "tcg-welcome":
          setGold(msg.gold);
          setCollection(
            new Map(msg.collection.map((c) => [c.cardId, c.count])),
          );
          setDecks(msg.decks);
          break;
        case "tcg-decks":
          setDecks(msg.decks);
          // After save, sync the draft with the canonical version.
          if (draftId) {
            const refreshed = msg.decks.find((d) => d.id === draftId);
            if (refreshed) {
              setDraftName(refreshed.name);
              setDraftEntries(
                new Map(refreshed.cards.map((c) => [c.cardId, c.count])),
              );
            }
          }
          setSavedFlash("Deck sauvegardé.");
          setTimeout(() => setSavedFlash(null), 2000);
          break;
        case "tcg-error":
          setErrorMsg(msg.message);
          break;
        case "gold-update":
          setGold(msg.gold);
          break;
      }
    }
    return () => {
      cancelled = true;
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, gameId]);

  const send = useCallback((msg: TcgClientMessage) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const startNewDraft = useCallback(() => {
    setDraftId(null);
    setDraftName(EMPTY_DRAFT.name);
    setDraftEntries(new Map());
    setErrorMsg(null);
  }, []);

  const loadDraftFromDeck = useCallback((deck: TcgDeck) => {
    setDraftId(deck.id);
    setDraftName(deck.name);
    setDraftEntries(new Map(deck.cards.map((c) => [c.cardId, c.count])));
    setErrorMsg(null);
  }, []);

  const addCard = useCallback(
    (card: PokemonCardData) => {
      setErrorMsg(null);
      setDraftEntries((prev) => {
        const next = new Map(prev);
        const current = next.get(card.id) ?? 0;
        const owned = collection.get(card.id) ?? 0;
        // Pocket : max MAX_COPIES (2) par carte, capé par les copies possédées.
        const cap = Math.min(owned, MAX_COPIES);
        if (current >= cap) return prev;
        const total = Array.from(next.values()).reduce((s, n) => s + n, 0);
        if (total >= DECK_TARGET) return prev;
        next.set(card.id, current + 1);
        return next;
      });
    },
    [collection],
  );

  const removeCard = useCallback((cardId: string) => {
    setDraftEntries((prev) => {
      const next = new Map(prev);
      const current = next.get(cardId) ?? 0;
      if (current <= 1) next.delete(cardId);
      else next.set(cardId, current - 1);
      return next;
    });
  }, []);

  const saveDeck = useCallback(() => {
    if (totalCount !== DECK_TARGET) {
      setErrorMsg(
        `Le deck doit contenir exactement ${DECK_TARGET} cartes (${totalCount}/${DECK_TARGET}).`,
      );
      return;
    }
    if (!draftName.trim()) {
      setErrorMsg("Donne un nom à ton deck.");
      return;
    }
    const entries: TcgDeckEntry[] = Array.from(draftEntries.entries()).map(
      ([cardId, count]) => ({ cardId, count }),
    );
    send({
      type: "tcg-save-deck",
      deckId: draftId,
      name: draftName.trim().slice(0, DECK_NAME_MAX),
      cards: entries,
    });
  }, [send, totalCount, draftName, draftEntries, draftId]);

  const deleteDeck = useCallback(
    (deckId: string) => {
      if (!confirm("Supprimer ce deck ?")) return;
      send({ type: "tcg-delete-deck", deckId });
      if (draftId === deckId) startNewDraft();
    },
    [send, draftId, startNewDraft],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/${gameId}`}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← {game.name}
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">Mes decks</span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <StatusIndicator status={status} />
          {profile ? (
            <UserPill profile={{ ...profile, gold }} variant="play" />
          ) : null}
        </div>
      </header>

      <main className={`flex flex-1 overflow-hidden ${game.gradient}`}>
        {/* Sidebar — list of decks */}
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-white/5 bg-black/30 p-3">
          <button
            onClick={startNewDraft}
            className="mb-3 shrink-0 rounded-md bg-amber-500 px-3 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400"
          >
            + Nouveau deck
          </button>
          <div className="mb-2 shrink-0 text-[10px] uppercase tracking-widest text-zinc-500">
            Mes decks ({decks.length})
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {decks.length === 0 && (
              <div className="rounded-md border border-dashed border-white/10 p-3 text-xs text-zinc-500">
                Aucun deck pour l&apos;instant. Crée ton premier !
              </div>
            )}
            {decks.map((deck) => {
              const isActive = draftId === deck.id;
              const cardSum = deck.cards.reduce((s, c) => s + c.count, 0);
              return (
                <div
                  key={deck.id}
                  className={`group flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    isActive
                      ? "bg-amber-400/15 text-amber-200"
                      : "bg-white/[0.02] text-zinc-200 hover:bg-white/5"
                  }`}
                >
                  <button
                    onClick={() => loadDraftFromDeck(deck)}
                    className="flex flex-1 flex-col items-start"
                  >
                    <span className="truncate font-semibold">{deck.name}</span>
                    <span className="text-[10px] text-zinc-500">
                      {cardSum}/{DECK_TARGET} cartes
                    </span>
                  </button>
                  <button
                    onClick={() => deleteDeck(deck.id)}
                    className="rounded p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-rose-500/20 hover:text-rose-300 group-hover:opacity-100"
                    title="Supprimer"
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main editor */}
        <section className="flex flex-1 flex-col overflow-hidden">
          {!profile ? (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
              Connecte-toi avec Discord pour gérer tes decks.
            </div>
          ) : (
            <>
              {/* Editor top bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-black/30 p-3">
                <div className="flex flex-1 items-center gap-2">
                  <input
                    value={draftName}
                    onChange={(e) =>
                      setDraftName(e.target.value.slice(0, DECK_NAME_MAX))
                    }
                    placeholder="Nom du deck"
                    className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <span
                    className={`rounded-md border px-2 py-1 text-xs font-semibold tabular-nums ${
                      totalCount === DECK_TARGET
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                        : "border-amber-400/40 bg-amber-400/10 text-amber-200"
                    }`}
                  >
                    {totalCount}/{DECK_TARGET}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {savedFlash && (
                    <span className="text-xs text-emerald-300">
                      ✓ {savedFlash}
                    </span>
                  )}
                  <button
                    onClick={saveDeck}
                    disabled={!dirty || totalCount !== DECK_TARGET}
                    className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {draftId ? "Sauvegarder" : "Créer"}
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="border-b border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">
                  {errorMsg}
                </div>
              )}

              <div className="flex flex-1 overflow-hidden">
                {/* Collection (cliquer pour add) */}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4">
                  <div className="mb-2 shrink-0 text-[10px] uppercase tracking-widest text-zinc-400">
                    Ta collection · clique pour ajouter
                  </div>
                  <CollectionPicker
                    pool={pool}
                    collection={collection}
                    draftEntries={draftEntries}
                    onAdd={addCard}
                  />
                </div>
                {/* Deck contents */}
                <DeckSummary
                  draftEntries={draftEntries}
                  cardById={cardById}
                  onRemove={removeCard}
                  onAdd={addCard}
                />
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── Collection picker ───────────────────────────────────────────────────

type PickerOwned = "all" | "owned" | "missing";
type PickerSort = "number" | "name" | "rarity" | "count";

const PICKER_TYPE_OPTIONS: { id: PokemonEnergyType; label: string }[] = [
  { id: "fire", label: "🔥 Feu" },
  { id: "water", label: "💧 Eau" },
  { id: "grass", label: "🍃 Plante" },
  { id: "lightning", label: "⚡ Élec" },
  { id: "psychic", label: "🌀 Psy" },
  { id: "fighting", label: "👊 Combat" },
  { id: "colorless", label: "⭐ Normal" },
];

const PICKER_RARITY_OPTIONS: { id: TcgRarity; label: string }[] = [
  { id: "holo-rare", label: "Holo" },
  { id: "rare", label: "Rare" },
  { id: "uncommon", label: "Peu c." },
  { id: "common", label: "Commune" },
  { id: "energy", label: "Énergie" },
];

function CollectionPicker({
  pool,
  collection,
  draftEntries,
  onAdd,
}: {
  pool: PokemonCardData[];
  collection: Map<string, number>;
  draftEntries: Map<string, number>;
  onAdd: (card: PokemonCardData) => void;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PokemonEnergyType | null>(null);
  const [rarityFilter, setRarityFilter] = useState<TcgRarity | null>(null);
  // Par défaut on n'affiche que les cartes possédées (sens pour la création
  // de deck). Les énergies de base sont toujours considérées comme acquises.
  const [ownedFilter, setOwnedFilter] = useState<PickerOwned>("owned");
  const [sortMode, setSortMode] = useState<PickerSort>("number");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((c) => {
      const owned = collection.get(c.id) ?? 0;
      if (ownedFilter === "owned" && owned <= 0) return false;
      if (ownedFilter === "missing" && owned > 0) return false;
      if (rarityFilter && c.rarity !== rarityFilter) return false;
      if (typeFilter) {
        const cType = c.kind === "energy" ? c.energyType : c.type;
        if (cType !== typeFilter) return false;
      }
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

  const filtersChanged =
    !!search ||
    typeFilter !== null ||
    rarityFilter !== null ||
    ownedFilter !== "owned"; // "owned" est le défaut

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
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
            onChange={(e) => setSortMode(e.target.value as PickerSort)}
            className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-400/50 focus:outline-none"
          >
            <option value="number">Tri : N° Pokédex</option>
            <option value="rarity">Tri : Rareté</option>
            <option value="name">Tri : Nom A→Z</option>
            <option value="count">Tri : Possédées</option>
          </select>
          {filtersChanged && (
            <button
              onClick={() => {
                setSearch("");
                setTypeFilter(null);
                setRarityFilter(null);
                setOwnedFilter("owned");
              }}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <PickerChip
            active={ownedFilter === "owned"}
            onClick={() => setOwnedFilter("owned")}
            label="Possédées"
          />
          <PickerChip
            active={ownedFilter === "missing"}
            onClick={() => setOwnedFilter("missing")}
            label="Manquantes"
          />
          <PickerChip
            active={ownedFilter === "all"}
            onClick={() => setOwnedFilter("all")}
            label="Toutes"
          />
          <span className="mx-1 w-px self-stretch bg-white/10" />
          {PICKER_TYPE_OPTIONS.map((t) => (
            <PickerChip
              key={t.id}
              active={typeFilter === t.id}
              onClick={() =>
                setTypeFilter(typeFilter === t.id ? null : t.id)
              }
              label={t.label}
            />
          ))}
          <span className="mx-1 w-px self-stretch bg-white/10" />
          {PICKER_RARITY_OPTIONS.map((r) => (
            <PickerChip
              key={r.id}
              active={rarityFilter === r.id}
              onClick={() =>
                setRarityFilter(rarityFilter === r.id ? null : r.id)
              }
              label={r.label}
            />
          ))}
        </div>
        {filtersChanged && (
          <div className="text-[11px] text-zinc-500">
            {sorted.length} résultat{sorted.length > 1 ? "s" : ""} sur{" "}
            {pool.length}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {sorted.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
            Aucune carte ne correspond à ces filtres.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {sorted.map((card) => {
              const owned = collection.get(card.id) ?? 0;
              const inDeck = draftEntries.get(card.id) ?? 0;
              const cap = Math.min(owned, MAX_COPIES);
              const canAdd = inDeck < cap;
              const ownedAtAll = owned > 0;
              return (
                <button
                  key={card.id}
                  disabled={!ownedAtAll || !canAdd}
                  onClick={() => onAdd(card)}
                  className={`group relative flex flex-col gap-1 rounded-lg border bg-black/40 p-2 transition-all ${
                    ownedAtAll
                      ? RARITY_BORDER[card.rarity] +
                        (canAdd ? " hover:bg-white/5" : " opacity-60")
                      : "border-white/5 opacity-30"
                  } disabled:cursor-not-allowed`}
                >
                  <CardFace card={card} />
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-400">
                      {owned} possédée{owned > 1 ? "s" : ""}
                    </span>
                    {inDeck > 0 && (
                      <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                        ×{inDeck}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PickerChip({
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

// ─── Deck summary (right column) ─────────────────────────────────────────

function DeckSummary({
  draftEntries,
  cardById,
  onRemove,
  onAdd,
}: {
  draftEntries: Map<string, number>;
  cardById: Map<string, PokemonCardData>;
  onRemove: (cardId: string) => void;
  onAdd: (card: PokemonCardData) => void;
}) {
  const grouped = useMemo(() => {
    const pokemon: { card: PokemonCardData; count: number }[] = [];
    const energies: { card: PokemonCardData; count: number }[] = [];
    for (const [cardId, count] of draftEntries) {
      const card = cardById.get(cardId);
      if (!card) continue;
      if (card.kind === "energy") energies.push({ card, count });
      else pokemon.push({ card, count });
    }
    pokemon.sort((a, b) => {
      const ar = RARITY_TIER[a.card.rarity] ?? 0;
      const br = RARITY_TIER[b.card.rarity] ?? 0;
      if (ar !== br) return br - ar;
      return a.card.name.localeCompare(b.card.name);
    });
    energies.sort((a, b) => a.card.name.localeCompare(b.card.name));
    return { pokemon, energies };
  }, [draftEntries, cardById]);

  const pokemonTotal = grouped.pokemon.reduce((s, e) => s + e.count, 0);
  const energyTotal = grouped.energies.reduce((s, e) => s + e.count, 0);
  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-white/5 bg-black/40">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-400">
        <span>Deck</span>
        <span>
          🐾 {pokemonTotal} · 🔋 {energyTotal}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {draftEntries.size === 0 && (
          <div className="rounded-md border border-dashed border-white/10 p-3 text-center text-xs text-zinc-500">
            Vide. Clique sur les cartes à gauche pour les ajouter.
          </div>
        )}
        <AnimatePresence initial={false}>
          {grouped.pokemon.map(({ card, count }) => (
            <DeckRow
              key={card.id}
              card={card}
              count={count}
              onRemove={() => onRemove(card.id)}
              onAdd={() => onAdd(card)}
            />
          ))}
        </AnimatePresence>
        {grouped.energies.length > 0 && (
          <div className="mt-3 border-t border-white/5 pt-2">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
              Énergies
            </div>
            <AnimatePresence initial={false}>
              {grouped.energies.map(({ card, count }) => (
                <DeckRow
                  key={card.id}
                  card={card}
                  count={count}
                  onRemove={() => onRemove(card.id)}
                  onAdd={() => onAdd(card)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </aside>
  );
}

function DeckRow({
  card,
  count,
  onRemove,
  onAdd,
}: {
  card: PokemonCardData;
  count: number;
  onRemove: () => void;
  onAdd: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -6 }}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5"
    >
      <span className="text-lg">{card.art}</span>
      <span className="flex-1 truncate text-xs text-zinc-200">{card.name}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={onRemove}
          className="rounded bg-white/5 px-1.5 py-0.5 text-xs hover:bg-rose-500/30"
        >
          −
        </button>
        <span className="w-5 text-center text-xs font-bold tabular-nums">
          {count}
        </span>
        <button
          onClick={onAdd}
          className="rounded bg-white/5 px-1.5 py-0.5 text-xs hover:bg-emerald-500/30"
        >
          +
        </button>
      </div>
    </motion.div>
  );
}

function StatusIndicator({ status }: { status: ConnStatus }) {
  const color =
    status === "connected"
      ? "bg-emerald-400"
      : status === "connecting"
        ? "bg-amber-400"
        : "bg-rose-400";
  const label =
    status === "connected"
      ? "en ligne"
      : status === "connecting"
        ? "connexion"
        : "hors ligne";
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`}>
        {status === "connected" && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-60`}
          />
        )}
      </span>
      {label}
    </span>
  );
}
