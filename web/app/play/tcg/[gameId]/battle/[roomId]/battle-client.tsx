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
  PokemonCardData,
  PokemonEnergyType,
  TcgGameId,
} from "@shared/types";
import { TCG_GAMES } from "@shared/types";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";

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
  const endTurn = () => send({ type: "battle-end-turn" });
  const concede = () => {
    if (!confirm("Abandonner la partie ?")) return;
    send({ type: "battle-concede" });
  };

  const isMyTurn = !!state && state.activeSeat === state.selfSeat;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/${gameId}/battle`}
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
              onSetActive={setActive}
              onAddBench={addToBench}
              onRemoveBench={removeFromBench}
              onConfirmSetup={confirmSetup}
              onEndTurn={endTurn}
            />
          )}

          {errorMsg && (
            <div className="border-t border-rose-500/40 bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-300">
              {errorMsg}
            </div>
          )}
        </main>
      )}
    </div>
  );
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
  onSetActive,
  onAddBench,
  onRemoveBench,
  onConfirmSetup,
  onEndTurn,
}: {
  state: BattleState;
  cardById: Map<string, PokemonCardData>;
  isMyTurn: boolean;
  onSetActive: (handIndex: number) => void;
  onAddBench: (handIndex: number) => void;
  onRemoveBench: (benchIndex: number) => void;
  onConfirmSetup: () => void;
  onEndTurn: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
            />
            <HandHidden count={state.opponent.handCount} />
          </div>
        </div>
      )}

      {/* Log central */}
      <BattleLog log={state.log} />

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
            />
            <SelfControls
              state={state}
              isMyTurn={isMyTurn}
              onConfirmSetup={onConfirmSetup}
              onEndTurn={onEndTurn}
            />
          </div>
          <PlayerInfo player={state.self} isOpponent={false} />
          {/* Hand */}
          <SelfHand
            state={state}
            cardById={cardById}
            onSetActive={onSetActive}
            onAddBench={onAddBench}
            onRemoveBench={onRemoveBench}
          />
        </div>
      )}

      {state.winner && (
        <div className="flex-shrink-0 bg-black/80 p-4 text-center">
          <div className="text-2xl font-bold text-amber-300">
            🏆 {state.winner === state.selfSeat ? "Victoire !" : "Défaite"}
          </div>
          <Link
            href={`/play/tcg/${state.opponent?.authId ? "pokemon" : "pokemon"}/battle`}
            className="mt-2 inline-block rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
          >
            Retour au lobby
          </Link>
        </div>
      )}
    </div>
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
}: {
  active: BattleCard | null;
  bench: BattleCard[];
  cardById: Map<string, PokemonCardData>;
  isOpponent: boolean;
}) {
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
        <BoardCard card={active} cardById={cardById} large />
      ) : (
        <div className="flex h-24 w-20 items-center justify-center rounded border border-dashed border-white/10 text-[10px] text-zinc-500">
          Actif
        </div>
      )}
      {/* Bench */}
      <div className="flex gap-1">
        {Array.from({ length: 5 }, (_, i) => {
          const card = bench[i];
          return card ? (
            <BoardCard
              key={i}
              card={card}
              cardById={cardById}
            />
          ) : (
            <div
              key={i}
              className="flex h-16 w-12 items-center justify-center rounded border border-dashed border-white/10 text-[8px] text-zinc-500"
            >
              Banc
            </div>
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
  onConfirmSetup,
  onEndTurn,
}: {
  state: BattleState;
  isMyTurn: boolean;
  onConfirmSetup: () => void;
  onEndTurn: () => void;
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
  if (state.phase === "playing") {
    return (
      <button
        onClick={onEndTurn}
        disabled={!isMyTurn}
        className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Fin du tour
      </button>
    );
  }
  return null;
}

function SelfHand({
  state,
  cardById,
  onSetActive,
  onAddBench,
  onRemoveBench,
}: {
  state: BattleState;
  cardById: Map<string, PokemonCardData>;
  onSetActive: (handIndex: number) => void;
  onAddBench: (handIndex: number) => void;
  onRemoveBench: (benchIndex: number) => void;
}) {
  const self = state.self;
  if (!self) return null;
  const inSetup = state.phase === "setup" && !self.hasSetup;
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
        Ta main ({self.hand.length})
      </div>
      <div className="flex flex-wrap gap-1">
        {self.hand.map((cardId, i) => {
          const data = cardById.get(cardId);
          if (!data) return null;
          const isBasic = data.kind === "pokemon" && data.stage === "basic";
          return (
            <HandCard
              key={`${i}-${cardId}`}
              data={data}
              onSetActive={
                inSetup && isBasic && !self.active
                  ? () => onSetActive(i)
                  : undefined
              }
              onAddBench={
                inSetup && isBasic && !!self.active && self.bench.length < 5
                  ? () => onAddBench(i)
                  : undefined
              }
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
}: {
  data: PokemonCardData;
  onSetActive?: () => void;
  onAddBench?: () => void;
}) {
  const isEnergy = data.kind === "energy";
  const bg = isEnergy
    ? TYPE_BG[data.energyType]
    : TYPE_BG[data.type] ?? TYPE_BG.colorless;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex flex-col items-center gap-1 rounded border bg-gradient-to-b ${bg} p-1 text-zinc-100`}
      style={{ width: 56, height: 80 }}
    >
      <span className="text-[8px] font-bold leading-tight">
        {data.name.slice(0, 8)}
      </span>
      <span className="text-2xl">{data.art}</span>
      {!isEnergy && (
        <span className="text-[8px] text-rose-200">PV {data.hp}</span>
      )}
      {(onSetActive || onAddBench) && (
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
        </div>
      )}
    </motion.div>
  );
}

function BattleLog({ log }: { log: string[] }) {
  return (
    <div className="flex-1 overflow-y-auto bg-black/20 px-4 py-2">
      <div className="mx-auto max-w-2xl space-y-1 text-xs text-zinc-300">
        <AnimatePresence initial={false}>
          {log.slice(-15).map((line, i) => (
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
