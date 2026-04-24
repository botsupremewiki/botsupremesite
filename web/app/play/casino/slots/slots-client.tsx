"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  ChatMessage,
  SlotsClientMessage,
  SlotsServerMessage,
  SlotsSpin,
  SlotsSymbol,
} from "@shared/types";
import { SLOTS_CONFIG } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { ChatPanel } from "@/app/play/chat-panel";
import { buildChannels } from "@/app/play/area-client";
import { useAuxChat } from "@/app/play/use-aux-chat";
import { useDmHub } from "@/app/play/use-dm-hub";
import { DmView } from "@/app/play/dm-view";

type ConnStatus = "connecting" | "connected" | "disconnected";

const SYMBOL_GLYPH: Record<SlotsSymbol, string> = {
  cherry: "🍒",
  lemon: "🍋",
  orange: "🍊",
  grape: "🍇",
  bell: "🔔",
  clover: "🍀",
  seven: "7️⃣",
  diamond: "💎",
};

const ALL_SYMBOLS: SlotsSymbol[] = [
  "cherry",
  "lemon",
  "orange",
  "grape",
  "bell",
  "clover",
  "seven",
  "diamond",
];

const PAYTABLE: { symbol: SlotsSymbol; label: string; payout: number }[] = [
  { symbol: "diamond", label: "× 3", payout: 1600 },
  { symbol: "seven", label: "× 3", payout: 500 },
  { symbol: "clover", label: "× 3", payout: 180 },
  { symbol: "bell", label: "× 3", payout: 55 },
  { symbol: "grape", label: "× 3", payout: 30 },
  { symbol: "orange", label: "× 3", payout: 16 },
  { symbol: "lemon", label: "× 3", payout: 11 },
  { symbol: "cherry", label: "× 3", payout: 10 },
];

export function SlotsClient({ profile }: { profile: Profile | null }) {
  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [gold, setGold] = useState<number>(profile?.gold ?? 1000);
  const [betDraft, setBetDraft] = useState<string>("10");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<SlotsSpin[]>([]);

  // Animation state.
  // Each reel has a "locked" symbol or null (still spinning).
  const [reels, setReels] = useState<(SlotsSymbol | null)[]>([
    "cherry",
    "lemon",
    "orange",
  ]);
  const [pendingResult, setPendingResult] = useState<SlotsSpin | null>(null);
  const [resolvedSpin, setResolvedSpin] = useState<SlotsSpin | null>(null);
  const tickerRef = useRef<number | null>(null);
  const lockTimeoutsRef = useRef<number[]>([]);

  const isSpinning = pendingResult !== null;

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
    const url = `${scheme}://${partyHost}/parties/slots/lobby${
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
          break;
        case "slots-result":
          startSpinAnimation(msg.spin);
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
  }, [profile]);

  // Cleanup any pending timers on unmount.
  useEffect(() => {
    return () => {
      if (tickerRef.current !== null) window.clearInterval(tickerRef.current);
      for (const t of lockTimeoutsRef.current) window.clearTimeout(t);
    };
  }, []);

  const startSpinAnimation = useCallback((spin: SlotsSpin) => {
    setErrorMsg(null);
    setResolvedSpin(null);
    setPendingResult(spin);
    setReels([null, null, null]);

    // Spin ticker — fast cycle of random symbols on every reel that hasn't locked yet.
    if (tickerRef.current !== null) window.clearInterval(tickerRef.current);
    tickerRef.current = window.setInterval(() => {
      setReels((prev) =>
        prev.map((sym) =>
          sym === null
            ? ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)]
            : sym,
        ),
      );
    }, 70);

    // Schedule each reel's lock.
    for (const t of lockTimeoutsRef.current) window.clearTimeout(t);
    lockTimeoutsRef.current = [];
    const lockTimes = [
      SLOTS_CONFIG.spinDurationMs - SLOTS_CONFIG.reelStaggerMs * 2,
      SLOTS_CONFIG.spinDurationMs - SLOTS_CONFIG.reelStaggerMs,
      SLOTS_CONFIG.spinDurationMs,
    ];
    for (let i = 0; i < spin.reels.length; i++) {
      const idx = i;
      const t = window.setTimeout(() => {
        setReels((prev) => {
          const next = [...prev];
          next[idx] = spin.reels[idx];
          return next;
        });
        if (idx === spin.reels.length - 1) {
          if (tickerRef.current !== null) {
            window.clearInterval(tickerRef.current);
            tickerRef.current = null;
          }
          setPendingResult(null);
          setResolvedSpin(spin);
          setHistory((prev) =>
            [spin, ...prev].slice(0, SLOTS_CONFIG.historySize),
          );
        }
      }, lockTimes[idx]);
      lockTimeoutsRef.current.push(t);
    }
  }, []);

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
      if (!betValid || isSpinning) return;
      setErrorMsg(null);
      send({ type: "slots-spin", bet: parsedBet });
    },
    [betValid, isSpinning, parsedBet, send],
  );

  const setPreset = (v: number) =>
    setBetDraft(String(Math.max(SLOTS_CONFIG.minBet, Math.floor(v))));

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
          <span className="font-medium">Slots</span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <StatusIndicator status={status} />
          {profile ? (
            <UserPill profile={{ ...profile, gold }} variant="play" />
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex flex-1 flex-col items-center overflow-auto bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.08),transparent_60%)] p-6">
          {status !== "connected" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="text-sm text-zinc-300">
                {status === "connecting"
                  ? "Démarrage des Slots..."
                  : "Connexion perdue — recharger la page."}
              </div>
            </div>
          )}

          <div className="flex w-full max-w-2xl flex-col items-center gap-6">
            <SlotMachine
              reels={reels}
              isSpinning={isSpinning}
              resolved={resolvedSpin}
            />

            <BetControls
              gold={gold}
              betDraft={betDraft}
              setBetDraft={setBetDraft}
              setPreset={setPreset}
              betValid={betValid}
              parsedBet={parsedBet}
              isSpinning={isSpinning}
              onSpin={spin}
              profile={profile}
              errorMsg={errorMsg}
            />

            <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
              <Paytable />
              <History history={history} />
            </div>
          </div>
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

function SlotMachine({
  reels,
  isSpinning,
  resolved,
}: {
  reels: (SlotsSymbol | null)[];
  isSpinning: boolean;
  resolved: SlotsSpin | null;
}) {
  const winning = !!resolved && resolved.win > 0;
  return (
    <div className="relative flex flex-col items-center gap-3">
      <div
        className={`relative rounded-2xl border-2 ${
          winning
            ? "border-amber-400/70 shadow-[0_0_40px_rgba(251,191,36,0.4)]"
            : "border-violet-500/30 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
        } bg-gradient-to-b from-zinc-900 via-black to-zinc-950 px-5 py-4 transition-all`}
      >
        <div className="flex gap-3">
          {reels.map((sym, i) => (
            <Reel key={i} symbol={sym} highlight={winning} />
          ))}
        </div>
        {/* payline indicator */}
        <div className="pointer-events-none absolute inset-x-5 top-1/2 -translate-y-1/2 border-t border-dashed border-amber-400/30" />
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
                ? resolved.win >= resolved.bet * 50
                  ? "bg-amber-400/20 text-amber-200"
                  : "bg-emerald-500/20 text-emerald-300"
                : "bg-zinc-800/60 text-zinc-400"
            }`}
          >
            {resolved.win > 0
              ? `Gain ${resolved.win.toLocaleString("fr-FR")} OS (×${resolved.multiplier})`
              : `Pas de gain`}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Reel({
  symbol,
  highlight,
}: {
  symbol: SlotsSymbol | null;
  highlight: boolean;
}) {
  return (
    <div
      className={`relative flex h-28 w-24 items-center justify-center overflow-hidden rounded-lg border ${
        highlight
          ? "border-amber-400/60 bg-amber-500/10"
          : "border-white/10 bg-zinc-950/80"
      }`}
    >
      <motion.div
        key={symbol ?? "spin"}
        initial={
          symbol === null
            ? { y: -30, opacity: 0.7 }
            : { y: 24, opacity: 0, scale: 0.9 }
        }
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{
          duration: symbol === null ? 0.07 : 0.18,
          ease: symbol === null ? "linear" : [0.2, 0.8, 0.2, 1],
        }}
        className="text-5xl select-none"
      >
        {symbol ? SYMBOL_GLYPH[symbol] : SYMBOL_GLYPH.cherry}
      </motion.div>
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
  onSpin,
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
  onSpin: (e?: FormEvent) => void;
  profile: Profile | null;
  errorMsg: string | null;
}) {
  return (
    <form
      onSubmit={onSpin}
      className="flex w-full max-w-md flex-col gap-2 rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm"
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
          disabled={isSpinning}
          className="w-32 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-40"
          placeholder={String(SLOTS_CONFIG.minBet)}
        />
        <button
          type="button"
          disabled={isSpinning}
          onClick={() => setPreset(parsedBet / 2)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40"
        >
          ½
        </button>
        <button
          type="button"
          disabled={isSpinning}
          onClick={() => setPreset(Math.max(parsedBet, 1) * 2)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40"
        >
          ×2
        </button>
        <button
          type="button"
          disabled={isSpinning}
          onClick={() => setPreset(gold)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40"
        >
          Max
        </button>
      </div>
      <button
        type="submit"
        disabled={!betValid || !profile || isSpinning}
        className="mt-1 rounded-md bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {!profile
          ? "Connecte-toi pour jouer"
          : isSpinning
            ? "Ça tourne…"
            : `Spin · ${parsedBet.toLocaleString("fr-FR")} OS`}
      </button>
      {errorMsg && <div className="text-xs text-rose-400">{errorMsg}</div>}
    </form>
  );
}

function Paytable() {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
        Table de paiement
      </div>
      <ul className="space-y-1 text-sm">
        {PAYTABLE.map((row) => (
          <li
            key={row.symbol}
            className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-white/5"
          >
            <span className="flex items-center gap-2">
              <span className="text-2xl">{SYMBOL_GLYPH[row.symbol]}</span>
              <span className="text-xs text-zinc-500">{row.label}</span>
            </span>
            <span className="tabular-nums text-amber-300">
              ×{row.payout}
            </span>
          </li>
        ))}
        <li className="mt-2 flex items-center justify-between border-t border-white/5 pt-2 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span>{SYMBOL_GLYPH.cherry}</span>
            <span>{SYMBOL_GLYPH.cherry}</span>
            <span className="text-zinc-600">·</span>
            <span>2 cerises (gauche)</span>
          </span>
          <span className="tabular-nums text-amber-300">×3</span>
        </li>
        <li className="flex items-center justify-between text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span>{SYMBOL_GLYPH.cherry}</span>
            <span>1 cerise (gauche)</span>
          </span>
          <span className="tabular-nums text-amber-300">×1</span>
        </li>
      </ul>
    </div>
  );
}

function History({ history }: { history: SlotsSpin[] }) {
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
          {history.map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-white/5"
            >
              <span className="flex items-center gap-1 tabular-nums">
                {h.reels.map((s, i) => (
                  <span key={i} className="text-xl">
                    {SYMBOL_GLYPH[s]}
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
          ))}
        </ul>
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
