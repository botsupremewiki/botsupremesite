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
import { TCG_GAMES } from "@shared/types";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { useRegisterProximityChat } from "@/app/play/proximity-chat-context";
import { CardFace } from "../../_components/card-visuals";

type ConnStatus = "connecting" | "connected" | "disconnected";

const TYPE_BG: Record<PokemonEnergyType, string> = {
  fire: "from-orange-500/30 to-red-700/40",
  water: "from-blue-400/30 to-blue-700/40",
  grass: "from-emerald-400/30 to-emerald-700/40",
  lightning: "from-yellow-400/30 to-yellow-600/40",
  psychic: "from-fuchsia-400/30 to-purple-700/40",
  fighting: "from-amber-700/30 to-stone-700/40",
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
  const attachEnergy = (handIndex: number, targetUid: string) =>
    send({ type: "battle-attach-energy", handIndex, targetUid });
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
  onAttachEnergy: (handIndex: number, targetUid: string) => void;
  onEvolve: (handIndex: number, targetUid: string) => void;
  onRetreat: (benchIndex: number) => void;
  onAttack: (attackIndex: number) => void;
  onPromoteActive: (benchIndex: number) => void;
}) {
  // Mode "attach energy" : index de l'énergie sélectionnée en main
  const [pendingEnergyIdx, setPendingEnergyIdx] = useState<number | null>(null);
  const [pendingEvolveIdx, setPendingEvolveIdx] = useState<number | null>(null);
  const cancelPending = () => {
    setPendingEnergyIdx(null);
    setPendingEvolveIdx(null);
  };
  const promptPromote = state.self?.mustPromoteActive;

  // Carte survolée (board ou main) → affichée en grand dans la sidebar récap.
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const hoveredCard = hoveredCardId ? cardById.get(hoveredCardId) ?? null : null;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar récap : log de match OU preview de la carte survolée */}
      <RecapSidebar log={state.log} hoveredCard={hoveredCard} />

      {/* Centre : opponent / self zones bien centrés et plus grands */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Opponent zone */}
        {state.opponent && (
          <div className="flex-shrink-0 border-b border-white/10 bg-black/30 p-3">
            <PlayerInfo player={state.opponent} isOpponent />
            <div className="mt-2 flex items-center justify-center gap-3">
              <BackRow side="opp" prizes={state.opponent.prizesRemaining} deckSize={state.opponent.deckSize} discardCount={state.opponent.discardCount} />
              <BoardArea
                active={state.opponent.active}
                bench={state.opponent.bench}
                cardById={cardById}
                isOpponent
                onHoverCard={setHoveredCardId}
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
            <div className="flex items-center justify-center gap-3">
              <BackRow side="self" prizes={state.self.prizesRemaining} deckSize={state.self.deckSize} discardCount={state.self.discardCount} />
              <BoardArea
                active={state.self.active}
                bench={state.self.bench}
                cardById={cardById}
                isOpponent={false}
                onHoverCard={setHoveredCardId}
                attachMode={
                  pendingEnergyIdx !== null
                    ? (uid) => {
                        onAttachEnergy(pendingEnergyIdx, uid);
                        setPendingEnergyIdx(null);
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

            {(pendingEnergyIdx !== null || pendingEvolveIdx !== null) && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-200">
                {pendingEnergyIdx !== null
                  ? "Choisis un Pokémon à qui attacher cette Énergie."
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
              onHoverCard={setHoveredCardId}
              onSelectEnergy={(i) => {
                setPendingEvolveIdx(null);
                setPendingEnergyIdx(i);
              }}
              onSelectEvolve={(i) => {
                setPendingEnergyIdx(null);
                setPendingEvolveIdx(i);
              }}
            />
          </div>
        )}

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

/** Sidebar gauche du board : preview carte survolée OU log de match. */
function RecapSidebar({
  log,
  hoveredCard,
}: {
  log: string[];
  hoveredCard: PokemonCardData | null;
}) {
  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-black/40">
      {hoveredCard ? (
        <div className="flex flex-col gap-2 p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Aperçu
          </div>
          <div className="aspect-[5/7] w-full">
            <CardFace card={hoveredCard} large />
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}
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
        Main {player.handCount} · Deck {player.deckSize} · Prizes{" "}
        <span className="font-bold text-amber-300">
          {player.prizesRemaining}
        </span>
      </span>
    </div>
  );
}

function BackRow({
  side,
  prizes,
  deckSize,
  discardCount,
}: {
  side: "self" | "opp";
  prizes: number;
  deckSize: number;
  discardCount: number;
}) {
  void side;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-col items-center">
        <div className="text-[9px] uppercase tracking-widest text-zinc-500">Prizes</div>
        <div className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className={`h-5 w-4 rounded-sm border ${
                i < prizes ? "border-amber-300/60 bg-amber-700/40" : "border-white/5 bg-white/[0.02]"
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
  onHoverCard,
}: {
  active: BattleCard | null;
  bench: BattleCard[];
  cardById: Map<string, PokemonCardData>;
  isOpponent: boolean;
  attachMode?: ((targetUid: string) => void) | null;
  promoteMode?: boolean;
  onPromote?: (benchIndex: number) => void;
  onRetreat?: ((benchIndex: number) => void) | null;
  onHoverCard?: (cardId: string | null) => void;
}) {
  const ownActions = !isOpponent;
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-lg border-2 px-4 py-2 ${
        isOpponent
          ? "border-rose-400/30 bg-rose-950/20"
          : "border-emerald-400/30 bg-emerald-950/20"
      }`}
    >
      {/* Active */}
      {active ? (
        <button
          disabled={!ownActions || !attachMode}
          onClick={() => {
            if (attachMode && active) attachMode(active.uid);
          }}
          onMouseEnter={() => onHoverCard?.(active.cardId)}
          onMouseLeave={() => onHoverCard?.(null)}
          className={`disabled:cursor-default ${
            attachMode ? "ring-2 ring-amber-300 hover:ring-amber-200" : ""
          } rounded`}
        >
          <BoardCard card={active} cardById={cardById} large />
        </button>
      ) : (
        <div className="flex h-24 w-20 items-center justify-center rounded border border-dashed border-white/10 text-[10px] text-zinc-500">
          Actif
        </div>
      )}
      {/* Bench */}
      <div className="flex gap-1">
        {Array.from({ length: 5 }, (_, i) => {
          const card = bench[i];
          if (!card) {
            return (
              <div
                key={i}
                className="flex h-16 w-12 items-center justify-center rounded border border-dashed border-white/10 text-[8px] text-zinc-500"
              >
                Banc
              </div>
            );
          }
          const interactive = ownActions && (attachMode || promoteMode || onRetreat);
          return (
            <button
              key={i}
              disabled={!interactive}
              onClick={() => {
                if (attachMode) attachMode(card.uid);
                else if (promoteMode && onPromote) onPromote(i);
                else if (onRetreat) onRetreat(i);
              }}
              onMouseEnter={() => onHoverCard?.(card.cardId)}
              onMouseLeave={() => onHoverCard?.(null)}
              className={`disabled:cursor-default ${
                attachMode || promoteMode
                  ? "ring-2 ring-amber-300 hover:ring-amber-200"
                  : onRetreat
                    ? "hover:ring-2 hover:ring-sky-300"
                    : ""
              } rounded`}
              title={
                promoteMode
                  ? "Promouvoir comme Actif"
                  : onRetreat
                    ? "Battre en retraite vers ce Pokémon"
                    : undefined
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
  const bg = TYPE_BG[data.type] ?? TYPE_BG.colorless;
  const w = large ? 80 : 48;
  const h = large ? 96 : 64;
  const remainingHp = Math.max(0, data.hp - card.damage);
  return (
    <div
      className={`relative flex flex-col items-center justify-between rounded border bg-gradient-to-b ${bg} p-1 text-zinc-100`}
      style={{ width: w, height: h }}
    >
      <span
        className="self-start text-[9px] font-bold leading-none"
        title={data.name}
      >
        {data.name.slice(0, large ? 8 : 5)}
      </span>
      <span style={{ fontSize: large ? 28 : 18 }}>{data.art}</span>
      <div className="flex w-full items-center justify-between text-[8px] tabular-nums">
        <span className="text-rose-200">
          {remainingHp}/{data.hp}
        </span>
        <span className="text-zinc-300">
          {card.attachedEnergies.length > 0 && `⚡${card.attachedEnergies.length}`}
        </span>
      </div>
      {card.statuses.length > 0 && (
        <div className="absolute right-0 top-0 rounded-bl bg-black/70 px-0.5 text-[8px]">
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
    case "colorless":
      return "⭐";
  }
}

/** Reproduit côté client la logique serveur du paiement de coût. */
function canPayCost(
  attached: string[],
  cost: PokemonEnergyType[],
  cardById: Map<string, PokemonCardData>,
): boolean {
  const pool = new Map<string, number>();
  for (const id of attached) {
    const data = cardById.get(id);
    if (data?.kind !== "energy") continue;
    pool.set(data.energyType, (pool.get(data.energyType) ?? 0) + 1);
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
  onSelectEnergy,
  onSelectEvolve,
  onHoverCard,
}: {
  state: BattleState;
  cardById: Map<string, PokemonCardData>;
  isMyTurn: boolean;
  onSetActive: (handIndex: number) => void;
  onAddBench: (handIndex: number) => void;
  onRemoveBench: (benchIndex: number) => void;
  onPlayBasic: (handIndex: number) => void;
  onSelectEnergy: (handIndex: number) => void;
  onSelectEvolve: (handIndex: number) => void;
  onHoverCard?: (cardId: string | null) => void;
}) {
  const self = state.self;
  if (!self) return null;
  const inSetup = state.phase === "setup" && !self.hasSetup;
  const inMain =
    state.phase === "playing" && isMyTurn && !self.mustPromoteActive;

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
          const isEnergyCard = data.kind === "energy";
          // Setup-phase actions
          const setupSetActive =
            inSetup && isBasicPoke && !self.active ? () => onSetActive(i) : undefined;
          const setupAddBench =
            inSetup && isBasicPoke && !!self.active && self.bench.length < 5
              ? () => onAddBench(i)
              : undefined;
          // Main-phase actions
          const playBench =
            inMain && isBasicPoke && self.bench.length < 5
              ? () => onPlayBasic(i)
              : undefined;
          const attachEnergy =
            inMain && isEnergyCard && !self.energyAttachedThisTurn
              ? () => onSelectEnergy(i)
              : undefined;
          const evolveCard = inMain && isEvolution ? () => onSelectEvolve(i) : undefined;

          return (
            <HandCard
              key={`${i}-${cardId}`}
              data={data}
              onSetActive={setupSetActive}
              onAddBench={setupAddBench}
              onPlayBench={playBench}
              onAttachEnergy={attachEnergy}
              onEvolve={evolveCard}
              onHover={onHoverCard}
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
                {data?.art}
                {data?.kind === "pokemon" ? data.name.slice(0, 6) : ""} ✕
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
  onAttachEnergy,
  onEvolve,
  onHover,
}: {
  data: PokemonCardData;
  onSetActive?: () => void;
  onAddBench?: () => void;
  onPlayBench?: () => void;
  onAttachEnergy?: () => void;
  onEvolve?: () => void;
  onHover?: (cardId: string | null) => void;
}) {
  const isEnergyCard = data.kind === "energy";
  const bg = isEnergyCard
    ? TYPE_BG[data.energyType]
    : TYPE_BG[data.type] ?? TYPE_BG.colorless;
  const hasAction =
    onSetActive || onAddBench || onPlayBench || onAttachEnergy || onEvolve;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => onHover?.(data.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`relative flex flex-col items-center gap-1 rounded border bg-gradient-to-b ${bg} p-1 text-zinc-100 ${
        hasAction ? "mb-5" : ""
      }`}
      style={{ width: 56, height: 80 }}
    >
      <span className="text-[8px] font-bold leading-tight">
        {data.name.slice(0, 8)}
      </span>
      <span className="text-2xl">{data.art}</span>
      {!isEnergyCard && (
        <span className="text-[8px] text-rose-200">PV {data.hp}</span>
      )}
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
          {onAttachEnergy && (
            <button
              onClick={onAttachEnergy}
              className="rounded bg-sky-500 px-1 py-0.5 text-[8px] font-bold text-sky-950 hover:bg-sky-400"
              title="Attacher cette Énergie"
            >
              ⚡
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
