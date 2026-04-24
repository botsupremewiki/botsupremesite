"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  ChatMessage,
  ClientMessage,
  Player,
  RouletteClientMessage,
  RouletteSeat,
  RouletteServerMessage,
  RouletteState,
} from "@shared/types";
import { ROULETTE_CONFIG } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { ChatPanel } from "@/app/play/chat-panel";
import { buildChannels } from "@/app/play/area-client";
import { useAuxChat } from "@/app/play/use-aux-chat";
import { useDmHub } from "@/app/play/use-dm-hub";
import { DmView } from "@/app/play/dm-view";

type ConnStatus = "connecting" | "connected" | "disconnected";

const RED_SET = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const NUM_COLOR = (n: number): "red" | "black" | "green" =>
  n === 0 ? "green" : RED_SET.has(n) ? "red" : "black";

export function RouletteClient({
  profile,
  tableId,
}: {
  profile: Profile | null;
  tableId: string;
}) {
  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [players, setPlayers] = useState<Player[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [gold, setGold] = useState<number>(profile?.gold ?? 1000);
  const [state, setState] = useState<RouletteState | null>(null);
  const [betDraft, setBetDraft] = useState<string>("10");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const globalChat = useAuxChat({
    partyName: "global",
    room: "main",
    query: { name: profile?.username, authId: profile?.id },
  });
  const zoneChat = useAuxChat({
    partyName: "zone",
    room: "casino",
    query: { name: profile?.username, authId: profile?.id },
  });
  const dmHub = useDmHub({
    authId: profile?.id ?? null,
    username: profile?.username ?? null,
    enabled: !!profile,
  });

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
      if (profile.avatar_url) params.set("avatarUrl", profile.avatar_url);
    }
    const url = `${scheme}://${partyHost}/parties/roulette/${tableId}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    setStatus("connecting");

    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: RouletteServerMessage;
      try {
        msg = JSON.parse(e.data as string) as RouletteServerMessage;
      } catch {
        return;
      }
      handleMessage(msg);
    });

    function handleMessage(msg: RouletteServerMessage) {
      switch (msg.type) {
        case "roulette-welcome":
          selfIdRef.current = msg.selfId;
          setPlayers(msg.players);
          setChat(msg.chat);
          setState(msg.state);
          setGold(msg.gold);
          break;
        case "player-joined":
          setPlayers((prev) => [...prev, msg.player]);
          break;
        case "player-left":
          setPlayers((prev) => prev.filter((p) => p.id !== msg.playerId));
          break;
        case "player-moved":
        case "player-renamed":
          // We render only seats, no walking avatars here.
          break;
        case "chat":
          setChat((prev) => [...prev.slice(-29), msg.message]);
          break;
        case "roulette-state":
          setState(msg.state);
          setErrorMsg(null);
          break;
        case "gold-update":
          setGold(msg.gold);
          break;
        case "roulette-error":
          setErrorMsg(msg.message);
          break;
      }
    }

    return () => {
      cancelled = true;
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
    };
  }, [profile, tableId]);

  const send = useCallback(
    (msg: ClientMessage | RouletteClientMessage) => {
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(msg));
    },
    [],
  );

  const sendRawChat = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      send({ type: "chat", text: t });
    },
    [send],
  );

  const takeSeat = (seatIndex: number) => send({ type: "take-seat", seatIndex });
  const leaveSeat = () => send({ type: "leave-seat" });
  const setReady = () => send({ type: "ready" });
  const clearBets = () => send({ type: "clear-bets" });

  const parsedBet = Math.floor(Number(betDraft) || 0);
  const validAmount =
    Number.isFinite(parsedBet) &&
    parsedBet >= ROULETTE_CONFIG.minBet &&
    parsedBet <= Math.min(gold, ROULETTE_CONFIG.maxBet);

  const placeBet = useCallback(
    (betKey: string) => {
      if (!validAmount) return;
      send({ type: "place-bet", betKey, amount: parsedBet });
    },
    [parsedBet, send, validAmount],
  );

  const setPreset = (v: number) =>
    setBetDraft(String(Math.max(ROULETTE_CONFIG.minBet, Math.floor(v))));

  const selfSeat = useMemo(
    () =>
      state?.seats.find((s) => s.playerId === selfIdRef.current) ?? null,
    [state],
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/casino"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Casino
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-medium">
            Roulette · Table {tableId.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <StatusIndicator status={status} />
          <span className="tabular-nums">
            {players.length} joueur{players.length > 1 ? "s" : ""}
          </span>
          {profile && (
            <UserPill profile={{ ...profile, gold }} variant="play" />
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex flex-1 flex-col items-center gap-3 overflow-auto bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.06),transparent_55%)] p-4">
          {status !== "connected" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="text-sm text-zinc-300">
                {status === "connecting"
                  ? "Arrivée à la table..."
                  : "Connexion perdue — recharger."}
              </div>
            </div>
          )}

          {state && (
            <>
              <WheelPanel state={state} />
              <BettingGrid
                state={state}
                selfSeat={selfSeat}
                onBet={placeBet}
                disabled={
                  state.phase !== "betting" || !selfSeat || !validAmount
                }
              />
              <SeatsRow
                state={state}
                selfIdRef={selfIdRef}
                onTake={takeSeat}
              />
              <BetControls
                profile={profile}
                state={state}
                selfSeat={selfSeat}
                gold={gold}
                betDraft={betDraft}
                setBetDraft={setBetDraft}
                setPreset={setPreset}
                validAmount={validAmount}
                onReady={setReady}
                onLeave={leaveSeat}
                onClear={clearBets}
                errorMsg={errorMsg}
              />
            </>
          )}
        </main>

        <ChatPanel
          channels={buildChannels({
            localMessages: chat,
            localOnSend: sendRawChat,
            localEnabled: status === "connected",
            globalMessages: globalChat.messages,
            globalOnSend: globalChat.send,
            globalEnabled: globalChat.status === "connected",
            zoneMessages: zoneChat.messages,
            zoneOnSend: zoneChat.send,
            zoneEnabled: zoneChat.status === "connected",
            zoneLabel: "Casino",
            dmsReason: profile
              ? undefined
              : "Connecte-toi avec Discord pour les DMs",
          })}
          connected={status === "connected"}
          hint="Entrée ouvre le chat"
          currentUser={
            profile
              ? { username: profile.username, isAdmin: profile.is_admin }
              : undefined
          }
          renderDm={
            profile
              ? () => (
                  <DmView
                    hub={dmHub}
                    selfAuthId={profile.id}
                    selfIsAdmin={profile.is_admin}
                    selfUsername={profile.username}
                  />
                )
              : undefined
          }
        />
      </div>
    </div>
  );
}

// ──────────────────────────────── Wheel / history ────────────────────────

function WheelPanel({ state }: { state: RouletteState }) {
  const phaseLabel =
    state.phase === "idle"
      ? "Entre deux tours"
      : state.phase === "betting"
        ? "Faites vos jeux"
        : state.phase === "spinning"
          ? "La roulette tourne..."
          : "Résultat";

  return (
    <div className="flex w-full max-w-5xl items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-col">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          {phaseLabel}
        </div>
        {state.lastOutcome && state.phase === "resolving" && (
          <div className="mt-0.5 truncate text-xs text-amber-300">
            {state.lastOutcome}
          </div>
        )}
      </div>

      <SpinResult state={state} />

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Historique
        </span>
        <div className="flex gap-1">
          {state.recentNumbers.length === 0 && (
            <span className="text-xs italic text-zinc-600">—</span>
          )}
          {state.recentNumbers.map((n, i) => (
            <HistoryChip key={`${n}-${i}`} n={n} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SpinResult({ state }: { state: RouletteState }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <AnimatePresence mode="wait">
        {state.phase === "spinning" ? (
          <motion.div
            key="spin"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2"
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-r-transparent" />
            <span className="text-xs font-semibold tracking-widest text-amber-300">
              EN COURS
            </span>
          </motion.div>
        ) : state.winningNumber != null ? (
          <motion.div
            key={`num-${state.winningNumber}`}
            initial={{ opacity: 0, scale: 0.5, rotate: -15 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg ${
              NUM_COLOR(state.winningNumber) === "red"
                ? "bg-rose-600 shadow-rose-500/50"
                : NUM_COLOR(state.winningNumber) === "black"
                  ? "bg-zinc-900 shadow-black/50"
                  : "bg-emerald-600 shadow-emerald-500/50"
            }`}
          >
            {state.winningNumber}
          </motion.div>
        ) : (
          <motion.div
            key="idle-result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 text-xs text-zinc-500"
          >
            ?
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryChip({ n }: { n: number }) {
  const color = NUM_COLOR(n);
  const bg =
    color === "red"
      ? "bg-rose-600"
      : color === "black"
        ? "bg-zinc-900"
        : "bg-emerald-600";
  return (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white ${bg}`}
    >
      {n}
    </span>
  );
}

// ──────────────────────────────── Betting grid ───────────────────────────

// Standard European board layout:
//   Columns (right side, 2:1): top row=col3, middle=col2, bottom=col1.
//   Rows of numbers: top=3,6,...,36 ; middle=2,5,...,35 ; bottom=1,4,...,34.
const TOP_ROW = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
const MID_ROW = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const BOT_ROW = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

function BettingGrid({
  state,
  selfSeat,
  onBet,
  disabled,
}: {
  state: RouletteState;
  selfSeat: RouletteSeat | null;
  onBet: (betKey: string) => void;
  disabled: boolean;
}) {
  const allBets = useMemo(() => {
    // Aggregate bets from all seats (so we can show total activity per spot).
    // For self, we highlight our own bets separately.
    const agg: Record<string, number> = {};
    const mine: Record<string, number> = {};
    for (const seat of state.seats) {
      for (const [k, v] of Object.entries(seat.bets)) {
        agg[k] = (agg[k] ?? 0) + v;
        if (seat.playerId === selfSeat?.playerId) {
          mine[k] = (mine[k] ?? 0) + v;
        }
      }
    }
    return { agg, mine };
  }, [state, selfSeat]);

  const renderNumber = (n: number) => {
    const color = NUM_COLOR(n);
    const bg =
      color === "red"
        ? "bg-rose-600/70 hover:bg-rose-500"
        : color === "black"
          ? "bg-zinc-900/80 hover:bg-zinc-800"
          : "bg-emerald-600/70 hover:bg-emerald-500";
    const isWinning =
      state.phase !== "betting" && state.winningNumber === n;
    return (
      <BetCell
        key={`n-${n}`}
        betKey={`straight-${n}`}
        disabled={disabled}
        onBet={onBet}
        highlight={isWinning}
        mineAmount={allBets.mine[`straight-${n}`] ?? 0}
        totalAmount={allBets.agg[`straight-${n}`] ?? 0}
        className={`flex h-11 items-center justify-center rounded-sm text-sm font-bold text-white ${bg}`}
      >
        {n}
      </BetCell>
    );
  };

  return (
    <div className="w-full max-w-5xl rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="flex gap-1">
        {/* 0 (tall, left) */}
        <div className="flex">
          <BetCell
            betKey="straight-0"
            disabled={disabled}
            onBet={onBet}
            highlight={
              state.phase !== "betting" && state.winningNumber === 0
            }
            mineAmount={allBets.mine["straight-0"] ?? 0}
            totalAmount={allBets.agg["straight-0"] ?? 0}
            className="flex w-10 items-center justify-center rounded-sm bg-emerald-600/70 text-sm font-bold text-white hover:bg-emerald-500"
            style={{ height: "140px" }}
          >
            0
          </BetCell>
        </div>

        {/* Numbers grid + columns 2:1 */}
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex gap-1">
            {TOP_ROW.map(renderNumber)}
            <BetCell
              betKey="column3"
              disabled={disabled}
              onBet={onBet}
              highlight={false}
              mineAmount={allBets.mine["column3"] ?? 0}
              totalAmount={allBets.agg["column3"] ?? 0}
              className="flex h-11 w-14 items-center justify-center rounded-sm bg-white/5 text-[10px] font-semibold uppercase text-zinc-300 hover:bg-white/10"
            >
              2:1
            </BetCell>
          </div>
          <div className="flex gap-1">
            {MID_ROW.map(renderNumber)}
            <BetCell
              betKey="column2"
              disabled={disabled}
              onBet={onBet}
              highlight={false}
              mineAmount={allBets.mine["column2"] ?? 0}
              totalAmount={allBets.agg["column2"] ?? 0}
              className="flex h-11 w-14 items-center justify-center rounded-sm bg-white/5 text-[10px] font-semibold uppercase text-zinc-300 hover:bg-white/10"
            >
              2:1
            </BetCell>
          </div>
          <div className="flex gap-1">
            {BOT_ROW.map(renderNumber)}
            <BetCell
              betKey="column1"
              disabled={disabled}
              onBet={onBet}
              highlight={false}
              mineAmount={allBets.mine["column1"] ?? 0}
              totalAmount={allBets.agg["column1"] ?? 0}
              className="flex h-11 w-14 items-center justify-center rounded-sm bg-white/5 text-[10px] font-semibold uppercase text-zinc-300 hover:bg-white/10"
            >
              2:1
            </BetCell>
          </div>

          {/* Dozens */}
          <div className="mt-1 flex gap-1">
            {(["dozen1", "dozen2", "dozen3"] as const).map((k, i) => (
              <BetCell
                key={k}
                betKey={k}
                disabled={disabled}
                onBet={onBet}
                highlight={false}
                mineAmount={allBets.mine[k] ?? 0}
                totalAmount={allBets.agg[k] ?? 0}
                className="flex h-10 flex-1 items-center justify-center rounded-sm bg-white/5 text-xs font-semibold text-zinc-300 hover:bg-white/10"
              >
                {i === 0 ? "1–12" : i === 1 ? "13–24" : "25–36"}
              </BetCell>
            ))}
            <div className="w-14" />
          </div>

          {/* Outside bets */}
          <div className="flex gap-1">
            <BetCell
              betKey="low"
              disabled={disabled}
              onBet={onBet}
              highlight={false}
              mineAmount={allBets.mine["low"] ?? 0}
              totalAmount={allBets.agg["low"] ?? 0}
              className="flex h-10 flex-1 items-center justify-center rounded-sm bg-white/5 text-xs font-semibold text-zinc-300 hover:bg-white/10"
            >
              1–18
            </BetCell>
            <BetCell
              betKey="even"
              disabled={disabled}
              onBet={onBet}
              highlight={false}
              mineAmount={allBets.mine["even"] ?? 0}
              totalAmount={allBets.agg["even"] ?? 0}
              className="flex h-10 flex-1 items-center justify-center rounded-sm bg-white/5 text-xs font-semibold text-zinc-300 hover:bg-white/10"
            >
              Pair
            </BetCell>
            <BetCell
              betKey="red"
              disabled={disabled}
              onBet={onBet}
              highlight={false}
              mineAmount={allBets.mine["red"] ?? 0}
              totalAmount={allBets.agg["red"] ?? 0}
              className="flex h-10 flex-1 items-center justify-center rounded-sm bg-rose-600/60 text-xs font-semibold text-white hover:bg-rose-500"
            >
              Rouge
            </BetCell>
            <BetCell
              betKey="black"
              disabled={disabled}
              onBet={onBet}
              highlight={false}
              mineAmount={allBets.mine["black"] ?? 0}
              totalAmount={allBets.agg["black"] ?? 0}
              className="flex h-10 flex-1 items-center justify-center rounded-sm bg-zinc-900/80 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              Noir
            </BetCell>
            <BetCell
              betKey="odd"
              disabled={disabled}
              onBet={onBet}
              highlight={false}
              mineAmount={allBets.mine["odd"] ?? 0}
              totalAmount={allBets.agg["odd"] ?? 0}
              className="flex h-10 flex-1 items-center justify-center rounded-sm bg-white/5 text-xs font-semibold text-zinc-300 hover:bg-white/10"
            >
              Impair
            </BetCell>
            <BetCell
              betKey="high"
              disabled={disabled}
              onBet={onBet}
              highlight={false}
              mineAmount={allBets.mine["high"] ?? 0}
              totalAmount={allBets.agg["high"] ?? 0}
              className="flex h-10 flex-1 items-center justify-center rounded-sm bg-white/5 text-xs font-semibold text-zinc-300 hover:bg-white/10"
            >
              19–36
            </BetCell>
            <div className="w-14" />
          </div>
        </div>
      </div>
    </div>
  );
}

function BetCell({
  betKey,
  disabled,
  onBet,
  highlight,
  mineAmount,
  totalAmount,
  className,
  style,
  children,
}: {
  betKey: string;
  disabled: boolean;
  onBet: (betKey: string) => void;
  highlight: boolean;
  mineAmount: number;
  totalAmount: number;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onBet(betKey)}
      disabled={disabled}
      style={style}
      className={`group relative ${className} ${disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"} ${highlight ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-black" : ""}`}
    >
      {children}
      {mineAmount > 0 && (
        <motion.span
          key={mineAmount}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-zinc-900 shadow"
        >
          {formatShort(mineAmount)}
        </motion.span>
      )}
      {totalAmount > 0 && mineAmount === 0 && (
        <span className="pointer-events-none absolute -left-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white/30 px-1 text-[8px] font-bold text-white">
          {formatShort(totalAmount)}
        </span>
      )}
    </button>
  );
}

function formatShort(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 1000)}k`;
  return String(n);
}

// ──────────────────────────────── Seats ──────────────────────────────────

function SeatsRow({
  state,
  selfIdRef,
  onTake,
}: {
  state: RouletteState;
  selfIdRef: React.RefObject<string | null>;
  onTake: (seatIndex: number) => void;
}) {
  return (
    <div className="flex w-full max-w-5xl items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
      {state.seats.map((seat) => {
        const mine = seat.playerId === selfIdRef.current;
        const taken = !!seat.playerId;
        return (
          <button
            key={seat.seatIndex}
            type="button"
            onClick={() => !taken && onTake(seat.seatIndex)}
            disabled={taken && !mine}
            className={`flex min-w-[90px] flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center text-xs transition-colors ${
              mine
                ? "border-amber-300/70 bg-amber-300/10 text-amber-200"
                : taken
                  ? "border-white/10 bg-white/5 text-zinc-400"
                  : "border-white/10 bg-black/30 text-zinc-300 hover:border-indigo-400/60 hover:bg-indigo-400/10"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest">
              #{seat.seatIndex + 1}
            </span>
            <span className="truncate text-sm font-medium">
              {seat.playerName ?? "Libre"}
            </span>
            {taken && (
              <span className="flex items-center gap-1 text-[10px]">
                <span className="rounded-full bg-amber-400/10 px-1.5 py-0.5 text-amber-300">
                  {seat.gold.toLocaleString("fr-FR")} OS
                </span>
                {seat.totalBet > 0 && (
                  <span className="rounded-full bg-rose-400/10 px-1.5 py-0.5 text-rose-300">
                    mise {seat.totalBet}
                  </span>
                )}
              </span>
            )}
            {seat.status === "won" && (
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"
              >
                +{seat.lastDelta}
              </motion.span>
            )}
            {seat.status === "lost" && (
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300"
              >
                {seat.lastDelta}
              </motion.span>
            )}
            {seat.ready && state.phase === "idle" && (
              <span className="text-[10px] text-emerald-300">Prêt</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────── Bet controls ───────────────────────────

function BetControls({
  profile,
  state,
  selfSeat,
  gold,
  betDraft,
  setBetDraft,
  setPreset,
  validAmount,
  onReady,
  onLeave,
  onClear,
  errorMsg,
}: {
  profile: Profile | null;
  state: RouletteState;
  selfSeat: RouletteSeat | null;
  gold: number;
  betDraft: string;
  setBetDraft: (v: string) => void;
  setPreset: (v: number) => void;
  validAmount: boolean;
  onReady: () => void;
  onLeave: () => void;
  onClear: () => void;
  errorMsg: string | null;
}) {
  if (!profile) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-400">
        Connecte-toi avec Discord pour jouer.
      </div>
    );
  }
  if (!selfSeat) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-xs text-zinc-400">
        Clique sur un siège libre pour t&apos;asseoir à la table.
      </div>
    );
  }

  const phase = state.phase;
  const canBet = phase === "betting";
  const showReady = phase === "idle" && !selfSeat.ready;

  return (
    <div className="flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-zinc-500">
          Montant du jeton
        </span>
        <input
          type="number"
          min={ROULETTE_CONFIG.minBet}
          max={Math.min(gold, ROULETTE_CONFIG.maxBet)}
          step={1}
          value={betDraft}
          onChange={(e) => setBetDraft(e.target.value.replace(/[^0-9]/g, ""))}
          className="w-28 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-300"
          placeholder={String(ROULETTE_CONFIG.minBet)}
        />
        <button
          type="button"
          onClick={() => setPreset(Math.floor(gold / 2))}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
        >
          ½
        </button>
        <button
          type="button"
          onClick={() => setPreset((parseInt(betDraft, 10) || 0) * 2)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
        >
          ×2
        </button>
        <button
          type="button"
          onClick={() => setPreset(gold)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
        >
          Max
        </button>
      </div>

      <div className="flex items-center gap-2">
        {showReady && (
          <button
            type="button"
            onClick={onReady}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-400"
          >
            Je suis prêt
          </button>
        )}
        {phase === "idle" && selfSeat.ready && (
          <span className="rounded-md bg-emerald-400/10 px-3 py-1.5 text-emerald-300">
            Prêt — en attente des autres
          </span>
        )}
        {canBet && (
          <>
            <span className="text-[11px] text-zinc-500">
              {validAmount
                ? "Clique sur la table pour placer un jeton"
                : `Mise entre ${ROULETTE_CONFIG.minBet} et ${Math.min(gold, ROULETTE_CONFIG.maxBet).toLocaleString("fr-FR")}`}
            </span>
            <button
              type="button"
              onClick={onClear}
              disabled={selfSeat.totalBet === 0}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40"
            >
              Annuler mises ({selfSeat.totalBet.toLocaleString("fr-FR")} OS)
            </button>
          </>
        )}
        {phase === "spinning" && (
          <span className="rounded-md bg-amber-400/10 px-3 py-1.5 text-amber-300">
            La roue tourne...
          </span>
        )}
        {(phase === "idle" || phase === "resolving") && (
          <button
            type="button"
            onClick={onLeave}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
          >
            Quitter la place
          </button>
        )}
      </div>

      {errorMsg && <div className="w-full text-rose-400">{errorMsg}</div>}
    </div>
  );
}

// ──────────────────────────────── Status pill ────────────────────────────

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
