"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OnePieceCardData,
  OnePieceColor,
  OnePieceLeaderCard,
  TcgCardOwned,
  TcgClientMessage,
  TcgDeck,
  TcgDeckEntry,
  TcgServerMessage,
} from "@shared/types";
import { TCG_GAMES } from "@shared/types";
import {
  ONEPIECE_BASE_SET,
  ONEPIECE_BASE_SET_BY_ID,
} from "@shared/tcg-onepiece-base";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import {
  CardZoomModal,
  ONEPIECE_COLOR_GLYPH,
  ONEPIECE_COLOR_LABEL,
  ONEPIECE_RARITY_COLOR,
  ONEPIECE_RARITY_TIER,
} from "./onepiece-card-visuals";
import { CardPreview } from "./card-hover-preview";

type ConnStatus = "connecting" | "connected" | "disconnected";
type View = "list" | "editor";

const DECK_SIZE = 50;
const MAX_COPIES = 4;
const DECK_NAME_MAX = 40;

export function OnePieceDecksClient({
  profile,
}: {
  profile: Profile | null;
}) {
  const game = TCG_GAMES.onepiece;
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [collection, setCollection] = useState<Map<string, number>>(new Map());
  const [decks, setDecks] = useState<TcgDeck[]>([]);
  const [view, setView] = useState<View>("list");

  // Draft (éditeur courant).
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>("");
  const [draftLeaderId, setDraftLeaderId] = useState<string | null>(null);
  const [draftEntries, setDraftEntries] = useState<Map<string, number>>(
    new Map(),
  );
  const [zoomedCard, setZoomedCard] = useState<OnePieceCardData | null>(null);

  const send = useCallback((msg: TcgClientMessage) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

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
    const url = `${scheme}://${partyHost}/parties/tcg/onepiece${
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
      switch (msg.type) {
        case "tcg-welcome": {
          const m = new Map<string, number>();
          for (const c of msg.collection as TcgCardOwned[]) {
            m.set(c.cardId, c.count);
          }
          setCollection(m);
          setDecks(msg.decks);
          break;
        }
        case "tcg-decks":
          setDecks(msg.decks);
          // Save reussi : retour à la liste.
          setView("list");
          setErrorMsg(null);
          break;
        case "tcg-error":
          setErrorMsg(msg.message);
          break;
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
    };
  }, [profile]);

  const totalCount = useMemo(
    () => Array.from(draftEntries.values()).reduce((s, n) => s + n, 0),
    [draftEntries],
  );

  const draftLeader = draftLeaderId
    ? (ONEPIECE_BASE_SET_BY_ID.get(draftLeaderId) as OnePieceLeaderCard | undefined)
    : undefined;

  const allowedColors = useMemo(() => {
    if (!draftLeader) return new Set<OnePieceColor>();
    return new Set<OnePieceColor>(draftLeader.color);
  }, [draftLeader]);

  // Cartes possédées qui peuvent aller dans le deck (couleur partagée +
  // pas Leader, pas DON).
  const eligibleCards = useMemo(() => {
    if (!draftLeader) return [] as OnePieceCardData[];
    const out: OnePieceCardData[] = [];
    for (const card of ONEPIECE_BASE_SET) {
      if (card.kind === "leader" || card.kind === "don") continue;
      const owned = collection.get(card.id) ?? 0;
      if (owned <= 0) continue;
      const colors = "color" in card ? card.color : [];
      const sharesColor = colors.some((c) => allowedColors.has(c));
      if (!sharesColor) continue;
      out.push(card);
    }
    out.sort((a, b) => {
      const ra = ONEPIECE_RARITY_TIER[a.rarity] ?? 0;
      const rb = ONEPIECE_RARITY_TIER[b.rarity] ?? 0;
      if (ra !== rb) return rb - ra;
      const ca = "cost" in a ? a.cost : 99;
      const cb = "cost" in b ? b.cost : 99;
      if (ca !== cb) return ca - cb;
      return a.name.localeCompare(b.name);
    });
    return out;
  }, [draftLeader, collection, allowedColors]);

  // Leaders possédés (pour la sélection). DÉDUPLIQUÉ par cardNumber :
  // si l'utilisateur possède Shanks `OP09-001` et l'alt-art `OP09-001_p1`,
  // une seule entrée "Shanks" apparaît (avec préférence pour l'alt-art si
  // possédé, sinon la version normale). Évite les doublons confus.
  const ownedLeaders = useMemo(() => {
    const byNumber = new Map<string, OnePieceLeaderCard>();
    for (const card of ONEPIECE_BASE_SET) {
      if (card.kind !== "leader") continue;
      if ((collection.get(card.id) ?? 0) <= 0) continue;
      const existing = byNumber.get(card.cardNumber);
      // Préfère l'alt-art (id contient `_p`) si possédé, sinon la base.
      const isAlt = /_p\d+$/.test(card.id);
      if (!existing) {
        byNumber.set(card.cardNumber, card);
      } else if (isAlt) {
        byNumber.set(card.cardNumber, card);
      }
    }
    return Array.from(byNumber.values()).sort((a, b) =>
      a.cardNumber.localeCompare(b.cardNumber),
    );
  }, [collection]);

  // Total de leaders uniques dans le base set (pour afficher progression).
  const totalUniqueLeaders = useMemo(() => {
    const set = new Set<string>();
    for (const card of ONEPIECE_BASE_SET) {
      if (card.kind === "leader") set.add(card.cardNumber);
    }
    return set.size;
  }, []);

  function startNewDeck() {
    setDraftId(null);
    setDraftName("");
    setDraftLeaderId(null);
    setDraftEntries(new Map());
    setErrorMsg(null);
    setView("editor");
  }

  function editDeck(d: TcgDeck) {
    setDraftId(d.id);
    setDraftName(d.name);
    setDraftLeaderId(d.leaderId);
    const m = new Map<string, number>();
    for (const c of d.cards) m.set(c.cardId, c.count);
    setDraftEntries(m);
    setErrorMsg(null);
    setView("editor");
  }

  function deleteDeck(d: TcgDeck) {
    if (!confirm(`Supprimer le deck "${d.name}" ?`)) return;
    send({ type: "tcg-delete-deck", deckId: d.id });
  }

  function pickLeader(leaderId: string) {
    // Changer de Leader vide le deck (les couleurs autorisées changent).
    if (draftLeaderId && draftLeaderId !== leaderId && draftEntries.size > 0) {
      if (
        !confirm(
          "Changer de Leader vide le deck (les couleurs autorisées changent). Continuer ?",
        )
      ) {
        return;
      }
    }
    setDraftLeaderId(leaderId);
    setDraftEntries(new Map());
  }

  function addCard(cardId: string) {
    const owned = collection.get(cardId) ?? 0;
    setDraftEntries((prev) => {
      const next = new Map(prev);
      const cur = next.get(cardId) ?? 0;
      const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
      if (!meta) return prev;
      // Vérifier max 4 copies par cardNumber (alt-arts comptent ensemble).
      let sameCardNumber = 0;
      for (const [id, n] of next) {
        const m = ONEPIECE_BASE_SET_BY_ID.get(id);
        if (m && m.cardNumber === meta.cardNumber) sameCardNumber += n;
      }
      if (sameCardNumber >= MAX_COPIES) return prev;
      if (cur >= owned) return prev;
      const total = Array.from(next.values()).reduce((s, n) => s + n, 0);
      if (total >= DECK_SIZE) return prev;
      next.set(cardId, cur + 1);
      return next;
    });
  }

  function removeCard(cardId: string) {
    setDraftEntries((prev) => {
      const next = new Map(prev);
      const cur = next.get(cardId) ?? 0;
      if (cur <= 1) next.delete(cardId);
      else next.set(cardId, cur - 1);
      return next;
    });
  }

  function saveDeck() {
    setErrorMsg(null);
    if (!draftLeaderId) {
      setErrorMsg("Sélectionne un Leader.");
      return;
    }
    if (totalCount !== DECK_SIZE) {
      setErrorMsg(
        `Le deck doit contenir exactement ${DECK_SIZE} cartes (actuellement ${totalCount}).`,
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
      energyTypes: [], // ignoré côté server pour OnePiece
      leaderId: draftLeaderId,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/onepiece`}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← {game.name}
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">🛠️ Mes Decks</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main
        className={`relative flex flex-1 flex-col overflow-hidden p-6 ${game.gradient}`}
      >
        {status !== "connected" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="text-sm text-zinc-300">
              {status === "connecting"
                ? "Connexion..."
                : "Connexion perdue — recharger la page."}
            </div>
          </div>
        )}

        {!profile ? (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
            Connecte-toi pour gérer tes decks.
          </div>
        ) : view === "list" ? (
          <DecksList
            decks={decks}
            onNew={startNewDeck}
            onEdit={editDeck}
            onDelete={deleteDeck}
          />
        ) : (
          <DeckEditor
            draftName={draftName}
            setDraftName={setDraftName}
            draftLeader={draftLeader}
            ownedLeaders={ownedLeaders}
            totalUniqueLeaders={totalUniqueLeaders}
            pickLeader={pickLeader}
            draftEntries={draftEntries}
            totalCount={totalCount}
            eligibleCards={eligibleCards}
            collection={collection}
            addCard={addCard}
            removeCard={removeCard}
            saveDeck={saveDeck}
            cancel={() => setView("list")}
            errorMsg={errorMsg}
            onZoomCard={setZoomedCard}
          />
        )}

        <CardZoomModal card={zoomedCard} onClose={() => setZoomedCard(null)} />
      </main>
    </div>
  );
}

function DecksList({
  decks,
  onNew,
  onEdit,
  onDelete,
}: {
  decks: TcgDeck[];
  onNew: () => void;
  onEdit: (d: TcgDeck) => void;
  onDelete: (d: TcgDeck) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">🛠️ Mes Decks</h1>
          <p className="mt-1 text-sm text-zinc-400">
            One Piece TCG : 1 Leader + 50 cartes, max 4 copies par carte (alt-arts
            inclus). Toutes les cartes doivent partager au moins une couleur
            avec le Leader.
          </p>
        </div>
        <button
          onClick={onNew}
          className="rounded-md bg-rose-500 px-4 py-2 text-sm font-bold text-rose-950 shadow hover:bg-rose-400"
        >
          + Nouveau deck
        </button>
      </div>

      {decks.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
          Aucun deck sauvegardé. Clique « Nouveau deck » pour commencer.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {decks.map((d) => {
            const leader = d.leaderId
              ? (ONEPIECE_BASE_SET_BY_ID.get(d.leaderId) as
                  | OnePieceLeaderCard
                  | undefined)
              : undefined;
            const total = d.cards.reduce((s, c) => s + c.count, 0);
            return (
              <div
                key={d.id}
                className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/40 p-3"
              >
                <div className="flex items-center gap-3">
                  {leader ? (
                    <div className="h-16 w-12 shrink-0 overflow-hidden rounded border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={leader.image}
                        alt={leader.name}
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded border border-white/10 bg-zinc-900 text-xl">
                      ?
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-zinc-100">
                      {d.name}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {leader ? (
                        <>
                          Leader :{" "}
                          <span className="text-zinc-200">{leader.name}</span>{" "}
                          ·{" "}
                          {leader.color
                            .map((c) => ONEPIECE_COLOR_GLYPH[c])
                            .join(" ")}
                        </>
                      ) : (
                        <span className="text-rose-300">Leader manquant</span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {total} / 50 cartes
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(d)}
                    className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => onDelete(d)}
                    className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeckEditor({
  draftName,
  setDraftName,
  draftLeader,
  ownedLeaders,
  totalUniqueLeaders,
  pickLeader,
  draftEntries,
  totalCount,
  eligibleCards,
  collection,
  addCard,
  removeCard,
  saveDeck,
  cancel,
  errorMsg,
  onZoomCard,
}: {
  draftName: string;
  setDraftName: (v: string) => void;
  draftLeader: OnePieceLeaderCard | undefined;
  ownedLeaders: OnePieceLeaderCard[];
  totalUniqueLeaders: number;
  pickLeader: (id: string) => void;
  draftEntries: Map<string, number>;
  totalCount: number;
  eligibleCards: OnePieceCardData[];
  collection: Map<string, number>;
  addCard: (id: string) => void;
  removeCard: (id: string) => void;
  saveDeck: () => void;
  cancel: () => void;
  errorMsg: string | null;
  onZoomCard: (c: OnePieceCardData) => void;
}) {
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<"all" | "character" | "event" | "stage">("all");
  const [filterCostMin, setFilterCostMin] = useState<number>(0);
  const [filterCostMax, setFilterCostMax] = useState<number>(10);
  const [filterRarity, setFilterRarity] = useState<string>("all");
  const [filterColor, setFilterColor] = useState<OnePieceColor | "all">("all");
  const [sortBy, setSortBy] = useState<"cost-asc" | "cost-desc" | "name" | "power">("cost-asc");

  // Si Leader bi-couleur (ou plus), on propose un filtre de couleur entre
  // les couleurs autorisées. Mono-couleur → pas besoin.
  const leaderColors = draftLeader?.color ?? [];
  const showColorFilter = leaderColors.length > 1;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = eligibleCards.filter((c) => {
      if (filterKind !== "all" && c.kind !== filterKind) return false;
      if (c.kind !== "leader" && "cost" in c) {
        if (c.cost < filterCostMin) return false;
        if (filterCostMax < 10 && c.cost > filterCostMax) return false;
      }
      if (filterRarity !== "all" && c.rarity !== filterRarity) return false;
      if (
        filterColor !== "all" &&
        c.kind !== "don" &&
        !c.color.includes(filterColor)
      )
        return false;
      if (q) {
        const hay = (c.name + " " + c.id + " " + c.types.join(" "))
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    result = [...result].sort((a, b) => {
      const ca = "cost" in a ? a.cost : 99;
      const cb = "cost" in b ? b.cost : 99;
      const pa = "power" in a ? (a.power as number) : 0;
      const pb = "power" in b ? (b.power as number) : 0;
      if (sortBy === "cost-asc")
        return ca - cb || a.name.localeCompare(b.name);
      if (sortBy === "cost-desc")
        return cb - ca || a.name.localeCompare(b.name);
      if (sortBy === "power") return pb - pa || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return result;
  }, [
    eligibleCards,
    search,
    filterKind,
    filterCostMin,
    filterCostMax,
    filterRarity,
    filterColor,
    sortBy,
  ]);

  // Mana curve : compte de cartes par coût (0-10+).
  const manaCurve = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 0..10+
    for (const [cardId, count] of draftEntries) {
      const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
      if (!meta || !("cost" in meta)) continue;
      const idx = Math.min(10, meta.cost);
      buckets[idx] += count;
    }
    return buckets;
  }, [draftEntries]);
  const maxBucket = Math.max(...manaCurve, 1);

  const cardsInDeck = useMemo(() => {
    const arr: { card: OnePieceCardData; count: number }[] = [];
    for (const [id, count] of draftEntries) {
      const meta = ONEPIECE_BASE_SET_BY_ID.get(id);
      if (meta) arr.push({ card: meta, count });
    }
    arr.sort((a, b) => {
      const ca = "cost" in a.card ? a.card.cost : 99;
      const cb = "cost" in b.card ? b.card.cost : 99;
      if (ca !== cb) return ca - cb;
      return a.card.name.localeCompare(b.card.name);
    });
    return arr;
  }, [draftEntries]);

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-3 overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/40 p-3">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value.slice(0, DECK_NAME_MAX))}
          placeholder="Nom du deck…"
          className="flex-1 min-w-[200px] rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-rose-400/50 focus:outline-none"
        />
        <div className="text-sm tabular-nums text-zinc-300">
          <span
            className={
              totalCount === DECK_SIZE
                ? "text-emerald-300"
                : totalCount > DECK_SIZE
                  ? "text-rose-300"
                  : "text-zinc-200"
            }
          >
            {totalCount}
          </span>
          {" / "}
          {DECK_SIZE} cartes
        </div>
        <button
          onClick={cancel}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
        >
          Annuler
        </button>
        <button
          onClick={saveDeck}
          disabled={!draftLeader || totalCount !== DECK_SIZE}
          className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-950 shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          💾 Sauvegarder
        </button>
      </div>

      {errorMsg && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {!draftLeader ? (
        <LeaderPicker
          leaders={ownedLeaders}
          totalUniqueLeaders={totalUniqueLeaders}
          onPick={pickLeader}
        />
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
          {/* Colonne gauche : Leader + cartes du deck */}
          <div className="flex w-[320px] shrink-0 flex-col gap-2 overflow-hidden">
            <LeaderPanel leader={draftLeader} onChange={() => pickLeader("")} />

            {/* Mana curve : histogramme des coûts dans le deck. */}
            <div className="rounded-lg border border-white/10 bg-black/30 p-2">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
                Courbe de coût
              </div>
              <div className="flex items-end justify-between gap-0.5 h-14">
                {manaCurve.map((n, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-0.5"
                    title={`Coût ${i === 10 ? "10+" : i} : ${n} carte(s)`}
                  >
                    <div className="text-[10px] tabular-nums text-zinc-400">
                      {n || ""}
                    </div>
                    <div
                      className="w-3 rounded-t bg-gradient-to-t from-amber-700 to-amber-400 transition-all"
                      style={{
                        height: `${(n / maxBucket) * 32}px`,
                        opacity: n > 0 ? 1 : 0.2,
                      }}
                    />
                    <div className="text-[10px] font-bold text-zinc-300 tabular-nums">
                      {i === 10 ? "10+" : i}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-2">
              <div className="text-[11px] uppercase tracking-widest text-zinc-500">
                Cartes ({totalCount}/{DECK_SIZE})
              </div>
              {cardsInDeck.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-500">
                  Ajoute des cartes depuis le picker →
                </div>
              ) : (
                cardsInDeck.map(({ card, count }) => (
                  <DeckCardRow
                    key={card.id}
                    card={card}
                    count={count}
                    onAdd={() => addCard(card.id)}
                    onRemove={() => removeCard(card.id)}
                    onZoom={() => onZoomCard(card)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Colonne droite : picker */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Recherche…"
                className="flex-1 min-w-[160px] rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-rose-400/50 focus:outline-none"
              />
              <select
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value as typeof filterKind)}
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-100 focus:border-rose-400/50 focus:outline-none"
                aria-label="Filtrer par type de carte"
              >
                <option value="all">Tous types</option>
                <option value="character">Personnages</option>
                <option value="event">Évents</option>
                <option value="stage">Lieux</option>
              </select>
              <select
                value={filterRarity}
                onChange={(e) => setFilterRarity(e.target.value)}
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-100 focus:border-rose-400/50 focus:outline-none"
                aria-label="Filtrer par rareté"
              >
                <option value="all">Toutes raretés</option>
                <option value="c">C — Commune</option>
                <option value="uc">UC — Peu commune</option>
                <option value="r">R — Rare</option>
                <option value="sr">SR — Super rare</option>
                <option value="sec">SEC — Secret rare</option>
                <option value="sp">SP — Special</option>
                <option value="tr">TR — Treasure</option>
                <option value="p">P — Promo</option>
              </select>
              {showColorFilter && (
                <select
                  value={filterColor}
                  onChange={(e) =>
                    setFilterColor(e.target.value as OnePieceColor | "all")
                  }
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-100 focus:border-rose-400/50 focus:outline-none"
                  aria-label="Filtrer par couleur"
                >
                  <option value="all">2 couleurs</option>
                  {leaderColors.map((c) => (
                    <option key={c} value={c}>
                      {ONEPIECE_COLOR_GLYPH[c]} {ONEPIECE_COLOR_LABEL[c]}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-100 focus:border-rose-400/50 focus:outline-none"
                aria-label="Trier les cartes"
              >
                <option value="cost-asc">Coût ↑</option>
                <option value="cost-desc">Coût ↓</option>
                <option value="power">Power ↓</option>
                <option value="name">Nom A-Z</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>Coût :</span>
              <input
                type="number"
                min={0}
                max={10}
                value={filterCostMin}
                onChange={(e) => setFilterCostMin(Number(e.target.value) || 0)}
                className="w-12 rounded border border-white/10 bg-black/40 px-1 py-0.5 text-center"
              />
              <span>—</span>
              <input
                type="number"
                min={0}
                max={10}
                value={filterCostMax}
                onChange={(e) => setFilterCostMax(Number(e.target.value) || 10)}
                className="w-12 rounded border border-white/10 bg-black/40 px-1 py-0.5 text-center"
              />
              <span className="text-zinc-500">
                ({filtered.length} carte{filtered.length > 1 ? "s" : ""})
              </span>
              <span className="ml-auto text-zinc-500">
                💡 click = ajouter · click droit = zoom
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-2">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  {eligibleCards.length === 0
                    ? "Aucune carte éligible — ouvre des boosters pour obtenir des cartes des couleurs de ton Leader."
                    : "Aucune carte ne matche ta recherche."}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {filtered.map((card) => {
                    const owned = collection.get(card.id) ?? 0;
                    const inDeck = draftEntries.get(card.id) ?? 0;
                    return (
                      <PickerCard
                        key={card.id}
                        card={card}
                        owned={owned}
                        inDeck={inDeck}
                        onAdd={() => addCard(card.id)}
                        onZoom={() => onZoomCard(card)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaderPicker({
  leaders,
  totalUniqueLeaders,
  onPick,
}: {
  leaders: OnePieceLeaderCard[];
  totalUniqueLeaders: number;
  onPick: (id: string) => void;
}) {
  // Filtre par couleur — chips multi-select.
  const [colorFilter, setColorFilter] = useState<Set<OnePieceColor>>(
    new Set(),
  );
  // Couleurs présentes dans la collection du joueur (pour ne pas afficher
  // une chip "Vert" s'il n'a aucun Leader vert).
  const availableColors = useMemo(() => {
    const set = new Set<OnePieceColor>();
    for (const l of leaders) for (const c of l.color) set.add(c);
    return set;
  }, [leaders]);

  const filtered = useMemo(() => {
    if (colorFilter.size === 0) return leaders;
    return leaders.filter((l) =>
      l.color.some((c) => colorFilter.has(c)),
    );
  }, [leaders, colorFilter]);

  function toggleColor(c: OnePieceColor) {
    setColorFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-lg border border-white/10 bg-black/40 p-4">
      <div className="shrink-0">
        <h2 className="text-lg font-bold text-zinc-100">Choisis ton Leader</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Le Leader détermine les couleurs autorisées dans ton deck. Mono-couleur
          : seules les cartes de cette couleur sont jouables. Bi-couleurs : les
          cartes de l&apos;une OU l&apos;autre couleur sont jouables (au moins
          une partagée).
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Tu possèdes <span className="font-bold text-amber-300">{leaders.length}</span> leader{leaders.length > 1 ? "s" : ""} unique{leaders.length > 1 ? "s" : ""}{" "}
          / {totalUniqueLeaders} dans le base set (variantes alt-art dédupliquées).
        </p>
      </div>

      {leaders.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center text-sm text-zinc-500">
          <div className="max-w-md">
            <p>Tu n&apos;as encore aucun Leader.</p>
            <p className="mt-2 text-xs">
              Ouvre tes boosters gratuits ! Le slot rare a ≈ 15% de chance de
              donner un Leader. Avec tes 10 packs au signup, tu as ≈ 80% de
              chance d&apos;en obtenir au moins un.
            </p>
            <Link
              href="/play/tcg/onepiece/boosters"
              className="mt-4 inline-block rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-sm font-bold text-amber-100 hover:bg-amber-400/20"
            >
              🎴 Ouvrir mes boosters
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Chips de filtre couleur */}
          {availableColors.size > 1 && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                Filtrer :
              </span>
              {(["rouge", "vert", "bleu", "violet", "noir", "jaune"] as const).map(
                (c) => {
                  if (!availableColors.has(c)) return null;
                  const active = colorFilter.has(c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggleColor(c)}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                        active
                          ? "border-amber-400/70 bg-amber-400/20 text-amber-100"
                          : "border-white/10 bg-black/30 text-zinc-400 hover:border-white/20"
                      }`}
                      aria-pressed={active}
                    >
                      {ONEPIECE_COLOR_GLYPH[c]} {ONEPIECE_COLOR_LABEL[c]}
                    </button>
                  );
                },
              )}
              {colorFilter.size > 0 && (
                <button
                  onClick={() => setColorFilter(new Set())}
                  className="ml-1 text-[10px] text-zinc-500 underline hover:text-zinc-300"
                >
                  effacer
                </button>
              )}
            </div>
          )}
          {/* Grille — content-start évite l'étirement vertical sur peu d'items.
              auto-rows-max garantit que les rangées ne s'étirent pas non plus. */}
          <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 content-start gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((leader) => (
              <button
                key={leader.id}
                onClick={() => onPick(leader.id)}
                className={`group flex flex-col gap-1 rounded-lg border bg-black/40 p-2 transition-all ${ONEPIECE_RARITY_COLOR[leader.rarity]} hover:scale-105 hover:border-amber-400/60 hover:bg-white/5`}
                aria-label={`Choisir le Leader ${leader.name}`}
              >
                <div className="aspect-[5/7] overflow-hidden rounded">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={leader.image}
                    alt={leader.name}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="text-center">
                  <div className="text-xs font-semibold text-zinc-100">
                    {leader.name}
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {leader.color
                      .map((c) => `${ONEPIECE_COLOR_GLYPH[c]} ${ONEPIECE_COLOR_LABEL[c]}`)
                      .join(" / ")}
                  </div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-6 text-center text-sm text-zinc-500">
                Aucun Leader ne matche ce filtre.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LeaderPanel({
  leader,
  onChange,
}: {
  leader: OnePieceLeaderCard;
  onChange: () => void;
}) {
  return (
    <div
      className={`flex shrink-0 flex-col gap-2 rounded-lg border bg-black/30 p-2 ${ONEPIECE_RARITY_COLOR[leader.rarity]}`}
    >
      <div className="aspect-[5/7] overflow-hidden rounded">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={leader.image}
          alt={leader.name}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-zinc-100">
            {leader.name}
          </div>
          <div className="text-[10px] text-zinc-400">
            {leader.color.map((c) => ONEPIECE_COLOR_GLYPH[c]).join(" ")}{" "}
            · Vie {leader.life}
          </div>
        </div>
        <button
          onClick={onChange}
          className="shrink-0 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10"
        >
          Changer
        </button>
      </div>
    </div>
  );
}

function PickerCard({
  card,
  owned,
  inDeck,
  onAdd,
  onZoom,
}: {
  card: OnePieceCardData;
  owned: number;
  inDeck: number;
  onAdd: () => void;
  onZoom: () => void;
}) {
  const remaining = owned - inDeck;
  const canAdd = remaining > 0 && inDeck < MAX_COPIES;
  return (
    <CardPreview
      cardId={card.id}
      imageUrl={card.image}
      name={card.name}
      effect={card.effect}
      trigger={card.trigger}
      className={`relative flex flex-col gap-1 rounded-md border bg-black/40 p-1 transition-all ${ONEPIECE_RARITY_COLOR[card.rarity]} ${
        canAdd ? "hover:scale-105 hover:border-emerald-400/60" : "opacity-50"
      }`}
    >
      <button
        onClick={canAdd ? onAdd : onZoom}
        onContextMenu={(e) => {
          e.preventDefault();
          onZoom();
        }}
        disabled={!canAdd && remaining <= 0}
        className="aspect-[5/7] overflow-hidden rounded"
        aria-label={
          canAdd
            ? `Ajouter ${card.name} au deck (clic droit pour agrandir)`
            : remaining <= 0
              ? `${card.name} : aucune copie disponible (clic pour agrandir)`
              : `${card.name} : 4 copies déjà dans le deck (clic pour agrandir)`
        }
        title={
          canAdd
            ? `Click : ajouter au deck · Click droit : zoom`
            : remaining <= 0
              ? "Aucune copie disponible"
              : "4 copies déjà dans le deck"
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.image}
          alt={card.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </button>
      <div className="flex items-center justify-between rounded bg-black/60 px-1 py-0.5 text-[10px]">
        <span className="font-bold text-emerald-200">
          {inDeck} / {Math.min(owned, MAX_COPIES)}
        </span>
        <span className="text-zinc-400">
          {"cost" in card ? `🟡${card.cost}` : ""}
        </span>
      </div>
    </CardPreview>
  );
}

function DeckCardRow({
  card,
  count,
  onAdd,
  onRemove,
  onZoom,
}: {
  card: OnePieceCardData;
  count: number;
  onAdd: () => void;
  onRemove: () => void;
  onZoom: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded border border-white/5 bg-black/30 p-1">
      <button
        onClick={onZoom}
        aria-label={`Voir ${card.name} en grand`}
        className="h-12 w-9 shrink-0 overflow-hidden rounded border border-white/10"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.image}
          alt={card.name}
          className="h-full w-full object-contain"
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-zinc-100">{card.name}</div>
        <div className="text-[10px] text-zinc-500">
          {"cost" in card ? `Coût ${card.cost}` : ""} · {card.id}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onRemove}
          aria-label={`Retirer une copie de ${card.name}`}
          disabled={count <= 0}
          className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>
        <span
          className="w-5 text-center text-xs tabular-nums text-zinc-100"
          aria-label={`${count} copie${count > 1 ? "s" : ""} dans le deck`}
        >
          {count}
        </span>
        <button
          onClick={onAdd}
          aria-label={`Ajouter une copie de ${card.name}`}
          className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-200 hover:bg-white/10"
        >
          +
        </button>
      </div>
    </div>
  );
}
