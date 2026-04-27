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
  ChatMessage,
  SlotMachineConfig,
  SlotMachineId,
  SlotsAutospinState,
  SlotsClientMessage,
  SlotsServerMessage,
  SlotsSpin,
  SlotsSymbolKey,
} from "@shared/types";
import { SLOTS_CONFIG, SLOT_MACHINES } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { ChatPanel } from "@/app/play/chat-panel";
import { buildChannels } from "@/app/play/area-client";
import { useAuxChat } from "@/app/play/use-aux-chat";
import { useDmHub } from "@/app/play/use-dm-hub";
import { DmView } from "@/app/play/dm-view";

type ConnStatus = "connecting" | "connected" | "disconnected";

const BIG_WIN_MULTIPLIER = 25;

export function SlotsClient({
  profile,
  machineId,
}: {
  profile: Profile | null;
  machineId: SlotMachineId;
}) {
  // The server is the source of truth for the machine config (so we
  // don't accidentally desync paytables). Until the welcome message
  // arrives we render with the static fallback so the page isn't empty.
  const fallback = SLOT_MACHINES[machineId];
  const [machine, setMachine] = useState<SlotMachineConfig>(fallback);
  const allSymbolKeys = useMemo(
    () => machine.symbols.map((s) => s.key),
    [machine],
  );
  const symbolGlyph = useCallback(
    (key: SlotsSymbolKey) =>
      machine.symbols.find((s) => s.key === key)?.glyph ?? "?",
    [machine],
  );

  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [gold, setGold] = useState<number>(profile?.gold ?? 0);
  const [betDraft, setBetDraft] = useState<string>("10");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<SlotsSpin[]>([]);
  const [autospin, setAutospin] = useState<SlotsAutospinState | null>(null);
  const [stopOnBigWin, setStopOnBigWin] = useState<boolean>(true);

  // Reel animation state.
  // Each reel is in one of two phases:
  //   • idle    → renders the symbols from `targetGrid[c]` directly
  //   • spinning → translates a strip of random symbols ending with the
  //                target column. The strip is regenerated every spin via
  //                `spinId` (the framer-motion key resets the animation).
  const initialGrid = useMemo<SlotsSymbolKey[][]>(
    () =>
      Array.from({ length: machine.cols }, () =>
        Array.from({ length: machine.rows }, () => machine.symbols[0].key),
      ),
    [machine],
  );
  const [targetGrid, setTargetGrid] =
    useState<SlotsSymbolKey[][]>(initialGrid);
  const [spinId, setSpinId] = useState(0);
  const [reelDurations, setReelDurations] = useState<number[]>([]);
  const [pendingSpin, setPendingSpin] = useState<SlotsSpin | null>(null);
  const [resolvedSpin, setResolvedSpin] = useState<SlotsSpin | null>(null);
  const finishTimerRef = useRef<number | null>(null);

  // Reset the grid when the machine config changes (e.g. welcome arrived
  // with a different shape than the static fallback we started with).
  useEffect(() => {
    setTargetGrid(initialGrid);
  }, [initialGrid]);

  const isSpinning = pendingSpin !== null;
  const inAutospin = !!autospin;

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
    const url = `${scheme}://${partyHost}/parties/slots/${machineId}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: SlotsServerMessage;
      try {
        msg = JSON.parse(e.data as string) as SlotsServerMessage;
      } catch {
        return;
      }
      handleMessage(msg);
    });

    function handleMessage(msg: SlotsServerMessage) {
      switch (msg.type) {
        case "slots-welcome":
          selfIdRef.current = msg.selfId;
          setChat(msg.chat);
          setGold(msg.gold);
          setHistory(msg.history);
          setMachine(msg.machine);
          setAutospin(msg.autospin);
          break;
        case "slots-result":
          setAutospin(msg.autospin);
          startSpinAnimation(msg.spin, !!msg.autospin);
          break;
        case "slots-autospin-state":
          setAutospin(msg.autospin);
          break;
        case "gold-update":
          setGold(msg.gold);
          break;
        case "slots-error":
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
  }, [profile, machineId]);

  useEffect(() => {
    return () => {
      if (finishTimerRef.current !== null)
        window.clearTimeout(finishTimerRef.current);
    };
  }, []);

  const startSpinAnimation = useCallback(
    (spin: SlotsSpin, fastMode: boolean) => {
      setErrorMsg(null);
      setResolvedSpin(null);
      setPendingSpin(spin);
      setTargetGrid(spin.grid);

      const total = fastMode
        ? SLOTS_CONFIG.autoSpinDurationMs
        : SLOTS_CONFIG.spinDurationMs;
      const stagger = fastMode
        ? SLOTS_CONFIG.autoSpinReelStaggerMs
        : SLOTS_CONFIG.reelStaggerMs;
      const reelCount = spin.grid.length;
      // Each reel decelerates over its own duration; reel 0 stops first,
      // last reel stops at `total`. Identical average linear speed across
      // reels means longer reels just spin past more symbols before
      // landing — no visual mismatch in spin velocity.
      const durations: number[] = [];
      for (let i = 0; i < reelCount; i++) {
        durations.push(total - stagger * (reelCount - 1 - i));
      }
      setReelDurations(durations);
      // New `spinId` = remount the spinning strips so framer-motion
      // restarts each animation from y=0.
      setSpinId((id) => id + 1);

      // Last reel finishes at `total`; clear pending state shortly after
      // so the result chip + history append fire when the bounce settles.
      if (finishTimerRef.current !== null)
        window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = window.setTimeout(() => {
        setPendingSpin(null);
        setResolvedSpin(spin);
        setHistory((prev) =>
          [spin, ...prev].slice(0, SLOTS_CONFIG.historySize),
        );
        finishTimerRef.current = null;
      }, total + 80);
    },
    [],
  );

  const send = useCallback(
    (msg: SlotsClientMessage | { type: "chat"; text: string }) => {
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

  const parsedBet = Math.floor(Number(betDraft));
  const betValid =
    Number.isFinite(parsedBet) &&
    parsedBet >= SLOTS_CONFIG.minBet &&
    parsedBet <= Math.min(gold, SLOTS_CONFIG.maxBet);

  const spin = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (!betValid || isSpinning || inAutospin) return;
      setErrorMsg(null);
      send({ type: "slots-spin", bet: parsedBet });
    },
    [betValid, isSpinning, inAutospin, parsedBet, send],
  );

  const startAutospin = useCallback(
    (count: number) => {
      if (!betValid || isSpinning || inAutospin) return;
      setErrorMsg(null);
      send({
        type: "slots-autospin-start",
        bet: parsedBet,
        count,
        stopOnBigWin,
      });
    },
    [betValid, isSpinning, inAutospin, parsedBet, send, stopOnBigWin],
  );

  const stopAutospin = useCallback(() => {
    send({ type: "slots-autospin-stop" });
  }, [send]);

  const setPreset = (v: number) =>
    setBetDraft(String(Math.max(SLOTS_CONFIG.minBet, Math.floor(v))));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/casino"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Casino
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${machine.theme.accent}`}>
            {machine.name}
          </span>
          <span className="hidden text-xs text-zinc-500 md:inline">
            · {machine.tagline}
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
        <main
          className={`relative flex flex-1 flex-col items-center overflow-auto p-6 ${machine.theme.gradient}`}
        >
          {status !== "connected" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="text-sm text-zinc-300">
                {status === "connecting"
                  ? "Démarrage..."
                  : "Connexion perdue — recharger la page."}
              </div>
            </div>
          )}

          <div className="flex w-full max-w-2xl flex-col items-center gap-5">
            <SlotMachineView
              machine={machine}
              targetGrid={targetGrid}
              spinId={spinId}
              reelDurations={reelDurations}
              isSpinning={isSpinning}
              resolved={resolvedSpin}
              symbolGlyph={symbolGlyph}
              allSymbolKeys={allSymbolKeys}
            />

            <BetControls
              gold={gold}
              betDraft={betDraft}
              setBetDraft={setBetDraft}
              setPreset={setPreset}
              betValid={betValid}
              parsedBet={parsedBet}
              isSpinning={isSpinning}
              inAutospin={inAutospin}
              autospin={autospin}
              stopOnBigWin={stopOnBigWin}
              setStopOnBigWin={setStopOnBigWin}
              onSpin={spin}
              onAutospin={startAutospin}
              onStopAutospin={stopAutospin}
              accentClass={machine.theme.accent}
              profile={profile}
              errorMsg={errorMsg}
            />

            <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
              <Paytable machine={machine} />
              <History history={history} symbolGlyph={symbolGlyph} />
            </div>

            <MachinesNav currentId={machineId} />
          </div>
        </main>

        <ChatPanel
          channels={buildChannels({
            // Slots est un jeu solo : pas de proximity.
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

function SlotMachineView({
  machine,
  targetGrid,
  spinId,
  reelDurations,
  isSpinning,
  resolved,
  symbolGlyph,
  allSymbolKeys,
}: {
  machine: SlotMachineConfig;
  targetGrid: SlotsSymbolKey[][];
  spinId: number;
  reelDurations: number[];
  isSpinning: boolean;
  resolved: SlotsSpin | null;
  symbolGlyph: (key: SlotsSymbolKey) => string;
  allSymbolKeys: SlotsSymbolKey[];
}) {
  const winning = !!resolved && resolved.win > 0;
  const isBigWin = winning && resolved!.multiplier >= BIG_WIN_MULTIPLIER;
  const cellSize = machine.cols >= 5 ? 72 : machine.cols >= 4 ? 84 : 96;

  // Build a "highlight" map: for each (col, row), the count of winning
  // lines hitting that cell, used to glow winning cells.
  const highlightedCells = useMemo(() => {
    const map = new Map<string, number>();
    if (!resolved || isSpinning) return map;
    for (const line of resolved.lines) {
      const payline = machine.paylines[line.paylineIndex];
      if (!payline) continue;
      const reelsToHit = Math.min(line.matchLength, payline.length);
      for (let c = 0; c < reelsToHit; c++) {
        const key = `${c}:${payline[c]}`;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return map;
  }, [resolved, isSpinning, machine.paylines]);

  return (
    <div className="relative flex flex-col items-center gap-3">
      <div
        className={`relative rounded-2xl border-2 px-4 py-4 transition-all ${
          winning
            ? `${machine.theme.border} ${machine.theme.glow}`
            : "border-white/10"
        } bg-gradient-to-b from-zinc-900 via-black to-zinc-950`}
      >
        <div className="flex gap-2">
          {targetGrid.map((col, c) => (
            <Reel
              key={c}
              column={col}
              colIndex={c}
              rows={machine.rows}
              cellSize={cellSize}
              symbolGlyph={symbolGlyph}
              highlightedCells={highlightedCells}
              isSpinning={isSpinning}
              spinId={spinId}
              durationMs={reelDurations[c] ?? 0}
              allSymbolKeys={allSymbolKeys}
            />
          ))}
        </div>
        {isBigWin && (
          <BigWinFlash
            key={resolved!.id}
            multiplier={resolved!.multiplier}
            accentClass={machine.theme.accent}
          />
        )}
      </div>
      <AnimatePresence mode="wait">
        {resolved && !isSpinning && (
          <motion.div
            key={resolved.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              resolved.win > 0
                ? isBigWin
                  ? `bg-amber-400/20 ${machine.theme.accent}`
                  : "bg-emerald-500/20 text-emerald-300"
                : "bg-zinc-800/60 text-zinc-400"
            }`}
          >
            {resolved.win > 0 ? (
              <CountUp
                from={0}
                to={resolved.win}
                durationMs={800}
                prefix="Gain "
                suffix={` OS (×${resolved.multiplier})`}
              />
            ) : (
              "Pas de gain"
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BigWinFlash({
  multiplier,
  accentClass,
}: {
  multiplier: number;
  accentClass: string;
}) {
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: [0.6, 1.1, 1], opacity: [0, 1, 1] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
      className={`pointer-events-none absolute inset-0 flex items-center justify-center text-5xl font-black tracking-widest drop-shadow-[0_0_15px_rgba(0,0,0,0.6)] ${accentClass}`}
    >
      ×{multiplier}
    </motion.div>
  );
}

// Vertical gap between cells (matches the gap-1 = 4px on the static grid).
const REEL_CELL_GAP = 4;

function Reel({
  column,
  colIndex,
  rows,
  cellSize,
  symbolGlyph,
  highlightedCells,
  isSpinning,
  spinId,
  durationMs,
  allSymbolKeys,
}: {
  column: SlotsSymbolKey[];
  colIndex: number;
  rows: number;
  cellSize: number;
  symbolGlyph: (k: SlotsSymbolKey) => string;
  highlightedCells: Map<string, number>;
  isSpinning: boolean;
  spinId: number;
  durationMs: number;
  allSymbolKeys: SlotsSymbolKey[];
}) {
  // Window we look through. Includes the inter-cell gaps between rows.
  const cellPitch = cellSize + REEL_CELL_GAP;
  const windowH = rows * cellPitch - REEL_CELL_GAP;

  // Strip = enough random padding for a fast-spinning blur, then the
  // target column at the very bottom. Strip length scales with the reel
  // duration so each reel keeps the same average linear speed regardless
  // of when it locks (≈ 36 symbols per second, classic slot feel).
  const strip = useMemo(() => {
    if (!isSpinning) return column;
    const symbolsPerSec = 36;
    const padding = Math.max(
      8,
      Math.round((durationMs / 1000) * symbolsPerSec),
    );
    const random: SlotsSymbolKey[] = [];
    for (let i = 0; i < padding; i++) {
      random.push(
        allSymbolKeys[Math.floor(Math.random() * allSymbolKeys.length)],
      );
    }
    return [...random, ...column];
    // `spinId` re-runs the memo every spin so the random padding is fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId, isSpinning, column, allSymbolKeys, durationMs]);

  // Distance the strip must travel so that its last `rows` symbols sit in
  // the visible window. We translate the inner stack by -translateEnd.
  const translateEnd = (strip.length - rows) * cellPitch;

  return (
    <div
      className="overflow-hidden rounded-lg border border-white/10 bg-zinc-950/80 p-1"
      style={{ height: windowH + 8 /* padding */ }}
    >
      <motion.div
        key={isSpinning ? `spin-${spinId}-${colIndex}` : `idle-${colIndex}`}
        className="flex flex-col"
        style={{ gap: REEL_CELL_GAP }}
        initial={isSpinning ? { y: 0 } : false}
        animate={isSpinning ? { y: [0, -translateEnd * 0.85, -translateEnd * 1.012, -translateEnd] } : { y: 0 }}
        transition={
          isSpinning
            ? {
                duration: durationMs / 1000,
                times: [0, 0.7, 0.92, 1],
                ease: ["linear", [0.2, 0.5, 0.2, 1], [0.5, 0, 0.5, 1]],
              }
            : { duration: 0 }
        }
      >
        {strip.map((sym, i) => {
          // Highlight only applies to the resolved (idle) state, where
          // `strip` is exactly the target column — so i === row index.
          const highlighted =
            !isSpinning && highlightedCells.has(`${colIndex}:${i}`);
          return (
            <Cell
              key={i}
              symbol={sym}
              cellSize={cellSize}
              highlighted={highlighted}
              symbolGlyph={symbolGlyph}
            />
          );
        })}
      </motion.div>
    </div>
  );
}

function Cell({
  symbol,
  cellSize,
  highlighted,
  symbolGlyph,
}: {
  symbol: SlotsSymbolKey;
  cellSize: number;
  highlighted: boolean;
  symbolGlyph: (k: SlotsSymbolKey) => string;
}) {
  const fontSize = Math.round(cellSize * 0.7);
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-md ${
        highlighted
          ? "bg-amber-500/25 ring-2 ring-amber-400/60"
          : "bg-zinc-900/60"
      }`}
      style={{ width: cellSize, height: cellSize }}
    >
      <span className="select-none leading-none" style={{ fontSize }}>
        {symbolGlyph(symbol)}
      </span>
    </div>
  );
}

function BetControls({
  gold,
  betDraft,
  setBetDraft,
  setPreset,
  betValid,
  parsedBet,
  isSpinning,
  inAutospin,
  autospin,
  stopOnBigWin,
  setStopOnBigWin,
  onSpin,
  onAutospin,
  onStopAutospin,
  accentClass,
  profile,
  errorMsg,
}: {
  gold: number;
  betDraft: string;
  setBetDraft: (v: string) => void;
  setPreset: (v: number) => void;
  betValid: boolean;
  parsedBet: number;
  isSpinning: boolean;
  inAutospin: boolean;
  autospin: SlotsAutospinState | null;
  stopOnBigWin: boolean;
  setStopOnBigWin: (v: boolean) => void;
  onSpin: (e?: FormEvent) => void;
  onAutospin: (count: number) => void;
  onStopAutospin: () => void;
  accentClass: string;
  profile: Profile | null;
  errorMsg: string | null;
}) {
  return (
    <form
      onSubmit={onSpin}
      className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
        <span>Ta mise</span>
        <span className="text-amber-300">
          {gold.toLocaleString("fr-FR")} OS dispo
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={SLOTS_CONFIG.minBet}
          max={Math.min(gold, SLOTS_CONFIG.maxBet)}
          step={1}
          value={betDraft}
          onChange={(e) => setBetDraft(e.target.value.replace(/[^0-9]/g, ""))}
          disabled={isSpinning || inAutospin}
          className={`w-32 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-300 disabled:opacity-40`}
          placeholder={String(SLOTS_CONFIG.minBet)}
        />
        <button
          type="button"
          disabled={isSpinning || inAutospin}
          onClick={() => setPreset(parsedBet / 2)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40"
        >
          ½
        </button>
        <button
          type="button"
          disabled={isSpinning || inAutospin}
          onClick={() => setPreset(Math.max(parsedBet, 1) * 2)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40"
        >
          ×2
        </button>
        <button
          type="button"
          disabled={isSpinning || inAutospin}
          onClick={() => setPreset(gold)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40"
        >
          Max
        </button>
      </div>

      {!inAutospin && (
        <button
          type="submit"
          disabled={!betValid || !profile || isSpinning}
          className={`mt-1 rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {!profile
            ? "Connecte-toi pour jouer"
            : isSpinning
              ? "Ça tourne…"
              : `Spin · ${parsedBet.toLocaleString("fr-FR")} OS`}
        </button>
      )}

      <div className="rounded-md border border-white/10 bg-white/5 p-2.5">
        <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          <span>Auto-spin</span>
          <label className="flex items-center gap-1 normal-case tracking-normal text-[10px] text-zinc-300">
            <input
              type="checkbox"
              checked={stopOnBigWin}
              onChange={(e) => setStopOnBigWin(e.target.checked)}
              className="h-3 w-3 accent-amber-400"
              disabled={inAutospin}
            />
            Stop si gain ≥ ×{BIG_WIN_MULTIPLIER}
          </label>
        </div>
        {!inAutospin ? (
          <div className="flex flex-wrap gap-1.5">
            {SLOTS_CONFIG.autoSpinChoices.map((c) => (
              <button
                key={c}
                type="button"
                disabled={!betValid || !profile || isSpinning}
                onClick={() => onAutospin(c)}
                className={`flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30`}
              >
                ×{c}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-[11px] tabular-nums">
                <span className={`${accentClass} font-semibold`}>
                  {autospin?.remaining ?? 0} restants
                </span>
                <span className="text-zinc-500">
                  / {autospin?.total ?? 0}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded bg-white/5">
                <div
                  className={`h-full bg-amber-400 transition-[width]`}
                  style={{
                    width: `${
                      autospin
                        ? ((autospin.total - autospin.remaining) /
                            autospin.total) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onStopAutospin}
              className="rounded-md bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-400"
            >
              Stop
            </button>
          </div>
        )}
      </div>
      {errorMsg && <div className="text-xs text-rose-400">{errorMsg}</div>}
    </form>
  );
}

function Paytable({ machine }: { machine: SlotMachineConfig }) {
  const sorted = useMemo(() => {
    return machine.symbols
      .map((s, i) => ({ ...s, payout: machine.payouts3[i] }))
      .sort((a, b) => b.payout - a.payout);
  }, [machine]);

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
        Paiements
      </div>
      <div className="mb-2 text-[10px] text-zinc-500">
        Grille {machine.cols}×{machine.rows} ·{" "}
        {machine.paylines.length} ligne
        {machine.paylines.length > 1 ? "s" : ""}
        {machine.cols >= 5
          ? ` · 4-of-a-kind ×${machine.match4Multiplier}, 5-of-a-kind ×${machine.match5Multiplier}`
          : ""}
      </div>
      <ul className="space-y-1 text-sm">
        {sorted.map((row) => (
          <li
            key={row.key}
            className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-white/5"
          >
            <span className="flex items-center gap-2">
              <span className="text-2xl">{row.glyph}</span>
              <span className="text-xs text-zinc-500">× 3</span>
            </span>
            <span className="tabular-nums text-amber-300">
              ×{row.payout}
            </span>
          </li>
        ))}
        <li className="mt-2 flex items-center justify-between border-t border-white/5 pt-2 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span>{machine.symbols[0].glyph}</span>
            <span>{machine.symbols[0].glyph}</span>
            <span className="text-zinc-600">·</span>
            <span>2 à gauche</span>
          </span>
          <span className="tabular-nums text-amber-300">
            ×{machine.cherryTwo}
          </span>
        </li>
        <li className="flex items-center justify-between text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span>{machine.symbols[0].glyph}</span>
            <span>1 à gauche</span>
          </span>
          <span className="tabular-nums text-amber-300">
            ×{machine.cherryOne}
          </span>
        </li>
      </ul>
    </div>
  );
}

function History({
  history,
  symbolGlyph,
}: {
  history: SlotsSpin[];
  symbolGlyph: (k: SlotsSymbolKey) => string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
        Derniers spins
      </div>
      {history.length === 0 ? (
        <div className="py-3 text-center text-xs text-zinc-500">
          Aucun spin pour l&apos;instant.
        </div>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {history.map((h) => {
            // Show the middle row of each spin's grid as a quick preview.
            const midRow = Math.floor(
              (h.grid[0]?.length ?? 1) / 2,
            );
            const preview = h.grid.map((col) => col[midRow]);
            return (
              <li
                key={h.id}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-white/5"
              >
                <span className="flex items-center gap-1 tabular-nums">
                  {preview.map((s, i) => (
                    <span key={i} className="text-lg">
                      {symbolGlyph(s)}
                    </span>
                  ))}
                </span>
                <span
                  className={`tabular-nums text-xs ${
                    h.win > 0 ? "text-emerald-300" : "text-zinc-500"
                  }`}
                >
                  {h.win > 0
                    ? `+${(h.win - h.bet).toLocaleString("fr-FR")}`
                    : `-${h.bet.toLocaleString("fr-FR")}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MachinesNav({ currentId }: { currentId: SlotMachineId }) {
  return (
    <div className="flex w-full flex-wrap gap-1.5 rounded-xl border border-white/10 bg-black/30 p-3">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Autres machines
      </span>
      {Object.values(SLOT_MACHINES).map((m) => {
        const active = m.id === currentId;
        return (
          <Link
            key={m.id}
            href={`/play/casino/slots/${m.id}`}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? `${m.theme.accent} bg-white/10`
                : "text-zinc-300 hover:bg-white/5"
            }`}
          >
            {m.name}
          </Link>
        );
      })}
    </div>
  );
}

function CountUp({
  from,
  to,
  durationMs,
  prefix = "",
  suffix = "",
}: {
  from: number;
  to: number;
  durationMs: number;
  prefix?: string;
  suffix?: string;
}) {
  const [val, setVal] = useState(from);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, durationMs]);
  return (
    <span className="tabular-nums">
      {prefix}
      {val.toLocaleString("fr-FR")}
      {suffix}
    </span>
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
