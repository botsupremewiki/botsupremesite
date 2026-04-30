"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  RuneterraCardData,
  RuneterraRegion,
  TcgCardOwned,
  TcgClientMessage,
  TcgDeck,
  TcgDeckEntry,
  TcgServerMessage,
} from "@shared/types";
import { RUNETERRA_REGIONS, TCG_GAMES } from "@shared/types";
import {
  RUNETERRA_BASE_SET,
  RUNETERRA_BASE_SET_BY_CODE,
} from "@shared/tcg-runeterra-base";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import {
  LorCardZoomModal,
  LOR_RARITY_COLOR,
  LOR_RARITY_TIER,
} from "./lor-card-visuals";

type ConnStatus = "connecting" | "connected" | "disconnected";
type View = "list" | "editor";

// Set 1 LoR contraintes deck (mirror règles Runeterra modernes).
const DECK_SIZE = 40;
const MAX_COPIES = 3;
const MAX_CHAMPIONS = 6;
const MAX_REGIONS = 2;
const DECK_NAME_MAX = 40;

const REGION_ORDER: RuneterraRegion[] = [
  "Demacia",
  "Freljord",
  "Ionia",
  "Noxus",
  "PiltoverZaun",
  "ShadowIsles",
];

const REGION_GLYPH: Record<RuneterraRegion, string> = {
  Demacia: "⚔️",
  Freljord: "❄️",
  Ionia: "🌸",
  Noxus: "🔥",
  PiltoverZaun: "⚙️",
  ShadowIsles: "💀",
};

export function LorDecksClient({ profile }: { profile: Profile | null }) {
  const game = TCG_GAMES.lol;
  const router = useRouter();
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [collection, setCollection] = useState<Map<string, number>>(new Map());
  const [decks, setDecks] = useState<TcgDeck[]>([]);
  const [view, setView] = useState<View>("list");

  // Draft (éditeur courant).
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>("");
  const [draftRegions, setDraftRegions] = useState<RuneterraRegion[]>([]);
  const [draftEntries, setDraftEntries] = useState<Map<string, number>>(
    new Map(),
  );
  const [zoomedCard, setZoomedCard] = useState<RuneterraCardData | null>(null);

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
    const url = `${scheme}://${partyHost}/parties/tcg/lol${
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

  const championCount = useMemo(() => {
    let n = 0;
    for (const [code, count] of draftEntries) {
      const meta = RUNETERRA_BASE_SET_BY_CODE.get(code);
      if (meta?.supertype === "Champion") n += count;
    }
    return n;
  }, [draftEntries]);

  // Cartes possédées qui peuvent aller dans le deck (au moins 1 région
  // partagée avec celles sélectionnées + collectible + non-tokens).
  const eligibleCards = useMemo(() => {
    if (draftRegions.length === 0) return [] as RuneterraCardData[];
    const allowed = new Set<string>(draftRegions);
    const out: RuneterraCardData[] = [];
    for (const card of RUNETERRA_BASE_SET) {
      if (!card.collectible) continue;
      const owned = collection.get(card.cardCode) ?? 0;
      if (owned <= 0) continue;
      const sharesRegion = card.regions.some((r) => allowed.has(r));
      if (!sharesRegion) continue;
      out.push(card);
    }
    out.sort((a, b) => {
      // Champions d'abord, puis par coût, puis par rareté, puis par nom.
      const aChamp = a.supertype === "Champion" ? 0 : 1;
      const bChamp = b.supertype === "Champion" ? 0 : 1;
      if (aChamp !== bChamp) return aChamp - bChamp;
      if (a.cost !== b.cost) return a.cost - b.cost;
      const ra = LOR_RARITY_TIER[a.rarity] ?? 0;
      const rb = LOR_RARITY_TIER[b.rarity] ?? 0;
      if (ra !== rb) return rb - ra;
      return a.name.localeCompare(b.name);
    });
    return out;
  }, [draftRegions, collection]);

  function startNewDeck() {
    setDraftId(null);
    setDraftName("");
    setDraftRegions([]);
    setDraftEntries(new Map());
    setErrorMsg(null);
    setView("editor");
  }

  function editDeck(d: TcgDeck) {
    setDraftId(d.id);
    setDraftName(d.name);
    // Garde uniquement les régions canoniques Set 1 (sécurité si data legacy).
    const regs = (d.regions ?? []).filter((r): r is RuneterraRegion =>
      REGION_ORDER.includes(r as RuneterraRegion),
    );
    setDraftRegions(regs);
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

  // Phase 3.86 : raccourci « jouer ce deck vs bot ». Génère un roomId
  // côté client pour entrer directement dans la salle de combat.
  function playDeckVsBot(d: TcgDeck) {
    const total = d.cards.reduce((s, c) => s + c.count, 0);
    if (total !== DECK_SIZE) {
      setErrorMsg(`Deck incomplet (${total}/${DECK_SIZE}).`);
      return;
    }
    const roomId = crypto.randomUUID();
    router.push(`/play/tcg/lol/battle/${roomId}?deck=${d.id}&bot=1`);
  }

  function toggleRegion(region: RuneterraRegion) {
    setDraftRegions((prev) => {
      const isSelected = prev.includes(region);
      if (isSelected) {
        const next = prev.filter((r) => r !== region);
        // Si on retire une région et qu'il reste des cartes du deck qui ne
        // partagent plus aucune région choisie, on les retire.
        if (next.length > 0 && draftEntries.size > 0) {
          if (
            !confirm(
              "Retirer cette région va supprimer du deck les cartes qui ne partagent plus de région. Continuer ?",
            )
          ) {
            return prev;
          }
          pruneInvalidEntries(next);
        }
        return next;
      }
      if (prev.length >= MAX_REGIONS) return prev;
      return [...prev, region];
    });
  }

  function pruneInvalidEntries(allowedRegions: RuneterraRegion[]) {
    const allowed = new Set<string>(allowedRegions);
    setDraftEntries((prev) => {
      const next = new Map<string, number>();
      for (const [code, count] of prev) {
        const meta = RUNETERRA_BASE_SET_BY_CODE.get(code);
        if (!meta) continue;
        if (meta.regions.some((r) => allowed.has(r))) next.set(code, count);
      }
      return next;
    });
  }

  function addCard(cardCode: string) {
    const owned = collection.get(cardCode) ?? 0;
    setDraftEntries((prev) => {
      const next = new Map(prev);
      const cur = next.get(cardCode) ?? 0;
      const meta = RUNETERRA_BASE_SET_BY_CODE.get(cardCode);
      if (!meta) return prev;
      if (cur >= MAX_COPIES) return prev;
      if (cur >= owned) return prev;
      const total = Array.from(next.values()).reduce((s, n) => s + n, 0);
      if (total >= DECK_SIZE) return prev;
      // Limite champion : check si ajouter cette carte ferait dépasser 6.
      if (meta.supertype === "Champion") {
        let champs = 0;
        for (const [c, n] of next) {
          const m = RUNETERRA_BASE_SET_BY_CODE.get(c);
          if (m?.supertype === "Champion") champs += n;
        }
        if (champs >= MAX_CHAMPIONS) return prev;
      }
      next.set(cardCode, cur + 1);
      return next;
    });
  }

  function removeCard(cardCode: string) {
    setDraftEntries((prev) => {
      const next = new Map(prev);
      const cur = next.get(cardCode) ?? 0;
      if (cur <= 1) next.delete(cardCode);
      else next.set(cardCode, cur - 1);
      return next;
    });
  }

  function saveDeck() {
    setErrorMsg(null);
    if (draftRegions.length < 1 || draftRegions.length > MAX_REGIONS) {
      setErrorMsg(`Sélectionne 1 ou ${MAX_REGIONS} régions.`);
      return;
    }
    if (totalCount !== DECK_SIZE) {
      setErrorMsg(
        `Le deck doit contenir exactement ${DECK_SIZE} cartes (actuellement ${totalCount}).`,
      );
      return;
    }
    if (championCount > MAX_CHAMPIONS) {
      setErrorMsg(`Maximum ${MAX_CHAMPIONS} champions par deck.`);
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
      energyTypes: [], // ignoré côté server pour LoR
      leaderId: null, // ignoré côté server pour LoR
      regions: draftRegions,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/tcg/lol"
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
            onPlayBot={playDeckVsBot}
          />
        ) : (
          <DeckEditor
            draftName={draftName}
            setDraftName={setDraftName}
            draftRegions={draftRegions}
            toggleRegion={toggleRegion}
            draftEntries={draftEntries}
            totalCount={totalCount}
            championCount={championCount}
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

        <LorCardZoomModal
          card={zoomedCard}
          onClose={() => setZoomedCard(null)}
        />
      </main>
    </div>
  );
}

function DecksList({
  decks,
  onNew,
  onEdit,
  onDelete,
  onPlayBot,
}: {
  decks: TcgDeck[];
  onNew: () => void;
  onEdit: (d: TcgDeck) => void;
  onDelete: (d: TcgDeck) => void;
  // Phase 3.86 : raccourci « jouer ce deck vs bot » directement depuis
  // la liste de decks (économise un clic vers la page launcher).
  onPlayBot: (d: TcgDeck) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">🛠️ Mes Decks</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Legends of Runeterra : {DECK_SIZE} cartes, max {MAX_COPIES} copies
            par carte, max {MAX_CHAMPIONS} champions, 1-{MAX_REGIONS} régions.
            Toutes les cartes doivent partager au moins une région avec celles
            choisies.
          </p>
        </div>
        <button
          onClick={onNew}
          className="rounded-md bg-sky-500 px-4 py-2 text-sm font-bold text-sky-950 shadow hover:bg-sky-400"
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
            const total = d.cards.reduce((s, c) => s + c.count, 0);
            const regs = (d.regions ?? []).filter((r): r is RuneterraRegion =>
              REGION_ORDER.includes(r as RuneterraRegion),
            );
            // Phase 3.88 : extrait les champions du deck pour les afficher.
            // Permet d'identifier rapidement un deck (« Yasuo Sett vs Garen »).
            const champs = d.cards
              .map((c) => RUNETERRA_BASE_SET_BY_CODE.get(c.cardId))
              .filter((c) => c && c.supertype === "Champion")
              .map((c) => c!.name);
            return (
              <div
                key={d.id}
                className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/40 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex shrink-0 gap-1">
                    {regs.length > 0 ? (
                      regs.map((r) => (
                        <span
                          key={r}
                          className={`flex h-12 w-12 items-center justify-center rounded border text-xl ${RUNETERRA_REGIONS[r].border} ${RUNETERRA_REGIONS[r].accent}`}
                          title={RUNETERRA_REGIONS[r].name}
                        >
                          {REGION_GLYPH[r]}
                        </span>
                      ))
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded border border-white/10 bg-zinc-900 text-xl">
                        ?
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-zinc-100">
                      {d.name}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {regs.length > 0 ? (
                        <>
                          Régions :{" "}
                          {regs.map((r) => RUNETERRA_REGIONS[r].name).join(" + ")}
                        </>
                      ) : (
                        <span className="text-rose-300">Régions manquantes</span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {total} / {DECK_SIZE} cartes
                    </div>
                    {/* Phase 3.88 : noms des champions du deck. */}
                    {champs.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {champs.map((name, i) => (
                          <span
                            key={i}
                            className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200"
                          >
                            ★ {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onPlayBot(d)}
                    disabled={total !== DECK_SIZE}
                    title={
                      total !== DECK_SIZE
                        ? `Deck incomplet (${total}/${DECK_SIZE})`
                        : "Jouer ce deck contre le bot"
                    }
                    className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    🤖 Jouer
                  </button>
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
  draftRegions,
  toggleRegion,
  draftEntries,
  totalCount,
  championCount,
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
  draftRegions: RuneterraRegion[];
  toggleRegion: (r: RuneterraRegion) => void;
  draftEntries: Map<string, number>;
  totalCount: number;
  championCount: number;
  eligibleCards: RuneterraCardData[];
  collection: Map<string, number>;
  addCard: (id: string) => void;
  removeCard: (id: string) => void;
  saveDeck: () => void;
  cancel: () => void;
  errorMsg: string | null;
  onZoomCard: (c: RuneterraCardData) => void;
}) {
  const [search, setSearch] = useState("");
  // Phase 3.83 : filtres additionnels (type + cost).
  const [typeFilter, setTypeFilter] = useState<
    "all" | "unit" | "spell" | "champion"
  >("all");
  const [costFilter, setCostFilter] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eligibleCards.filter((c) => {
      // Type filter
      if (typeFilter === "unit" && c.type !== "Unit") return false;
      if (typeFilter === "spell" && c.type !== "Spell") return false;
      if (typeFilter === "champion" && c.supertype !== "Champion") return false;
      // Cost filter (≥7 = 7+)
      if (costFilter !== null) {
        if (costFilter === 7 ? c.cost < 7 : c.cost !== costFilter) return false;
      }
      // Search
      if (q) {
        const hay =
          (c.name + " " + c.cardCode + " " + (c.subtypes ?? []).join(" "))
            .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [eligibleCards, search, typeFilter, costFilter]);

  // Phase 3.83 : cost curve histogram. Compte les cartes par cost (1-7+).
  const costCurve = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const [code, count] of draftEntries) {
      const card = RUNETERRA_BASE_SET_BY_CODE.get(code);
      if (!card) continue;
      const bucket = card.cost >= 7 ? 7 : card.cost;
      counts[bucket] = (counts[bucket] ?? 0) + count;
    }
    return counts;
  }, [draftEntries]);

  const cardsInDeck = useMemo(() => {
    const arr: { card: RuneterraCardData; count: number }[] = [];
    for (const [code, count] of draftEntries) {
      const meta = RUNETERRA_BASE_SET_BY_CODE.get(code);
      if (meta) arr.push({ card: meta, count });
    }
    arr.sort((a, b) => {
      const aChamp = a.card.supertype === "Champion" ? 0 : 1;
      const bChamp = b.card.supertype === "Champion" ? 0 : 1;
      if (aChamp !== bChamp) return aChamp - bChamp;
      if (a.card.cost !== b.card.cost) return a.card.cost - b.card.cost;
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
          className="flex-1 min-w-[200px] rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-400/50 focus:outline-none"
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
        <div className="text-sm tabular-nums text-zinc-300">
          <span
            className={
              championCount > MAX_CHAMPIONS ? "text-rose-300" : "text-amber-300"
            }
          >
            ★ {championCount}
          </span>
          {" / "}
          {MAX_CHAMPIONS} champions
        </div>
        <button
          onClick={cancel}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
        >
          Annuler
        </button>
        <button
          onClick={saveDeck}
          disabled={
            draftRegions.length === 0 ||
            totalCount !== DECK_SIZE ||
            championCount > MAX_CHAMPIONS
          }
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

      {/* Région picker (toujours visible en haut). */}
      <RegionPicker selected={draftRegions} onToggle={toggleRegion} />

      {draftRegions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-zinc-500">
          Sélectionne 1 ou 2 régions ci-dessus pour voir les cartes éligibles.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
          {/* Colonne gauche : cartes du deck */}
          <div className="flex w-[320px] shrink-0 flex-col gap-2 overflow-hidden">
            {/* Phase 3.83 : cost curve histogram */}
            <CostCurve costCurve={costCurve} totalCount={totalCount} />
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
                    key={card.cardCode}
                    card={card}
                    count={count}
                    onAdd={() => addCard(card.cardCode)}
                    onRemove={() => removeCard(card.cardCode)}
                    onZoom={() => onZoomCard(card)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Colonne droite : picker */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Rechercher dans tes cartes éligibles…"
              className="shrink-0 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-sky-400/50 focus:outline-none"
            />
            {/* Phase 3.83 : filter bar (type + cost). */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-md border border-white/5 bg-black/20 px-2 py-1.5">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                Type
              </span>
              {(["all", "unit", "spell", "champion"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    typeFilter === t
                      ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40"
                      : "text-zinc-400 hover:bg-white/5"
                  }`}
                >
                  {t === "all"
                    ? "Tous"
                    : t === "unit"
                      ? "Unités"
                      : t === "spell"
                        ? "Sorts"
                        : "★ Champions"}
                </button>
              ))}
              <div className="mx-1 h-3 w-px bg-white/10" />
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                Coût
              </span>
              <button
                onClick={() => setCostFilter(null)}
                className={`rounded px-2 py-0.5 text-[10px] ${
                  costFilter === null
                    ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40"
                    : "text-zinc-400 hover:bg-white/5"
                }`}
              >
                Tous
              </button>
              {[1, 2, 3, 4, 5, 6, 7].map((c) => (
                <button
                  key={c}
                  onClick={() => setCostFilter(c)}
                  className={`rounded px-2 py-0.5 text-[10px] tabular-nums ${
                    costFilter === c
                      ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40"
                      : "text-zinc-400 hover:bg-white/5"
                  }`}
                >
                  {c === 7 ? "7+" : c}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-2">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  {eligibleCards.length === 0
                    ? "Aucune carte éligible — ouvre des boosters de ces régions pour obtenir des cartes."
                    : "Aucune carte ne matche ta recherche."}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {filtered.map((card) => {
                    const owned = collection.get(card.cardCode) ?? 0;
                    const inDeck = draftEntries.get(card.cardCode) ?? 0;
                    return (
                      <PickerCard
                        key={card.cardCode}
                        card={card}
                        owned={owned}
                        inDeck={inDeck}
                        onAdd={() => addCard(card.cardCode)}
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

function RegionPicker({
  selected,
  onToggle,
}: {
  selected: RuneterraRegion[];
  onToggle: (r: RuneterraRegion) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/30 p-2">
      <span className="text-[11px] uppercase tracking-widest text-zinc-500">
        Régions ({selected.length}/{MAX_REGIONS}) :
      </span>
      {REGION_ORDER.map((r) => {
        const cfg = RUNETERRA_REGIONS[r];
        const active = selected.includes(r);
        const disabled = !active && selected.length >= MAX_REGIONS;
        return (
          <button
            key={r}
            onClick={() => onToggle(r)}
            disabled={disabled}
            title={cfg.name}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
              active
                ? `${cfg.border} ${cfg.accent} bg-white/5`
                : "border-white/10 text-zinc-400 hover:bg-white/[0.07]"
            }`}
          >
            <span className="text-base">{REGION_GLYPH[r]}</span>
            <span>{cfg.name}</span>
          </button>
        );
      })}
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
  card: RuneterraCardData;
  owned: number;
  inDeck: number;
  onAdd: () => void;
  onZoom: () => void;
}) {
  const remaining = Math.min(owned, MAX_COPIES) - inDeck;
  return (
    <div
      className={`relative flex flex-col gap-1 rounded-md border bg-black/40 p-1 transition-opacity ${LOR_RARITY_COLOR[card.rarity]} ${
        remaining <= 0 ? "opacity-50" : ""
      }`}
    >
      <button
        onClick={onZoom}
        className="aspect-[2/3] overflow-hidden rounded"
        title={card.name}
      >
        {card.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image}
            alt={card.name}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        )}
      </button>
      <button
        onClick={onAdd}
        disabled={remaining <= 0}
        className="rounded bg-emerald-500/80 px-1 py-0.5 text-[10px] font-bold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
      >
        + Ajouter ({inDeck}/{Math.min(owned, MAX_COPIES)})
      </button>
    </div>
  );
}

function DeckCardRow({
  card,
  count,
  onAdd,
  onRemove,
  onZoom,
}: {
  card: RuneterraCardData;
  count: number;
  onAdd: () => void;
  onRemove: () => void;
  onZoom: () => void;
}) {
  const isChampion = card.supertype === "Champion";
  return (
    <div className="flex items-center gap-1.5 rounded border border-white/5 bg-black/30 p-1">
      <button
        onClick={onZoom}
        className="h-12 w-9 shrink-0 overflow-hidden rounded border border-white/10"
      >
        {card.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image}
            alt={card.name}
            className="h-full w-full object-contain"
          />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate text-xs text-zinc-100">
          {isChampion && <span className="text-amber-300">★</span>}
          <span className="truncate">{card.name}</span>
        </div>
        <div className="text-[10px] text-zinc-500">
          Coût {card.cost} · {card.cardCode}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onRemove}
          className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-200 hover:bg-white/10"
        >
          −
        </button>
        <span className="w-5 text-center text-xs tabular-nums text-zinc-100">
          {count}
        </span>
        <button
          onClick={onAdd}
          className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-200 hover:bg-white/10"
        >
          +
        </button>
      </div>
    </div>
  );
}

// Phase 3.83 : histogramme de la courbe de mana du deck en cours.
function CostCurve({
  costCurve,
  totalCount,
}: {
  costCurve: Record<number, number>;
  totalCount: number;
}) {
  const max = Math.max(1, ...Object.values(costCurve));
  const buckets = [1, 2, 3, 4, 5, 6, 7] as const;
  return (
    <div className="shrink-0 rounded-lg border border-white/10 bg-black/30 p-2">
      <div className="mb-1 text-[11px] uppercase tracking-widest text-zinc-500">
        Courbe de mana
      </div>
      <div className="flex h-12 items-end gap-1">
        {buckets.map((c) => {
          const count = costCurve[c] ?? 0;
          const heightPct = totalCount === 0 ? 0 : (count / max) * 100;
          return (
            <div key={c} className="flex flex-1 flex-col items-center gap-0.5">
              <div className="text-[9px] tabular-nums text-zinc-300">
                {count > 0 ? count : ""}
              </div>
              <div
                className="w-full rounded-sm bg-gradient-to-t from-amber-500/40 to-amber-300/70"
                style={{ height: `${heightPct}%`, minHeight: count > 0 ? 2 : 0 }}
              />
              <div className="text-[9px] text-zinc-500">{c === 7 ? "7+" : c}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
