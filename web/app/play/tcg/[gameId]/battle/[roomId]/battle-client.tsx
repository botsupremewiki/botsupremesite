"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  BattleCard,
  BattleClientMessage,
  BattlePlayerPublicState,
  BattleSeatId,
  BattleSelfState,
  BattleServerMessage,
  BattleState,
  ChatMessage,
  PokemonCardData,
  PokemonEnergyType,
  TcgGameId,
} from "@shared/types";
import { BATTLE_CONFIG, TCG_GAMES } from "@shared/types";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { useRegisterProximityChat } from "@/app/play/proximity-chat-context";
import { CardFace, CardZoomModal } from "../../_components/card-visuals";

type ConnStatus = "connecting" | "connected" | "disconnected";

const TYPE_BG: Record<PokemonEnergyType, string> = {
  fire: "from-orange-500/30 to-red-700/40",
  water: "from-blue-400/30 to-blue-700/40",
  grass: "from-emerald-400/30 to-emerald-700/40",
  lightning: "from-yellow-400/30 to-yellow-600/40",
  psychic: "from-fuchsia-400/30 to-purple-700/40",
  fighting: "from-amber-700/30 to-stone-700/40",
  darkness: "from-zinc-700/40 to-slate-900/60",
  metal: "from-slate-300/20 to-slate-500/30",
  dragon: "from-amber-400/30 to-violet-700/40",
  fairy: "from-pink-300/30 to-rose-500/40",
  colorless: "from-zinc-300/20 to-zinc-500/30",
};

export function BattleClient({
  profile,
  gameId,
  roomId,
  deckId,
}: {
  profile: Profile | null;
  gameId: TcgGameId;
  roomId: string;
  deckId: string;
}) {
  const game = TCG_GAMES[gameId];
  const cardById = POKEMON_BASE_SET_BY_ID;
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [state, setState] = useState<BattleState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [questToast, setQuestToast] = useState<{
    botWins: number;
    granted: boolean;
  } | null>(null);
  // Chat propre à la table de combat — éphémère (la room PartyKit
  // hiberne quand vide). Exposé en "proximity" via le sidebar global.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!profile) {
      setStatus("disconnected");
      return;
    }
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
    params.set("authId", profile.id);
    params.set("name", profile.username);
    params.set("deck", deckId);
    const url = `${scheme}://${partyHost}/parties/battle/${roomId}?${params.toString()}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: BattleServerMessage;
      try {
        msg = JSON.parse(e.data as string) as BattleServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "battle-welcome":
          setErrorMsg(null);
          break;
        case "battle-state":
          setState(msg.state);
          setErrorMsg(null);
          break;
        case "battle-error":
          setErrorMsg(msg.message);
          break;
        case "battle-quest-reward":
          setQuestToast({ botWins: msg.botWins, granted: msg.granted });
          break;
        case "chat":
          setChatMessages((prev) => [...prev.slice(-49), msg.message]);
          break;
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [profile, gameId, roomId, deckId]);

  const send = useCallback((msg: BattleClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const setActive = (handIndex: number) =>
    send({ type: "battle-set-active", handIndex });
  const addToBench = (handIndex: number) =>
    send({ type: "battle-add-bench", handIndex });
  const removeFromBench = (benchIndex: number) =>
    send({ type: "battle-remove-bench", benchIndex });
  const confirmSetup = () => send({ type: "battle-confirm-setup" });
  const playBasic = (handIndex: number) =>
    send({ type: "battle-play-basic", handIndex });
  const attachEnergy = (targetUid: string) =>
    send({ type: "battle-attach-energy", targetUid });
  const evolve = (handIndex: number, targetUid: string) =>
    send({ type: "battle-evolve", handIndex, targetUid });
  const retreat = (benchIndex: number) =>
    send({ type: "battle-retreat", benchIndex });
  const attack = (attackIndex: number) =>
    send({ type: "battle-attack", attackIndex });
  const promoteActive = (benchIndex: number) =>
    send({ type: "battle-promote-active", benchIndex });
  const endTurn = () => send({ type: "battle-end-turn" });
  const sendChat = useCallback(
    (text: string) => send({ type: "chat", text }),
    [send],
  );

  // Pousse le chat de la table dans le sidebar global (onglet "Combat").
  useRegisterProximityChat({
    label: "Combat",
    messages: chatMessages,
    onSend: sendChat,
    enabled: status === "connected",
  });

  const concede = () => {
    if (!confirm("Abandonner la partie ?")) return;
    send({ type: "battle-concede" });
  };

  const isMyTurn = !!state && state.activeSeat === state.selfSeat;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={lobbyHref(gameId, roomId)}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Lobby
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>
            {game.name} · battle
          </span>
          {state && (
            <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-300">
              {phaseLabel(state.phase)}
              {state.phase === "playing" &&
                ` · tour ${state.turnNumber} · ${
                  isMyTurn ? "à toi" : `à ${state.opponent?.username ?? "adversaire"}`
                }`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <StatusIndicator status={status} />
          {state && state.phase !== "ended" && (
            <button
              onClick={concede}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-rose-500/20 hover:text-rose-200"
            >
              Abandonner
            </button>
          )}
          {profile ? <UserPill profile={profile} variant="play" /> : null}
        </div>
      </header>

      {!profile && (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
          Connecte-toi avec Discord pour rejoindre la partie.
        </div>
      )}

      {profile && state && (
        <main className="flex flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.05),transparent_70%)]">
          {state.phase === "waiting" && (
            <div className="flex flex-1 items-center justify-center text-center text-sm text-zinc-300">
              <div>
                ⏳ En attente du second joueur…
                <div className="mt-2 text-xs text-zinc-500">
                  Partage l&apos;URL avec un ami pour qu&apos;il rejoigne, ou
                  attends qu&apos;un autre joueur entre via le lobby.
                </div>
              </div>
            </div>
          )}

          {(state.phase === "setup" ||
            state.phase === "playing" ||
            state.phase === "ended") && (
            <BattleBoard
              state={state}
              cardById={cardById}
              isMyTurn={isMyTurn}
              gameId={gameId}
              roomId={roomId}
              onSetActive={setActive}
              onAddBench={addToBench}
              onRemoveBench={removeFromBench}
              onConfirmSetup={confirmSetup}
              onEndTurn={endTurn}
              onPlayBasic={playBasic}
              onAttachEnergy={attachEnergy}
              onEvolve={evolve}
              onRetreat={retreat}
              onAttack={attack}
              onPromoteActive={promoteActive}
            />
          )}

          {errorMsg && (
            <div className="border-t border-rose-500/40 bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          {questToast && (
            <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100 shadow-2xl backdrop-blur-md">
              {questToast.granted ? (
                <>
                  🎁 <strong>Quête complétée !</strong> +1 booster gratuit
                  ajouté à ta collection.
                </>
              ) : (
                <>
                  🎯 Victoire enregistrée — {questToast.botWins} / 3 wins
                  aujourd&apos;hui.
                </>
              )}
              <button
                onClick={() => setQuestToast(null)}
                className="ml-3 text-emerald-300 hover:text-emerald-100"
              >
                ✕
              </button>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function lobbyHref(gameId: string, roomId: string): string {
  if (roomId.startsWith("bot-")) return `/play/tcg/${gameId}/battle/bot`;
  if (roomId.startsWith("ranked-")) return `/play/tcg/${gameId}/battle/ranked`;
  return `/play/tcg/${gameId}/battle/pvp`;
}

function phaseLabel(p: BattleState["phase"]): string {
  switch (p) {
    case "waiting":
      return "en attente";
    case "setup":
      return "préparation";
    case "playing":
      return "en cours";
    case "ended":
      return "terminée";
  }
}

// ─── Board ────────────────────────────────────────────────────────────────

function BattleBoard({
  state,
  cardById,
  isMyTurn,
  gameId,
  roomId,
  onSetActive,
  onAddBench,
  onRemoveBench,
  onConfirmSetup,
  onEndTurn,
  onPlayBasic,
  onAttachEnergy,
  onEvolve,
  onRetreat,
  onAttack,
  onPromoteActive,
}: {
  state: BattleState;
  cardById: Map<string, PokemonCardData>;
  isMyTurn: boolean;
  gameId: string;
  roomId: string;
  onSetActive: (handIndex: number) => void;
  onAddBench: (handIndex: number) => void;
  onRemoveBench: (benchIndex: number) => void;
  onConfirmSetup: () => void;
  onEndTurn: () => void;
  onPlayBasic: (handIndex: number) => void;
  onAttachEnergy: (targetUid: string) => void;
  onEvolve: (handIndex: number, targetUid: string) => void;
  onRetreat: (benchIndex: number) => void;
  onAttack: (attackIndex: number) => void;
  onPromoteActive: (benchIndex: number) => void;
}) {
  // Mode "attach energy" : Pocket génère 1 énergie automatique par tour. Si
  // pendingEnergy est définie côté serveur et qu'aucune attache n'a encore eu
  // lieu ce tour, le joueur peut activer ce mode pour cliquer sur un Pokémon
  // (Actif ou Banc) afin d'y attacher l'énergie.
  const [attachEnergyMode, setAttachEnergyMode] = useState(false);
  const [pendingEvolveIdx, setPendingEvolveIdx] = useState<number | null>(null);
  const [zoomedCard, setZoomedCard] = useState<PokemonCardData | null>(null);
  const cancelPending = () => {
    setAttachEnergyMode(false);
    setPendingEvolveIdx(null);
  };
  const promptPromote = state.self?.mustPromoteActive;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar récap : log de match (text only — preview se fait via zoom modal) */}
      <RecapSidebar log={state.log} />

      {/* Centre : opponent / self zones bien centrés et plus grands */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Opponent zone */}
        {state.opponent && (
          <div className="flex-shrink-0 border-b border-white/10 bg-black/30 p-3">
            <PlayerInfo player={state.opponent} isOpponent />
            <div className="mt-2 flex items-center justify-center gap-4">
              <BackRow side="opp" koCount={state.opponent.koCount} deckSize={state.opponent.deckSize} discardCount={state.opponent.discardCount} />
              <BoardArea
                active={state.opponent.active}
                bench={state.opponent.bench}
                cardById={cardById}
                isOpponent
                onZoomCard={setZoomedCard}
              />
              <HandHidden count={state.opponent.handCount} />
            </div>
          </div>
        )}

        {promptPromote && (
          <div className="border-y border-amber-400/40 bg-amber-400/10 p-2 text-center text-sm text-amber-200">
            Ton Pokémon Actif a été mis K.O. Choisis un Pokémon de ton Banc.
          </div>
        )}

        {/* Spacer pour pousser le self vers le bas et centrer visuellement */}
        <div className="flex-1" />

        {/* Self zone */}
        {state.self && (
          <div className="flex-shrink-0 border-t border-white/10 bg-black/30 p-3">
            <div className="flex items-center justify-center gap-4">
              <BackRow side="self" koCount={state.self.koCount} deckSize={state.self.deckSize} discardCount={state.self.discardCount} />
              <BoardArea
                active={state.self.active}
                bench={state.self.bench}
                cardById={cardById}
                isOpponent={false}
                onZoomCard={setZoomedCard}
                attachMode={
                  attachEnergyMode
                    ? (uid) => {
                        onAttachEnergy(uid);
                        setAttachEnergyMode(false);
                      }
                    : pendingEvolveIdx !== null
                      ? (uid) => {
                          onEvolve(pendingEvolveIdx, uid);
                          setPendingEvolveIdx(null);
                        }
                      : null
                }
                promoteMode={promptPromote ?? false}
                onPromote={onPromoteActive}
                onRetreat={
                  state.phase === "playing" &&
                  isMyTurn &&
                  !state.self.hasRetreatedThisTurn &&
                  !state.self.mustPromoteActive
                    ? onRetreat
                    : null
                }
              />
              <SelfControls
                state={state}
                isMyTurn={isMyTurn}
                cardById={cardById}
                onConfirmSetup={onConfirmSetup}
                onEndTurn={onEndTurn}
                onAttack={onAttack}
              />
            </div>
            <PlayerInfo player={state.self} isOpponent={false} />

            {/* Énergie auto Pocket : "ball" draggable + bouton "Attacher". */}
            {state.self.pendingEnergy &&
              !state.self.energyAttachedThisTurn &&
              isMyTurn &&
              !attachEnergyMode &&
              pendingEvolveIdx === null && (
                <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-200">
                  <span
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/x-tcg-energy", "1");
                      e.dataTransfer.effectAllowed = "link";
                      // Important : active le mode pendant le drag pour que les
                      // dropzones s'arment (sinon makeDropProps retourne {}).
                      setAttachEnergyMode(true);
                    }}
                    onDragEnd={() => {
                      // Si on a drop avec succès, attachEnergyMode est passé à
                      // false par le handler. Sinon on le repasse à false ici.
                      setAttachEnergyMode(false);
                    }}
                    className="cursor-grab select-none rounded-full bg-amber-300 px-2 py-0.5 text-base text-amber-950 shadow active:cursor-grabbing"
                    title="Glisse cette énergie sur un Pokémon"
                  >
                    ⚡ {state.self.pendingEnergy}
                  </span>
                  <span className="text-zinc-300">
                    Glisse-la sur un Pokémon, ou clique « Attacher ».
                  </span>
                  <button
                    onClick={() => setAttachEnergyMode(true)}
                    className="ml-auto rounded border border-amber-400/40 bg-amber-400/20 px-2 py-0.5 text-amber-100 hover:bg-amber-400/30"
                  >
                    Attacher
                  </button>
                </div>
              )}

            {(attachEnergyMode || pendingEvolveIdx !== null) && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-200">
                {attachEnergyMode
                  ? "Choisis un Pokémon à qui attacher l'Énergie."
                  : "Choisis le Pokémon à faire évoluer."}
                <button
                  onClick={cancelPending}
                  className="ml-auto rounded border border-white/10 bg-white/5 px-2 py-0.5 text-zinc-200 hover:bg-white/10"
                >
                  Annuler
                </button>
              </div>
            )}

            {/* Hand */}
            <SelfHand
              state={state}
              cardById={cardById}
              isMyTurn={isMyTurn}
              onSetActive={onSetActive}
              onAddBench={onAddBench}
              onRemoveBench={onRemoveBench}
              onPlayBasic={onPlayBasic}
              onZoomCard={setZoomedCard}
              onSelectEvolve={(i) => {
                setAttachEnergyMode(false);
                setPendingEvolveIdx(i);
              }}
            />
          </div>
        )}

        {/* Modal zoom carte (combat board ou main) */}
        <CardZoomModal card={zoomedCard} onClose={() => setZoomedCard(null)} />

        {state.winner && (
          <div className="flex-shrink-0 bg-black/80 p-4 text-center">
            <div className="text-2xl font-bold text-amber-300">
              🏆 {state.winner === state.selfSeat ? "Victoire !" : "Défaite"}
            </div>
            <Link
              href={lobbyHref(gameId, roomId)}
              className="mt-2 inline-block rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
            >
              Retour au lobby
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/** Sidebar gauche du board : log de match (preview cartes via zoom modal). */
function RecapSidebar({ log }: { log: string[] }) {
  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-black/40">
      <div className="border-b border-white/5 px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500">
        Récapitulatif du match
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="flex flex-col-reverse gap-1 text-xs text-zinc-300">
          <AnimatePresence initial={false}>
            {[...log].reverse().map((line, i) => (
              <motion.div
                key={`${i}-${line.slice(0, 20)}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                · {line}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </aside>
  );
}

function PlayerInfo({
  player,
  isOpponent,
}: {
  player: BattlePlayerPublicState | BattleSelfState;
  isOpponent: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-semibold text-zinc-200">
        {isOpponent ? "🔴 " : "🟢 "}
        {player.username}
      </span>
      <span className="text-zinc-400">
        Main {player.handCount} · Deck {player.deckSize} · KO{" "}
        <span className="font-bold text-amber-300">
          {player.koCount}/{BATTLE_CONFIG.koWinTarget}
        </span>
      </span>
    </div>
  );
}

function BackRow({
  side,
  koCount,
  deckSize,
  discardCount,
}: {
  side: "self" | "opp";
  koCount: number;
  deckSize: number;
  discardCount: number;
}) {
  void side;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-col items-center">
        <div className="text-[9px] uppercase tracking-widest text-zinc-500">
          KO {koCount}/{BATTLE_CONFIG.koWinTarget}
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: BATTLE_CONFIG.koWinTarget }, (_, i) => (
            <div
              key={i}
              className={`h-5 w-5 rounded-sm border ${
                i < koCount
                  ? "border-amber-300/60 bg-amber-700/40"
                  : "border-white/5 bg-white/[0.02]"
              }`}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-1.5 text-[9px] text-zinc-400">
        <span>📚 {deckSize}</span>
        <span>🗑 {discardCount}</span>
      </div>
    </div>
  );
}

function HandHidden({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">Main</div>
      <div className="flex">
        {Array.from({ length: Math.min(count, 7) }, (_, i) => (
          <div
            key={i}
            className="-ml-3 h-10 w-7 rounded border border-indigo-300/40 bg-gradient-to-br from-indigo-600 to-indigo-900 first:ml-0"
          />
        ))}
        {count > 7 && (
          <span className="ml-1 text-[10px] text-zinc-400">+{count - 7}</span>
        )}
      </div>
    </div>
  );
}

function BoardArea({
  active,
  bench,
  cardById,
  isOpponent,
  attachMode,
  promoteMode,
  onPromote,
  onRetreat,
  onZoomCard,
}: {
  active: BattleCard | null;
  bench: BattleCard[];
  cardById: Map<string, PokemonCardData>;
  isOpponent: boolean;
  attachMode?: ((targetUid: string) => void) | null;
  promoteMode?: boolean;
  onPromote?: (benchIndex: number) => void;
  onRetreat?: ((benchIndex: number) => void) | null;
  onZoomCard?: (card: PokemonCardData) => void;
}) {
  const ownActions = !isOpponent;

  // Build le handler de click sur une carte du board (Actif ou Banc).
  // Priorité : attachMode > promoteMode > retreat > zoom.
  function makeCardHandler(
    battleCard: BattleCard,
    cardData: PokemonCardData,
    benchIndex: number | null,
  ) {
    return () => {
      if (ownActions && attachMode) {
        attachMode(battleCard.uid);
        return;
      }
      if (ownActions && promoteMode && onPromote && benchIndex !== null) {
        onPromote(benchIndex);
        return;
      }
      if (ownActions && onRetreat && benchIndex !== null) {
        onRetreat(benchIndex);
        return;
      }
      // Default : zoom modal pour voir la carte en grand.
      onZoomCard?.(cardData);
    };
  }

  // Drag & drop énergie : tout BattleCard est une dropzone, le drop appelle
  // attachMode (qui se charge du check côté Pocket).
  function makeDropProps(battleCard: BattleCard) {
    if (!ownActions || !attachMode) return {};
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "link";
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.getData("text/x-tcg-energy") === "1") {
          attachMode(battleCard.uid);
        }
      },
    };
  }

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-xl border-2 px-6 py-4 ${
        isOpponent
          ? "border-rose-400/30 bg-rose-950/20"
          : "border-emerald-400/30 bg-emerald-950/20"
      }`}
    >
      {/* Active */}
      {active
        ? (() => {
            const data = cardById.get(active.cardId);
            if (!data || data.kind !== "pokemon") return null;
            const handler = makeCardHandler(active, data, null);
            return (
              <button
                onClick={handler}
                {...makeDropProps(active)}
                className={`rounded-lg transition-all ${
                  ownActions && attachMode
                    ? "ring-2 ring-amber-300 hover:ring-amber-200"
                    : "hover:ring-2 hover:ring-white/30"
                }`}
                title={data.name}
              >
                <BoardCard card={active} cardById={cardById} large />
              </button>
            );
          })()
        : (
          <div className="flex h-44 w-32 items-center justify-center rounded border border-dashed border-white/10 text-xs text-zinc-500">
            Actif
          </div>
        )}
      {/* Bench (Pocket : max 3 slots) */}
      <div className="flex gap-2">
        {Array.from({ length: BATTLE_CONFIG.maxBench }, (_, i) => {
          const card = bench[i];
          if (!card) {
            return (
              <div
                key={i}
                className="flex h-28 w-20 items-center justify-center rounded border border-dashed border-white/10 text-[10px] text-zinc-500"
              >
                Banc
              </div>
            );
          }
          const data = cardById.get(card.cardId);
          if (!data || data.kind !== "pokemon") return null;
          const handler = makeCardHandler(card, data, i);
          return (
            <button
              key={i}
              onClick={handler}
              {...makeDropProps(card)}
              className={`rounded-lg transition-all ${
                ownActions && (attachMode || promoteMode)
                  ? "ring-2 ring-amber-300 hover:ring-amber-200"
                  : ownActions && onRetreat
                    ? "hover:ring-2 hover:ring-sky-300"
                    : "hover:ring-2 hover:ring-white/30"
              }`}
              title={
                promoteMode
                  ? "Promouvoir comme Actif"
                  : onRetreat && ownActions
                    ? "Battre en retraite vers ce Pokémon"
                    : data.name
              }
            >
              <BoardCard card={card} cardById={cardById} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({
  card,
  cardById,
  large,
}: {
  card: BattleCard;
  cardById: Map<string, PokemonCardData>;
  large?: boolean;
}) {
  const data = cardById.get(card.cardId);
  if (!data || data.kind !== "pokemon") return null;
  // Format Pocket : carte officielle FR (image tcgdex) en ratio 5:7 +
  // overlays HP courant, énergies attachées, statuses.
  const w = large ? 110 : 72;
  const h = large ? 154 : 100;
  const remainingHp = Math.max(0, data.hp - card.damage);
  const damaged = card.damage > 0;
  return (
    <div
      className="relative overflow-hidden rounded-md border border-white/10 bg-black/40"
      style={{ width: w, height: h }}
      title={data.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.image}
        alt={data.name}
        className="h-full w-full object-contain"
        loading="lazy"
      />

      {/* Overlay HP courant en bas (toujours visible) */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 to-transparent px-1 py-0.5 text-[10px] tabular-nums">
        <span className={damaged ? "font-bold text-rose-300" : "text-zinc-200"}>
          {remainingHp}/{data.hp}
        </span>
        {card.attachedEnergies.length > 0 && (
          <span className="text-amber-200">⚡{card.attachedEnergies.length}</span>
        )}
      </div>

      {/* Statuses en haut à droite */}
      {card.statuses.length > 0 && (
        <div className="absolute right-0 top-0 rounded-bl bg-black/70 px-1 py-0.5 text-[10px]">
          {card.statuses.map((s) => statusEmoji(s)).join("")}
        </div>
      )}
    </div>
  );
}

function statusEmoji(s: string): string {
  switch (s) {
    case "asleep":
      return "💤";
    case "burned":
      return "🔥";
    case "confused":
      return "❓";
    case "paralyzed":
      return "⚡";
    case "poisoned":
      return "☠️";
    default:
      return "";
  }
}

function SelfControls({
  state,
  isMyTurn,
  cardById,
  onConfirmSetup,
  onEndTurn,
  onAttack,
}: {
  state: BattleState;
  isMyTurn: boolean;
  cardById: Map<string, PokemonCardData>;
  onConfirmSetup: () => void;
  onEndTurn: () => void;
  onAttack: (attackIndex: number) => void;
}) {
  if (state.phase === "setup") {
    const ready = state.self?.hasSetup;
    const canConfirm = !!state.self?.active;
    return (
      <div className="flex flex-col items-center gap-1">
        {ready ? (
          <span className="rounded-md bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">
            ✓ Prêt — en attente de l&apos;adversaire
          </span>
        ) : (
          <button
            onClick={onConfirmSetup}
            disabled={!canConfirm}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirmer mon équipe
          </button>
        )}
      </div>
    );
  }
  if (state.phase !== "playing") return null;
  const active = state.self?.active;
  const data = active ? cardById.get(active.cardId) : null;
  const attacks =
    data?.kind === "pokemon" ? data.attacks : [];
  const blocked =
    !isMyTurn ||
    !!state.self?.mustPromoteActive ||
    (active?.playedThisTurn ?? false);

  return (
    <div className="flex max-w-xs flex-col items-stretch gap-1.5">
      {attacks.map((a, i) => {
        const canPay = active
          ? canPayCost(active.attachedEnergies, a.cost, cardById)
          : false;
        const disabled = blocked || !canPay;
        return (
          <button
            key={i}
            disabled={disabled}
            onClick={() => onAttack(i)}
            className="flex flex-col items-stretch rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-left text-xs text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            title={a.text ?? ""}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                {a.cost.map((c, j) => (
                  <span key={j} className="text-[10px]">
                    {energyEmoji(c)}
                  </span>
                ))}
                <span className="ml-1 font-semibold">{a.name}</span>
              </span>
              {a.damage !== undefined && (
                <span className="font-bold tabular-nums">
                  {a.damage}
                  {a.damageSuffix ?? ""}
                </span>
              )}
            </div>
            {a.text && (
              <span className="mt-0.5 text-[9px] leading-tight text-rose-200/80">
                {a.text}
              </span>
            )}
          </button>
        );
      })}
      <button
        onClick={onEndTurn}
        disabled={!isMyTurn || !!state.self?.mustPromoteActive}
        className="mt-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Fin du tour
      </button>
    </div>
  );
}

function energyEmoji(t: PokemonEnergyType): string {
  switch (t) {
    case "fire":
      return "🔥";
    case "water":
      return "💧";
    case "grass":
      return "🍃";
    case "lightning":
      return "⚡";
    case "psychic":
      return "🌀";
    case "fighting":
      return "👊";
    case "darkness":
      return "🌑";
    case "metal":
      return "⚙️";
    case "dragon":
      return "🐉";
    case "fairy":
      return "🧚";
    case "colorless":
      return "⭐";
  }
}

/** Reproduit côté client la logique serveur du paiement de coût.
 *  Pocket : `attached` contient directement les types ("fire", "water"…). */
function canPayCost(
  attached: string[],
  cost: PokemonEnergyType[],
  _cardById: Map<string, PokemonCardData>,
): boolean {
  const pool = new Map<string, number>();
  for (const energyType of attached) {
    pool.set(energyType, (pool.get(energyType) ?? 0) + 1);
  }
  let colorlessNeeded = 0;
  for (const c of cost) {
    if (c === "colorless") colorlessNeeded++;
    else {
      const have = pool.get(c) ?? 0;
      if (have <= 0) return false;
      pool.set(c, have - 1);
    }
  }
  let remaining = 0;
  for (const n of pool.values()) remaining += n;
  return remaining >= colorlessNeeded;
}

function SelfHand({
  state,
  cardById,
  isMyTurn,
  onSetActive,
  onAddBench,
  onRemoveBench,
  onPlayBasic,
  onSelectEvolve,
  onZoomCard,
}: {
  state: BattleState;
  cardById: Map<string, PokemonCardData>;
  isMyTurn: boolean;
  onSetActive: (handIndex: number) => void;
  onAddBench: (handIndex: number) => void;
  onRemoveBench: (benchIndex: number) => void;
  onPlayBasic: (handIndex: number) => void;
  onSelectEvolve: (handIndex: number) => void;
  onZoomCard?: (card: PokemonCardData) => void;
}) {
  const self = state.self;
  if (!self) return null;
  const inSetup = state.phase === "setup" && !self.hasSetup;
  const inMain =
    state.phase === "playing" && isMyTurn && !self.mustPromoteActive;
  const benchCap = BATTLE_CONFIG.maxBench;

  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
        Ta main ({self.hand.length})
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {self.hand.map((cardId, i) => {
          const data = cardById.get(cardId);
          if (!data) return null;
          const isBasicPoke = data.kind === "pokemon" && data.stage === "basic";
          const isEvolution =
            data.kind === "pokemon" && data.stage !== "basic" && !!data.evolvesFrom;
          // Setup-phase actions
          const setupSetActive =
            inSetup && isBasicPoke && !self.active ? () => onSetActive(i) : undefined;
          const setupAddBench =
            inSetup && isBasicPoke && !!self.active && self.bench.length < benchCap
              ? () => onAddBench(i)
              : undefined;
          // Main-phase actions
          const playBench =
            inMain && isBasicPoke && self.bench.length < benchCap
              ? () => onPlayBasic(i)
              : undefined;
          const evolveCard = inMain && isEvolution ? () => onSelectEvolve(i) : undefined;

          return (
            <HandCard
              key={`${i}-${cardId}`}
              data={data}
              onSetActive={setupSetActive}
              onAddBench={setupAddBench}
              onPlayBench={playBench}
              onEvolve={evolveCard}
              onZoom={onZoomCard}
            />
          );
        })}
      </div>
      {inSetup && self.bench.length > 0 && (
        <div className="mt-2 flex gap-1.5 border-t border-white/5 pt-2">
          <span className="text-[10px] text-zinc-500">Retirer du banc :</span>
          {self.bench.map((c, i) => {
            const data = cardById.get(c.cardId);
            return (
              <button
                key={c.uid}
                onClick={() => onRemoveBench(i)}
                className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] hover:bg-rose-500/20"
              >
                {data?.kind === "pokemon" ? data.name.slice(0, 8) : ""} ✕
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HandCard({
  data,
  onSetActive,
  onAddBench,
  onPlayBench,
  onEvolve,
  onZoom,
}: {
  data: PokemonCardData;
  onSetActive?: () => void;
  onAddBench?: () => void;
  onPlayBench?: () => void;
  onEvolve?: () => void;
  onZoom?: (card: PokemonCardData) => void;
}) {
  const hasAction = onSetActive || onAddBench || onPlayBench || onEvolve;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onZoom?.(data)}
      className={`relative cursor-pointer overflow-hidden rounded border border-white/10 transition-all hover:ring-2 hover:ring-white/30 ${
        hasAction ? "mb-5" : ""
      }`}
      style={{ width: 80, height: 112 }}
      title={data.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.image}
        alt={data.name}
        className="h-full w-full object-contain"
        loading="lazy"
        draggable={false}
      />
      {hasAction && (
        <div className="absolute inset-x-0 -bottom-5 flex justify-center gap-0.5">
          {onSetActive && (
            <button
              onClick={onSetActive}
              className="rounded bg-emerald-500 px-1 py-0.5 text-[8px] font-bold text-emerald-950 hover:bg-emerald-400"
              title="Mettre Actif"
            >
              ★
            </button>
          )}
          {onAddBench && (
            <button
              onClick={onAddBench}
              className="rounded bg-amber-500 px-1 py-0.5 text-[8px] font-bold text-amber-950 hover:bg-amber-400"
              title="Ajouter au Banc"
            >
              ↓
            </button>
          )}
          {onPlayBench && (
            <button
              onClick={onPlayBench}
              className="rounded bg-amber-500 px-1 py-0.5 text-[8px] font-bold text-amber-950 hover:bg-amber-400"
              title="Poser au Banc"
            >
              ↓
            </button>
          )}
          {onEvolve && (
            <button
              onClick={onEvolve}
              className="rounded bg-violet-500 px-1 py-0.5 text-[8px] font-bold text-violet-950 hover:bg-violet-400"
              title="Évoluer"
            >
              ↑
            </button>
          )}
        </div>
      )}
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
