"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
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
/** Cap UI sur le nombre de decks par joueur. 20 est un compromis raisonnable :
 *  largement assez pour explorer toutes les archétypes Pocket sans saturer
 *  la sidebar. Le check est aussi à mettre côté serveur via SQL. */
const MAX_DECKS = 20;

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

  // Types Pokémon présents dans le draft — sert pour l'auto-sélection
  // d'énergies et pour disabler les types qui ne servent à rien dans
  // ce deck (un deck sans Pokémon Feu n'a aucune raison d'avoir l'énergie
  // Feu sélectionnée).
  const deckPokemonTypes = useMemo(() => {
    const set = new Set<PokemonEnergyType>();
    for (const [cardId] of draftEntries) {
      const c = POKEMON_BASE_SET_BY_ID.get(cardId);
      if (c?.kind === "pokemon") set.add(c.type);
    }
    return set;
  }, [draftEntries]);

  // Auto-sélection des énergies : à chaque changement du deck, on
  // resynchronise la sélection :
  //   • Si le deck contient des Pokémon Feu/Plante/Psy → on auto-sélectionne
  //     ces 3 types (l'utilisateur peut ensuite en désélectionner jusqu'à
  //     1 minimum).
  //   • Si l'utilisateur a manuellement désélectionné un type ET que le
  //     deck contient toujours ce type → on respecte son choix tant qu'il
  //     reste >= 1 énergie. C'est l'invariant : on ne ré-ajoute jamais
  //     un type que l'utilisateur a explicitement retiré, sauf si la
  //     sélection passerait à 0.
  //   • Si le deck contient un nouveau type non encore couvert → on l'ajoute
  //     automatiquement (jusqu'à 3 max).
  //   • Si la sélection contient un type qui n'est plus dans le deck → on
  //     le retire (sauf si c'est la seule énergie restante, pour respecter
  //     "minimum 1").
  const prevDeckTypesRef = useRef<Set<PokemonEnergyType>>(new Set());
  useEffect(() => {
    setDraftEnergyTypes((prev) => {
      const prevDeck = prevDeckTypesRef.current;
      const next = new Set(prev);
      // Retire les types qui ne sont plus dans le deck.
      for (const t of prev) {
        if (!deckPokemonTypes.has(t)) next.delete(t);
      }
      // Ajoute les types nouvellement présents dans le deck (qui n'étaient
      // pas là avant).
      for (const t of deckPokemonTypes) {
        if (!prevDeck.has(t) && next.size < 3) next.add(t);
      }
      // Garantit qu'il y a au moins 1 énergie si le deck contient des
      // Pokémon : on prend le 1er type dispo si la sélection est vide.
      if (next.size === 0 && deckPokemonTypes.size > 0) {
        const first = Array.from(deckPokemonTypes)[0];
        next.add(first);
      }
      prevDeckTypesRef.current = new Set(deckPokemonTypes);
      const arr = Array.from(next);
      // Évite re-render si rien ne change.
      if (
        arr.length === prev.length &&
        arr.every((t) => prev.includes(t))
      ) {
        return prev;
      }
      return arr;
    });
  }, [deckPokemonTypes]);

  // Toggle un type d'énergie. Cap à 3 max ; minimum 1 SI le deck contient
  // au moins un Pokémon (sinon le joueur peut tout désélectionner pendant
  // la construction).
  const toggleEnergyType = useCallback(
    (t: PokemonEnergyType) => {
      setDraftEnergyTypes((prev) => {
        if (prev.includes(t)) {
          // Refuse de retirer si c'est la dernière et que le deck
          // contient des Pokémon (sinon le deck devient invalide).
          if (prev.length <= 1 && deckPokemonTypes.size > 0) return prev;
          return prev.filter((x) => x !== t);
        }
        if (prev.length >= 3) return prev;
        return [...prev, t];
      });
    },
    [deckPokemonTypes],
  );

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
      leaderId: null,
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
            disabled={decks.length >= MAX_DECKS}
            title={
              decks.length >= MAX_DECKS
                ? `Limite atteinte (${MAX_DECKS} decks max). Supprime un deck pour en créer un nouveau.`
                : undefined
            }
            className="mb-3 shrink-0 rounded-md bg-amber-500 px-3 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            + Nouveau deck
          </button>
          <div className="mb-2 shrink-0 text-[10px] uppercase tracking-widest text-zinc-500">
            Mes decks{" "}
            <span
              className={`tabular-nums ${
                decks.length >= MAX_DECKS ? "text-amber-300" : "text-zinc-400"
              }`}
            >
              ({decks.length}/{MAX_DECKS})
            </span>
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
                  className={`group flex flex-col gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    isActive
                      ? "bg-amber-400/15 text-amber-200"
                      : "bg-white/[0.02] text-zinc-200 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <button
                      onClick={() => loadDraftFromDeck(deck)}
                      className="flex flex-1 flex-col items-start"
                    >
                      <span className="truncate font-semibold">{deck.name}</span>
                      <span className="text-[10px] text-zinc-500">
                        {cardSum}/{DECK_TARGET} cartes
                        {deck.isPublic && deck.shareCode && (
                          <span className="ml-1 text-emerald-400">
                            · 🔗 {deck.shareCode}
                          </span>
                        )}
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
                  {/* Bouton Partager / Privé : visible au hover ou si actif */}
                  <ShareDeckRow deck={deck} />
                </div>
              );
            })}
          </div>
          <ImportDeckSection />
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
                  deckPokemonTypes={deckPokemonTypes}
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
// Pattern aligné sur CollectionGrid pour cohérence (cf. collection-grid.tsx) :
//   • Catégorie EXCLUSIVE (radio) — switch reset les filtres dépendants
//   • Types Pokémon visibles seulement si category !== "trainer"
//   • Raretés dans l'ordre croissant (◆ → ◆◆ → ◆◆◆ → ◆◆◆◆ → ★ → ★★ → ★★★ → 👑)
//   • Pour Dresseurs : on ne montre que les raretés effectivement présentes
//   • "EX" toggle après couronne, visible seulement pour Pokémon
//   • Tri : 3 options (Pokédex / Rareté / Nom A→Z) + flèche bidirectionnelle
//   • Fix bug : tri Pokédex utilise pokedexId (pas number qui mixait Dresseurs)

type PickerOwned = "all" | "owned" | "missing";
type PickerSort = "pokedex" | "name" | "rarity";
type PickerSortDir = "asc" | "desc";
type PickerCategory = "all" | "pokemon" | "trainer";

const PICKER_TYPE_OPTIONS: { id: PokemonEnergyType; label: string; title: string }[] = [
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

const PICKER_CATEGORY_OPTIONS: { id: PickerCategory; label: string; title: string }[] = [
  { id: "all", label: "Tout", title: "Pokémon + Dresseurs" },
  { id: "pokemon", label: "Pokémon", title: "Pokémon uniquement" },
  { id: "trainer", label: "Dresseurs", title: "Dresseurs (Supporter + Objet)" },
];

const PICKER_RARITY_OPTIONS: { id: TcgRarity; label: string; title: string }[] = [
  { id: "diamond-1", label: "◆", title: "Commune (1 losange)" },
  { id: "diamond-2", label: "◆◆", title: "Peu commune (2 losanges)" },
  { id: "diamond-3", label: "◆◆◆", title: "Rare (3 losanges)" },
  { id: "diamond-4", label: "◆◆◆◆", title: "Rare ex (4 losanges)" },
  { id: "star-1", label: "★", title: "Full Art (1 étoile)" },
  { id: "star-2", label: "★★", title: "Full Art alt (2 étoiles)" },
  { id: "star-3", label: "★★★", title: "Immersive (3 étoiles)" },
  { id: "crown", label: "👑", title: "Couronne brillante" },
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
  const [category, setCategory] = useState<PickerCategory>("all");
  const [types, setTypes] = useState<Set<PokemonEnergyType>>(new Set());
  const [rarities, setRarities] = useState<Set<TcgRarity>>(new Set());
  const [exOnly, setExOnly] = useState(false);
  const [ownedFilter, setOwnedFilter] = useState<PickerOwned>("owned");
  const [sortMode, setSortMode] = useState<PickerSort>("pokedex");
  const [sortDir, setSortDir] = useState<PickerSortDir>("asc");
  const [previewCard, setPreviewCard] = useState<PokemonCardData | null>(null);

  // Reset filtres dépendants au changement de catégorie.
  function setCategoryReset(v: PickerCategory) {
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

  // Raretés effectivement présentes pour la catégorie active (pour
  // n'afficher que les chips utiles sur "trainer").
  const availableRarities = useMemo(() => {
    const seen = new Set<TcgRarity>();
    for (const c of pool) {
      if (category === "pokemon" && c.kind !== "pokemon") continue;
      if (category === "trainer" && c.kind !== "trainer") continue;
      seen.add(c.rarity);
    }
    return seen;
  }, [pool, category]);
  const visibleRarities =
    category === "trainer"
      ? PICKER_RARITY_OPTIONS.filter((r) => availableRarities.has(r.id))
      : PICKER_RARITY_OPTIONS;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((c) => {
      const owned = collection.get(c.id) ?? 0;
      if (ownedFilter === "owned" && owned <= 0) return false;
      if (ownedFilter === "missing" && owned > 0) return false;
      if (category === "pokemon" && c.kind !== "pokemon") return false;
      if (category === "trainer" && c.kind !== "trainer") return false;
      if (types.size > 0) {
        if (c.kind !== "pokemon" || !types.has(c.type)) return false;
      }
      if (rarities.size > 0 && !rarities.has(c.rarity)) return false;
      if (exOnly && (c.kind !== "pokemon" || !c.isEx)) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pool, collection, search, category, types, rarities, exOnly, ownedFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortMode) {
        case "pokedex": {
          // Bug fix : pokedexId au lieu de number (qui mixait Pokémon
          // et Dresseurs). Dresseurs → 9999 (en fin de liste).
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
  }, [filtered, sortMode, sortDir]);

  const filtersChanged =
    !!search ||
    category !== "all" ||
    types.size > 0 ||
    rarities.size > 0 ||
    exOnly ||
    ownedFilter !== "owned";

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
                ? "Croissant — clic pour décroissant"
                : "Décroissant — clic pour croissant"
            }
            aria-label={sortDir === "asc" ? "Tri croissant" : "Tri décroissant"}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
          {filtersChanged && (
            <button
              onClick={() => {
                setSearch("");
                setCategoryReset("all");
                setOwnedFilter("owned");
              }}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
              Reset
            </button>
          )}
        </div>
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
              active={category === c.id}
              onClick={() => setCategoryReset(c.id)}
              label={c.label}
              title={c.title}
            />
          ))}
          {category !== "trainer" && (
            <>
              <PickerSeparator />
              {PICKER_TYPE_OPTIONS.map((t) => (
                <PickerChip
                  key={t.id}
                  active={types.has(t.id)}
                  onClick={() => toggleType(t.id)}
                  label={t.label}
                  title={t.title}
                />
              ))}
            </>
          )}
          <PickerSeparator />
          {visibleRarities.map((r) => (
            <PickerChip
              key={r.id}
              active={rarities.has(r.id)}
              onClick={() => toggleRarity(r.id)}
              label={r.label}
              title={r.title}
            />
          ))}
          {category !== "trainer" && (
            <PickerChip
              active={exOnly}
              onClick={() => setExOnly((v) => !v)}
              label="EX"
              title="Pokémon EX uniquement"
            />
          )}
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
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
  deckPokemonTypes,
}: {
  draftEntries: Map<string, number>;
  cardById: Map<string, PokemonCardData>;
  onRemove: (cardId: string) => void;
  energyTypes: PokemonEnergyType[];
  onToggleEnergy: (t: PokemonEnergyType) => void;
  /** Set des types Pokémon présents dans le deck — sert à griser les
   *  types non-pertinents (ex. Feu si deck full Plante). */
  deckPokemonTypes: Set<PokemonEnergyType>;
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
          const inDeck = deckPokemonTypes.has(t.id);
          // Disabled si :
          //   • Déjà 3 sélectionnés et celui-ci n'est pas actif
          //   • OU le type n'est dans aucune carte Pokémon du deck (ne sert
          //     à rien de sélectionner Feu si aucun Pokémon Feu)
          //   • Empêche aussi de désélectionner si c'est la dernière
          //     énergie restante (minimum 1 si le deck contient des Pokémon)
          const overCap = !active && energyTypes.length >= 3;
          const lastOne =
            active && energyTypes.length <= 1 && deckPokemonTypes.size > 0;
          const irrelevant = !active && !inDeck;
          const disabled = overCap || lastOne || irrelevant;
          return (
            <button
              key={t.id}
              onClick={() => onToggleEnergy(t.id)}
              disabled={disabled}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                active
                  ? "border-amber-400/70 bg-amber-400/20 text-amber-100"
                  : inDeck
                    ? "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
                    : "border-white/5 bg-white/[0.01] text-zinc-500"
              }`}
              title={
                lastOne
                  ? "Au moins 1 énergie requise tant que le deck contient des Pokémon"
                  : overCap
                    ? "Max 3 types — désélectionne un autre"
                    : irrelevant
                      ? `${t.title} — aucun Pokémon ${t.title.toLowerCase()} dans le deck`
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

/** Bouton de partage de deck inline dans la sidebar : visible au hover.
 *  Si le deck est privé → bouton « 📤 Partager » qui appelle publish_deck.
 *  Si le deck est public → bouton « 📋 Copier » + « 🔒 Privé » pour
 *  re-privatiser. */
function ShareDeckRow({ deck }: { deck: TcgDeck }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onPublish = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      if (!supabase) {
        setError("Supabase indisponible");
        return;
      }
      const { error: e } = await supabase.rpc("publish_deck", {
        p_deck_id: deck.id,
      });
      if (e) setError(e.message);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onUnpublish = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      if (!supabase) return;
      const { error: e } = await supabase.rpc("unpublish_deck", {
        p_deck_id: deck.id,
      });
      if (e) setError(e.message);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onCopyCode = async () => {
    if (!deck.shareCode) return;
    try {
      await navigator.clipboard.writeText(deck.shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-wrap gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      {!deck.isPublic ? (
        <button
          onClick={onPublish}
          disabled={busy}
          className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
          title="Rendre ce deck public et obtenir un code de partage"
        >
          📤 Partager
        </button>
      ) : (
        <>
          <button
            onClick={onCopyCode}
            className="rounded border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/20"
            title="Copier le code dans le presse-papier"
          >
            {copied ? "✓ Copié" : "📋 Copier"}
          </button>
          <button
            onClick={onUnpublish}
            disabled={busy}
            className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-white/10 disabled:opacity-40"
            title="Repasser le deck en privé"
          >
            🔒 Privé
          </button>
        </>
      )}
      {error && (
        <span className="w-full text-[9px] text-rose-300">{error}</span>
      )}
    </div>
  );
}

/** Section « Importer un deck par code » placée en bas de la sidebar.
 *  L'utilisateur tape un code (6 caractères), on appelle import_deck_by_code
 *  qui crée une copie chez lui (« Copie de … »). */
function ImportDeckSection() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  const onImport = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const supabase = createBrowserClient();
      if (!supabase) {
        setError("Supabase indisponible");
        return;
      }
      const { error: e } = await supabase.rpc("import_deck_by_code", {
        p_code: code.trim().toUpperCase(),
      });
      if (e) {
        setError(e.message);
      } else {
        setSuccess("Deck importé !");
        setCode("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 shrink-0 rounded-md border border-white/5 bg-black/20 p-2">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">
        🔗 Importer un deck
      </div>
      <div className="mt-1 flex gap-1">
        <input
          type="text"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
          }
          placeholder="ABC123"
          maxLength={6}
          className="flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-400/50 focus:outline-none"
        />
        <button
          onClick={onImport}
          disabled={busy || code.length !== 6}
          className="rounded bg-emerald-500 px-2 py-1 text-xs font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          ↓
        </button>
      </div>
      {error && (
        <div className="mt-1 text-[9px] text-rose-300">{error}</div>
      )}
      {success && (
        <div className="mt-1 text-[9px] text-emerald-300">{success}</div>
      )}
    </div>
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
