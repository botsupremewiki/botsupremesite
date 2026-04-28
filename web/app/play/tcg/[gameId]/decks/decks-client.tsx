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
  promo: 0,
  "diamond-1": 1,
  "diamond-2": 2,
  "diamond-3": 3,
  "diamond-4": 4,
  "star-1": 5,
  "star-2": 6,
  "star-3": 7,
  crown: 8,
};

const RARITY_LABEL: Record<TcgRarity, string> = {
  promo: "Sans rareté",
  "diamond-1": "Commune ◆",
  "diamond-2": "Peu commune ◆◆",
  "diamond-3": "Rare ◆◆◆",
  "diamond-4": "Rare ex ◆◆◆◆",
  "star-1": "Full Art ★",
  "star-2": "Full Art ★★",
  "star-3": "Immersive ★★★",
  crown: "Couronne 👑",
};

const RARITY_BORDER: Record<TcgRarity, string> = {
  promo: "border-zinc-700/50",
  "diamond-1": "border-zinc-700/50",
  "diamond-2": "border-emerald-500/50",
  "diamond-3": "border-sky-500/60",
  "diamond-4": "border-amber-300/70",
  "star-1": "border-fuchsia-400/70",
  "star-2": "border-rose-400/70",
  "star-3": "border-orange-300/80",
  crown: "border-yellow-200/90",
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
  // Pocket : 1 à 3 types d'énergies que le moteur va auto-générer en combat.
  // Choisi manuellement par le joueur (peut être différent des types Pokémon
  // dans le deck — ex un deck full Pokémon Feu peut avoir Eau choisi).
  const [draftEnergyTypes, setDraftEnergyTypes] = useState<
    PokemonEnergyType[]
  >([]);
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
              setDraftEnergyTypes(refreshed.energyTypes ?? []);
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
    setDraftEnergyTypes([]);
    setErrorMsg(null);
  }, []);

  const loadDraftFromDeck = useCallback((deck: TcgDeck) => {
    setDraftId(deck.id);
    setDraftName(deck.name);
    setDraftEntries(new Map(deck.cards.map((c) => [c.cardId, c.count])));
    setDraftEnergyTypes(deck.energyTypes ?? []);
    setErrorMsg(null);
  }, []);

  // Toggle un type d'énergie dans la sélection (max 3 actifs).
  const toggleEnergyType = useCallback((t: PokemonEnergyType) => {
    setDraftEnergyTypes((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= 3) return prev; // cap Pocket
      return [...prev, t];
    });
  }, []);

  const addCard = useCallback(
    (card: PokemonCardData) => {
      setErrorMsg(null);
      setDraftEntries((prev) => {
        const next = new Map(prev);
        // Pocket : max MAX_COPIES (2) par NOM de carte (toutes raretés
        // confondues). Pikachu-ex ◆◆◆◆ + Pikachu-ex ★ = max 2 combinés.
        let totalForName = 0;
        for (const [cId, count] of next) {
          const c = POKEMON_BASE_SET_BY_ID.get(cId);
          if (c?.name === card.name) totalForName += count;
        }
        if (totalForName >= MAX_COPIES) return prev;
        // On doit aussi posséder une copie supplémentaire de cette carte
        // précise (rareté + numéro).
        const current = next.get(card.id) ?? 0;
        const owned = collection.get(card.id) ?? 0;
        if (current >= owned) return prev;
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

  // Compte des Pokémon de Base dans le draft — Pocket exige au moins 1 pour
  // pouvoir démarrer un combat (sinon mulligan infini au setup).
  const draftBasicCount = useMemo(() => {
    let n = 0;
    for (const [cardId, count] of draftEntries) {
      const c = POKEMON_BASE_SET_BY_ID.get(cardId);
      if (c?.kind === "pokemon" && c.stage === "basic") n += count;
    }
    return n;
  }, [draftEntries]);

  const saveDeck = useCallback(() => {
    if (totalCount !== DECK_TARGET) {
      setErrorMsg(
        `Le deck doit contenir exactement ${DECK_TARGET} cartes (${totalCount}/${DECK_TARGET}).`,
      );
      return;
    }
    if (draftBasicCount === 0) {
      setErrorMsg(
        "Au moins 1 Pokémon de Base est requis (sinon impossible de démarrer un combat).",
      );
      return;
    }
    if (draftEnergyTypes.length < 1 || draftEnergyTypes.length > 3) {
      setErrorMsg(
        "Sélectionne entre 1 et 3 types d'énergies pour ton deck.",
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
      energyTypes: draftEnergyTypes,
    });
  }, [
    send,
    totalCount,
    draftBasicCount,
    draftName,
    draftEntries,
    draftEnergyTypes,
    draftId,
  ]);

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
                    disabled={
                      !dirty ||
                      totalCount !== DECK_TARGET ||
                      draftBasicCount === 0 ||
                      draftEnergyTypes.length === 0
                    }
                    title={
                      draftBasicCount === 0
                        ? "Au moins 1 Pokémon de Base requis"
                        : draftEnergyTypes.length === 0
                          ? "Sélectionne 1 à 3 types d'énergies"
                          : undefined
                    }
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

              {/* Layout vertical : en haut = deck en cours (mini cartes
                  visuelles), séparateur, en bas = collection à ajouter. */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Header : cartes actuellement dans le deck */}
                <DeckHeader
                  draftEntries={draftEntries}
                  cardById={cardById}
                  onRemove={removeCard}
                  energyTypes={draftEnergyTypes}
                  onToggleEnergy={toggleEnergyType}
                />

                {/* Séparateur visuel net */}
                <div className="shrink-0 border-t-2 border-amber-400/30 bg-gradient-to-b from-amber-400/10 to-transparent px-4 py-1.5 text-[10px] uppercase tracking-widest text-amber-200/80">
                  ↓ Ta collection · clique pour ajouter une carte
                </div>

                {/* Collection (clic = ouvre modal preview avec bouton ajouter) */}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4">
                  <CollectionPicker
                    pool={pool}
                    collection={collection}
                    draftEntries={draftEntries}
                    onAdd={addCard}
                  />
                </div>
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
type PickerCategory = "pokemon" | "trainer";

// Un seul filtre "facette" actif à la fois (catégorie OU type OU rareté).
type PickerActiveFilter =
  | { kind: "category"; value: PickerCategory }
  | { kind: "type"; value: PokemonEnergyType }
  | { kind: "rarity"; value: TcgRarity }
  | null;

// Filtres compacts : labels courts (emoji seul pour types/raretés, mot seul
// pour catégories) — tout tient sur une ligne. Le titre complet est en
// `title=` HTML (tooltip au hover).
const PICKER_TYPE_OPTIONS: { id: PokemonEnergyType; label: string; title: string }[] = [
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

const PICKER_CATEGORY_OPTIONS: { id: PickerCategory; label: string; title: string }[] = [
  { id: "pokemon", label: "Pokémon", title: "Pokémon (toutes catégories)" },
  { id: "trainer", label: "Dresseurs", title: "Dresseurs (Supporter + Objet)" },
];

const PICKER_RARITY_OPTIONS: { id: TcgRarity; label: string; title: string }[] = [
  { id: "crown", label: "👑", title: "Couronne brillante" },
  { id: "star-3", label: "★★★", title: "Immersive" },
  { id: "star-2", label: "★★", title: "Full Art alt" },
  { id: "star-1", label: "★", title: "Full Art" },
  { id: "diamond-4", label: "◆◆◆◆", title: "Rare ex" },
  { id: "diamond-3", label: "◆◆◆", title: "Rare" },
  { id: "diamond-2", label: "◆◆", title: "Peu commune" },
  { id: "diamond-1", label: "◆", title: "Commune" },
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
  const [activeFilter, setActiveFilter] = useState<PickerActiveFilter>(null);
  const [ownedFilter, setOwnedFilter] = useState<PickerOwned>("owned");
  const [sortMode, setSortMode] = useState<PickerSort>("number");
  // Carte sélectionnée pour preview (modal zoom avec bouton "Ajouter au deck").
  const [previewCard, setPreviewCard] = useState<PokemonCardData | null>(null);

  function toggleFilter(next: PickerActiveFilter) {
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
      const owned = collection.get(c.id) ?? 0;
      if (ownedFilter === "owned" && owned <= 0) return false;
      if (ownedFilter === "missing" && owned > 0) return false;
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

  const filtersChanged =
    !!search || activeFilter !== null || ownedFilter !== "owned";

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
                setActiveFilter(null);
                setOwnedFilter("owned");
              }}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
              Reset
            </button>
          )}
        </div>
        {/* Une seule ligne : possession | catégorie | type | rareté */}
        <div className="flex flex-wrap items-center gap-1.5">
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
          <PickerSeparator />
          {PICKER_CATEGORY_OPTIONS.map((c) => (
            <PickerChip
              key={c.id}
              active={isActive("category", c.id)}
              onClick={() => toggleFilter({ kind: "category", value: c.id })}
              label={c.label}
              title={c.title}
            />
          ))}
          <PickerSeparator />
          {PICKER_TYPE_OPTIONS.map((t) => (
            <PickerChip
              key={t.id}
              active={isActive("type", t.id)}
              onClick={() => toggleFilter({ kind: "type", value: t.id })}
              label={t.label}
              title={t.title}
            />
          ))}
          <PickerSeparator />
          {PICKER_RARITY_OPTIONS.map((r) => (
            <PickerChip
              key={r.id}
              active={isActive("rarity", r.id)}
              onClick={() => toggleFilter({ kind: "rarity", value: r.id })}
              label={r.label}
              title={r.title}
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
              const ownedAtAll = owned > 0;
              return (
                <button
                  key={card.id}
                  onClick={() => setPreviewCard(card)}
                  className={`group relative flex flex-col gap-1 rounded-lg border bg-black/40 p-2 transition-all hover:scale-[1.03] hover:bg-white/5 ${
                    ownedAtAll
                      ? RARITY_BORDER[card.rarity]
                      : "border-white/5 opacity-30"
                  }`}
                  title={card.name}
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

      {/* Modal preview : zoom de la carte + bouton Ajouter au deck. */}
      {previewCard && (
        <PreviewWithAddModal
          card={previewCard}
          owned={collection.get(previewCard.id) ?? 0}
          inDeckThisCard={draftEntries.get(previewCard.id) ?? 0}
          inDeckSameName={(() => {
            // Compte le total dans le deck partageant le même nom (Pocket :
            // limite par nom, toutes raretés confondues).
            let n = 0;
            for (const [cId, count] of draftEntries) {
              const c = POKEMON_BASE_SET_BY_ID.get(cId);
              if (c?.name === previewCard.name) n += count;
            }
            return n;
          })()}
          maxCopies={MAX_COPIES}
          onAdd={() => {
            onAdd(previewCard);
          }}
          onClose={() => setPreviewCard(null)}
        />
      )}
    </div>
  );
}

/** Modal carte zoomée + bouton "Ajouter au deck" + croix.
 *  Click outside ou croix = ferme. Click "Ajouter" = ajoute (mais ne ferme PAS,
 *  pour permettre d'ajouter plusieurs copies sans ré-ouvrir). */
function PreviewWithAddModal({
  card,
  owned,
  inDeckThisCard,
  inDeckSameName,
  maxCopies,
  onAdd,
  onClose,
}: {
  card: PokemonCardData;
  owned: number;
  inDeckThisCard: number;
  inDeckSameName: number;
  maxCopies: number;
  onAdd: () => void;
  onClose: () => void;
}) {
  // Pocket : la limite est par NOM de carte, pas par cardId. Tu peux mettre
  // 1 Pikachu-ex ◆◆◆◆ + 1 Pikachu-ex ★ (= 2 par nom), pas 2+2=4.
  const reachedNameCap = inDeckSameName >= maxCopies;
  const noMoreOwned = inDeckThisCard >= owned;
  const canAdd = !reachedNameCap && !noMoreOwned;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92vh] flex-col items-center gap-3"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.image}
          alt={card.name}
          className="h-[78vh] w-auto rounded-lg object-contain shadow-2xl"
        />
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 rounded-full bg-zinc-900 p-2 text-zinc-200 shadow-lg ring-1 ring-white/20 hover:bg-zinc-800"
          aria-label="Fermer"
        >
          ✕
        </button>
        <div className="flex items-center gap-3 rounded-full border border-white/15 bg-zinc-900/95 px-4 py-2 text-sm text-zinc-200">
          <span className="font-semibold text-zinc-100">{card.name}</span>
          <span className="text-xs text-zinc-500">
            · {owned} possédée{owned > 1 ? "s" : ""}
            {inDeckSameName > 0
              ? ` · ${inDeckSameName} "${card.name}" dans le deck`
              : ""}
          </span>
          <button
            onClick={onAdd}
            disabled={!canAdd}
            className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-bold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {owned === 0
              ? "Pas en collection"
              : reachedNameCap
                ? `Max ${maxCopies} "${card.name}" atteint`
                : noMoreOwned
                  ? "Plus de copies de cette version"
                  : `+ Ajouter au deck (${inDeckSameName}/${maxCopies})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function PickerChip({
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

function PickerSeparator() {
  return <span className="mx-1 h-5 w-px self-center bg-white/10" />;
}

// ─── Deck header (en haut du builder) ────────────────────────────────────

/** En-tête du deck builder : titre + compteur + sélecteur d'énergies, puis
 *  une grille de mini-cartes visuelles (image) plus grandes pour profiter de
 *  l'espace libéré (plus de breakdown stage). Click = retire 1 ex. */
function DeckHeader({
  draftEntries,
  cardById,
  onRemove,
  energyTypes,
  onToggleEnergy,
}: {
  draftEntries: Map<string, number>;
  cardById: Map<string, PokemonCardData>;
  onRemove: (cardId: string) => void;
  energyTypes: PokemonEnergyType[];
  onToggleEnergy: (t: PokemonEnergyType) => void;
}) {
  const { cards, totalCount } = useMemo(() => {
    const list: { card: PokemonCardData; count: number }[] = [];
    let total = 0;
    for (const [cardId, count] of draftEntries) {
      const card = cardById.get(cardId);
      if (!card) continue;
      list.push({ card, count });
      total += count;
    }
    // Tri : Pokémon de base d'abord (par nom), puis stage1, stage2, dresseurs.
    list.sort((a, b) => {
      const order = (c: PokemonCardData) =>
        c.kind === "trainer"
          ? 4
          : c.stage === "basic"
            ? 1
            : c.stage === "stage1"
              ? 2
              : 3;
      const oa = order(a.card);
      const ob = order(b.card);
      if (oa !== ob) return oa - ob;
      return a.card.name.localeCompare(b.card.name);
    });
    return { cards: list, totalCount: total };
  }, [draftEntries, cardById]);

  return (
    <div className="shrink-0 border-b border-white/5 bg-gradient-to-b from-emerald-900/15 to-transparent">
      {/* Header : titre + compteur + sélecteur d'énergies sur la même ligne */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs">
        <span className="font-bold uppercase tracking-widest text-emerald-200">
          🛠️ Mon deck
        </span>
        <span
          className={`rounded-md border px-2 py-0.5 font-semibold tabular-nums ${
            totalCount === 20
              ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
              : "border-amber-400/40 bg-amber-400/10 text-amber-200"
          }`}
        >
          {totalCount}/20
        </span>
        <span className="mx-1 h-5 w-px self-center bg-white/10" />
        <span className="text-[10px] uppercase tracking-widest text-zinc-400">
          ⚡ Énergies ({energyTypes.length}/3)
        </span>
        {PICKER_TYPE_OPTIONS.map((t) => {
          const active = energyTypes.includes(t.id);
          const disabled = !active && energyTypes.length >= 3;
          return (
            <button
              key={t.id}
              onClick={() => onToggleEnergy(t.id)}
              disabled={disabled}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                active
                  ? "border-amber-400/70 bg-amber-400/20 text-amber-100"
                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
              }`}
              title={
                disabled
                  ? "Max 3 types — désélectionne un autre"
                  : t.title
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Grille des cartes du deck (mini-images cliquables pour retirer) */}
      <div className="max-h-[260px] overflow-y-auto px-4 pb-3">
        {totalCount === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 p-3 text-center text-xs text-zinc-500">
            Deck vide — clique sur une carte ci-dessous pour l&apos;ajouter
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <AnimatePresence initial={false}>
              {cards.map(({ card, count }) => (
                <motion.button
                  key={card.id}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  onClick={() => onRemove(card.id)}
                  className="group relative shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/30 transition-all hover:border-rose-400/60 hover:ring-2 hover:ring-rose-400/40"
                  style={{ width: 90, height: 126 }}
                  title={`${card.name} — clic pour retirer 1 copie`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.image}
                    alt={card.name}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                  {/* Badge count en haut à droite */}
                  <span className="absolute right-0.5 top-0.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 shadow">
                    ×{count}
                  </span>
                  {/* Overlay "retirer" au hover */}
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-rose-900/60 text-lg opacity-0 transition-opacity group-hover:opacity-100">
                    ✕
                  </span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
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
