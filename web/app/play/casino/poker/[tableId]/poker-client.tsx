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
import { motion, AnimatePresence } from "framer-motion";
import type {
  Card,
  ChatMessage,
  PokerClientMessage,
  PokerSeat,
  PokerServerMessage,
  PokerState,
  PokerTableConfig,
  PokerTableId,
} from "@shared/types";
import { POKER_TABLES } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { ChatPanel } from "@/app/play/chat-panel";
import { buildChannels } from "@/app/play/area-client";
import { useAuxChat } from "@/app/play/use-aux-chat";
import { useDmHub } from "@/app/play/use-dm-hub";
import { DmView } from "@/app/play/dm-view";
import { Countdown } from "@/app/play/countdown";

type ConnStatus = "connecting" | "connected" | "disconnected";

export function PokerClient({
  profile,
  tableId,
}: {
  profile: Profile | null;
  tableId: PokerTableId;
}) {
  const tableFallback = POKER_TABLES[tableId];
  const [table, setTable] = useState<PokerTableConfig>(tableFallback);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [gold, setGold] = useState<number>(profile?.gold ?? 0);
  const [state, setState] = useState<PokerState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);

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
      params.set("gold", String(profile.gold));
    }
    const url = `${scheme}://${partyHost}/parties/poker/${tableId}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: PokerServerMessage;
      try {
        msg = JSON.parse(e.data as string) as PokerServerMessage;
      } catch {
        return;
      }
      handleMessage(msg);
    });
    function handleMessage(msg: PokerServerMessage) {
      switch (msg.type) {
        case "poker-welcome":
          selfIdRef.current = msg.selfId;
          setChat(msg.chat);
          setGold(msg.gold);
          setTable(msg.table);
          setState(msg.state);
          break;
        case "poker-state":
          setState(msg.state);
          setErrorMsg(null);
          break;
        case "gold-update":
          setGold(msg.gold);
          break;
        case "poker-error":
          setErrorMsg(msg.message);
          break;
        case "chat":
          setChat((prev) => [...prev.slice(-29), msg.message]);
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
    (msg: PokerClientMessage | { type: "chat"; text: string }) => {
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

  const selfSeat = useMemo(() => {
    if (!state || !selfIdRef.current) return null;
    return state.seats.find((s) => s.playerId === selfIdRef.current) ?? null;
  }, [state]);

  const sit = useCallback(
    (seatIndex: number, buyin: number) =>
      send({ type: "poker-sit", seatIndex, buyin }),
    [send],
  );
  const leave = useCallback(() => send({ type: "poker-leave" }), [send]);
  const fold = useCallback(
    () => send({ type: "poker-action", action: "fold" }),
    [send],
  );
  const check = useCallback(
    () => send({ type: "poker-action", action: "check" }),
    [send],
  );
  const call = useCallback(
    () => send({ type: "poker-action", action: "call" }),
    [send],
  );
  const allIn = useCallback(
    () => send({ type: "poker-action", action: "all-in" }),
    [send],
  );
  const betOrRaise = useCallback(
    (amount: number) => send({ type: "poker-bet", amount }),
    [send],
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/casino/poker"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Lobby
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${table.accent}`}>{table.name}</span>
          <span className="text-xs text-zinc-500">
            SB {table.smallBlind} / BB {table.bigBlind}
          </span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <StatusIndicator status={status} />
          {profile ? (
            <UserPill profile={{ ...profile, gold }} variant="play" />
          ) : null}
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex flex-1 flex-col items-center justify-center overflow-auto bg-[radial-gradient(ellipse_at_center,rgba(15,118,110,0.18),transparent_70%)] p-4">
          {status !== "connected" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="text-sm text-zinc-300">
                {status === "connecting"
                  ? "Connexion à la table..."
                  : "Connexion perdue — recharger la page."}
              </div>
            </div>
          )}
          {state && (
            <PokerTable
              state={state}
              table={table}
              selfId={selfIdRef.current}
              selfSeat={selfSeat}
              gold={gold}
              onSit={sit}
              onLeave={leave}
              onFold={fold}
              onCheck={check}
              onCall={call}
              onAllIn={allIn}
              onBet={betOrRaise}
              profile={profile}
              errorMsg={errorMsg}
            />
          )}
        </main>
        <ChatPanel
          channels={buildChannels({
            proximity: {
              label: "Cette table",
              messages: chat,
              onSend: sendRawChat,
              enabled: status === "connected",
            },
            zone: {
              label: "Casino",
              messages: zoneChat.messages,
              onSend: zoneChat.send,
              enabled: zoneChat.status === "connected",
            },
            globalMessages: globalChat.messages,
            globalOnSend: globalChat.send,
            globalEnabled: globalChat.status === "connected",
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

// ─── Table layout ──────────────────────────────────────────────────────────

function PokerTable({
  state,
  table,
  selfSeat,
  gold,
  onSit,
  onLeave,
  onFold,
  onCheck,
  onCall,
  onAllIn,
  onBet,
  profile,
  errorMsg,
  selfId: _selfId,
}: {
  state: PokerState;
  table: PokerTableConfig;
  selfId: string | null;
  selfSeat: PokerSeat | null;
  gold: number;
  onSit: (seatIndex: number, buyin: number) => void;
  onLeave: () => void;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onAllIn: () => void;
  onBet: (amount: number) => void;
  profile: Profile | null;
  errorMsg: string | null;
}) {
  const totalPot = state.pots.reduce((s, p) => s + p.amount, 0);
  const liveBets = state.seats.reduce((s, x) => s + x.currentBet, 0);
  const displayedPot = totalPot + liveBets;
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-4">
      <PhaseBanner state={state} />

      <div className="relative w-full">
        <Felt seats={state.seats.length}>
          <CommunityCards community={state.community} />
          <div className="mt-2 text-center">
            <div className="text-[10px] uppercase tracking-widest text-emerald-200/70">
              Pot
            </div>
            <div className="text-xl font-semibold tabular-nums text-amber-300">
              {displayedPot.toLocaleString("fr-FR")}
            </div>
            {state.lastActionLabel && (
              <div className="mt-1 text-[11px] text-emerald-100/80">
                {state.lastActionLabel}
              </div>
            )}
          </div>
        </Felt>
        <SeatRing
          state={state}
          selfSeat={selfSeat}
          gold={gold}
          onSit={onSit}
          profile={profile}
          minBuyin={table.buyinMin}
          maxBuyin={table.buyinMax}
        />
      </div>

      {selfSeat ? (
        <ActionBar
          state={state}
          selfSeat={selfSeat}
          onFold={onFold}
          onCheck={onCheck}
          onCall={onCall}
          onAllIn={onAllIn}
          onBet={onBet}
          onLeave={onLeave}
          tableMinBet={table.bigBlind}
        />
      ) : (
        <div className="text-xs text-zinc-500">
          Clique un siège libre pour t&apos;asseoir.
        </div>
      )}

      {errorMsg && <div className="text-xs text-rose-400">{errorMsg}</div>}
    </div>
  );
}

function PhaseBanner({ state }: { state: PokerState }) {
  const label = phaseLabel(state.phase);
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-4 py-1.5 text-xs uppercase tracking-widest text-zinc-200 backdrop-blur-sm">
      <span>{label}</span>
      {state.phaseEndsAt &&
        (state.phase === "preflop" ||
          state.phase === "flop" ||
          state.phase === "turn" ||
          state.phase === "river") && (
          <Countdown
            endsAt={state.phaseEndsAt}
            className="rounded-full bg-amber-300/20 px-2 py-0.5 text-[10px] tabular-nums text-amber-200"
          />
        )}
    </div>
  );
}

function phaseLabel(phase: PokerState["phase"]): string {
  switch (phase) {
    case "waiting":
      return "en attente de joueurs";
    case "preflop":
      return "pré-flop";
    case "flop":
      return "flop";
    case "turn":
      return "turn";
    case "river":
      return "river";
    case "showdown":
      return "showdown";
    case "settling":
      return "fin de coup";
  }
}

function Felt({
  children,
  seats,
}: {
  children: React.ReactNode;
  seats: number;
}) {
  void seats;
  return (
    <div className="mx-auto flex aspect-[2.2/1] w-full items-center justify-center rounded-full border border-emerald-700/50 bg-gradient-to-b from-emerald-900/70 via-emerald-950/80 to-black/80 p-6 shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]">
      <div className="flex flex-col items-center gap-2">{children}</div>
    </div>
  );
}

function CommunityCards({ community }: { community: Card[] }) {
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <CardFace key={i} card={community[i]} />
      ))}
    </div>
  );
}

// Seats arranged on an ellipse around the felt. Indices are positions
// relative to the seat array; index 0 is at the bottom (player viewpoint).
function SeatRing({
  state,
  selfSeat,
  gold,
  onSit,
  profile,
  minBuyin,
  maxBuyin,
}: {
  state: PokerState;
  selfSeat: PokerSeat | null;
  gold: number;
  onSit: (seatIndex: number, buyin: number) => void;
  profile: Profile | null;
  minBuyin: number;
  maxBuyin: number;
}) {
  const positions = useMemo(() => {
    const n = state.seats.length;
    return Array.from({ length: n }, (_, i) => {
      // Start at bottom (90°) and go clockwise.
      const angle = Math.PI / 2 + (i * 2 * Math.PI) / n;
      const cx = 50 + 50 * Math.cos(angle);
      const cy = 50 + 38 * Math.sin(angle); // ellipse: shorter on Y
      return { left: `${cx}%`, top: `${cy}%` };
    });
  }, [state.seats.length]);
  return (
    <div className="pointer-events-none absolute inset-0">
      {state.seats.map((seat, i) => (
        <div
          key={seat.seatIndex}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
          style={positions[i]}
        >
          <SeatView
            seat={seat}
            isSelf={!!selfSeat && selfSeat.seatIndex === seat.seatIndex}
            isActive={state.activeSeatIndex === seat.seatIndex}
            isDealer={state.dealerSeatIndex === seat.seatIndex}
            phase={state.phase}
            gold={gold}
            onSit={onSit}
            canSit={!!profile && !selfSeat}
            minBuyin={minBuyin}
            maxBuyin={maxBuyin}
          />
        </div>
      ))}
    </div>
  );
}

function SeatView({
  seat,
  isSelf,
  isActive,
  isDealer,
  phase,
  gold,
  onSit,
  canSit,
  minBuyin,
  maxBuyin,
}: {
  seat: PokerSeat;
  isSelf: boolean;
  isActive: boolean;
  isDealer: boolean;
  phase: PokerState["phase"];
  gold: number;
  onSit: (seatIndex: number, buyin: number) => void;
  canSit: boolean;
  minBuyin: number;
  maxBuyin: number;
}) {
  const empty = seat.status === "empty";
  if (empty) {
    return (
      <SitDownPrompt
        seatIndex={seat.seatIndex}
        gold={gold}
        canSit={canSit}
        minBuyin={minBuyin}
        maxBuyin={maxBuyin}
        onSit={onSit}
      />
    );
  }
  const dimmed = seat.status === "folded" || seat.status === "sitout";
  return (
    <div
      className={`relative flex flex-col items-center gap-1 ${
        dimmed ? "opacity-40" : ""
      }`}
    >
      {isDealer && (
        <span className="absolute -top-2 -right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-amber-300 text-[10px] font-bold text-amber-900 shadow">
          D
        </span>
      )}
      <div
        className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-2 backdrop-blur-sm transition-colors ${
          isActive
            ? "border-amber-300 bg-black/80 shadow-[0_0_20px_rgba(252,211,77,0.45)]"
            : "border-white/10 bg-black/60"
        } ${isSelf ? "ring-2 ring-emerald-400/60" : ""}`}
        style={{ minWidth: 110 }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: seat.playerColor ?? "#999" }}
          />
          <span className="max-w-[80px] truncate text-xs font-semibold text-zinc-100">
            {seat.playerName}
          </span>
        </div>
        <div className="text-[10px] tabular-nums text-amber-300">
          {seat.chips.toLocaleString("fr-FR")} OS
        </div>
        <div className="flex gap-0.5">
          {[0, 1].map((i) => {
            const card = seat.holeCards[i];
            // If we don't have the card data but the seat is in the
            // hand, render a face-down card.
            const inHand =
              seat.status === "playing" || seat.status === "all-in";
            if (!card && !inHand) {
              return <span key={i} className="h-9 w-7" />;
            }
            return (
              <CardFace
                key={i}
                card={card}
                hidden={!card && inHand}
                small
              />
            );
          })}
        </div>
        {seat.currentBet > 0 && (
          <div className="text-[10px] font-semibold tabular-nums text-rose-300">
            mise {seat.currentBet.toLocaleString("fr-FR")}
          </div>
        )}
        {seat.showdownHand &&
          (phase === "showdown" || phase === "settling") && (
            <div className="text-[10px] uppercase tracking-widest text-emerald-300">
              {seat.showdownHand.rankName}
            </div>
          )}
        {seat.status === "all-in" && (
          <div className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[9px] uppercase tracking-widest text-rose-200">
            All-in
          </div>
        )}
        {seat.status === "folded" && (
          <div className="text-[9px] uppercase tracking-widest text-zinc-500">
            Couché
          </div>
        )}
      </div>
    </div>
  );
}

function SitDownPrompt({
  seatIndex,
  gold,
  canSit,
  minBuyin,
  maxBuyin,
  onSit,
}: {
  seatIndex: number;
  gold: number;
  canSit: boolean;
  minBuyin: number;
  maxBuyin: number;
  onSit: (seatIndex: number, buyin: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(String(minBuyin));
  const parsed = Math.floor(Number(draft));
  const valid =
    Number.isFinite(parsed) &&
    parsed >= minBuyin &&
    parsed <= Math.min(maxBuyin, gold);

  if (!canSit) {
    return (
      <button
        disabled
        className="rounded-full border border-dashed border-white/10 bg-black/30 px-3 py-1 text-[10px] text-zinc-500"
      >
        Place libre
      </button>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-emerald-400/40 bg-black/40 px-3 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-400/10"
      >
        S&apos;asseoir
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSit(seatIndex, parsed);
        setOpen(false);
      }}
      className="flex flex-col items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-black/80 p-2"
    >
      <div className="text-[10px] text-zinc-400">
        Buy-in {minBuyin.toLocaleString("fr-FR")}–
        {maxBuyin.toLocaleString("fr-FR")}
      </div>
      <input
        autoFocus
        type="number"
        min={minBuyin}
        max={Math.min(maxBuyin, gold)}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        className="w-24 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-right text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
      />
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={!valid}
          className="rounded-md bg-emerald-500 px-2 py-1 text-[10px] font-bold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Asseoir
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-200 hover:bg-white/10"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function ActionBar({
  state,
  selfSeat,
  onFold,
  onCheck,
  onCall,
  onAllIn,
  onBet,
  onLeave,
  tableMinBet,
}: {
  state: PokerState;
  selfSeat: PokerSeat;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onAllIn: () => void;
  onBet: (amount: number) => void;
  onLeave: () => void;
  tableMinBet: number;
}) {
  const myTurn = state.activeSeatIndex === selfSeat.seatIndex;
  const toCall = Math.max(0, state.highBet - selfSeat.currentBet);
  const canCheck = toCall === 0;
  const canCall = toCall > 0 && selfSeat.chips >= toCall;
  const canBet = selfSeat.status === "playing" && selfSeat.chips > 0;
  const minBet =
    state.highBet === 0
      ? Math.max(tableMinBet, selfSeat.currentBet + tableMinBet)
      : state.highBet + state.minRaise;
  const maxBet = selfSeat.currentBet + selfSeat.chips;
  const [betDraft, setBetDraft] = useState<string>(String(minBet));

  useEffect(() => {
    setBetDraft(String(Math.min(maxBet, Math.max(minBet, Number(betDraft) || minBet))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minBet, maxBet]);

  const parsedBet = Math.floor(Number(betDraft));
  const betValid =
    canBet &&
    Number.isFinite(parsedBet) &&
    parsedBet >= minBet &&
    parsedBet <= maxBet;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-2 rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-400">
        <span>
          Place #{selfSeat.seatIndex + 1} ·{" "}
          <span className="text-amber-300 normal-case tracking-normal">
            {selfSeat.chips.toLocaleString("fr-FR")} OS jetons
          </span>
        </span>
        <button
          onClick={onLeave}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] normal-case tracking-normal text-zinc-300 hover:bg-white/10"
        >
          Quitter (cash out)
        </button>
      </div>

      {myTurn && selfSeat.status === "playing" ? (
        <div className="flex flex-wrap items-end gap-2">
          <button
            onClick={onFold}
            className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-600"
          >
            Fold
          </button>
          {canCheck ? (
            <button
              onClick={onCheck}
              className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              Check
            </button>
          ) : (
            <button
              onClick={onCall}
              disabled={!canCall && selfSeat.chips > 0}
              className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Suivre {toCall.toLocaleString("fr-FR")}
            </button>
          )}
          {canBet && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={Math.min(minBet, maxBet)}
                max={maxBet}
                step={1}
                value={betDraft}
                onChange={(e) =>
                  setBetDraft(e.target.value.replace(/[^0-9]/g, ""))
                }
                className="w-24 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <button
                type="button"
                onClick={() => betValid && onBet(parsedBet)}
                disabled={!betValid}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {state.highBet === 0 ? "Mise" : "Relance"}
              </button>
            </div>
          )}
          <button
            onClick={onAllIn}
            disabled={!canBet}
            className="rounded-md bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            All-in
          </button>
        </div>
      ) : (
        <div className="text-xs text-zinc-400">
          {selfSeat.status === "folded"
            ? "Tu t'es couché — attends la prochaine main."
            : selfSeat.status === "all-in"
              ? "All-in — la main se déroule."
              : selfSeat.status === "sitting"
                ? "En attente de la prochaine main."
                : "En attente du tour des autres joueurs..."}
        </div>
      )}
    </div>
  );
}

// ─── Card visuals ──────────────────────────────────────────────────────────

const SUIT_GLYPH: Record<string, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};
const RED_SUITS = new Set(["H", "D"]);

function CardFace({
  card,
  hidden,
  small,
}: {
  card?: Card;
  hidden?: boolean;
  small?: boolean;
}) {
  const w = small ? 28 : 44;
  const h = small ? 40 : 64;
  if (hidden) {
    return (
      <div
        className="rounded-md border border-indigo-400/40 bg-gradient-to-br from-indigo-700 to-indigo-950 shadow"
        style={{ width: w, height: h }}
      />
    );
  }
  if (!card) {
    return (
      <div
        className="rounded-md border border-dashed border-white/10 bg-black/30"
        style={{ width: w, height: h }}
      />
    );
  }
  const isRed = RED_SUITS.has(card.suit);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-between rounded-md border bg-white py-0.5 shadow ${
        isRed ? "text-rose-600" : "text-zinc-900"
      } border-zinc-300`}
      style={{ width: w, height: h }}
    >
      <span
        className="self-start pl-1 leading-none"
        style={{ fontSize: small ? 10 : 13, fontWeight: 700 }}
      >
        {card.rank}
      </span>
      <span style={{ fontSize: small ? 14 : 22, lineHeight: 1 }}>
        {SUIT_GLYPH[card.suit] ?? "?"}
      </span>
      <span
        className="self-end pr-1 leading-none"
        style={{
          fontSize: small ? 10 : 13,
          fontWeight: 700,
          transform: "rotate(180deg)",
        }}
      >
        {card.rank}
      </span>
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

// Suppress unused import warnings.
void AnimatePresence;
