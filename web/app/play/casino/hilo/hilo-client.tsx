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
  Card,
  ChatMessage,
  HiLoClientMessage,
  HiLoGuess,
  HiLoRound,
  HiLoServerMessage,
  HiLoState,
} from "@shared/types";
import { HILO_CONFIG } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { hasRole } from "@/lib/discord-roles";
import { UserPill } from "@/components/user-pill";
import { ChatPanel } from "@/app/play/chat-panel";
import { buildChannels } from "@/app/play/area-client";
import { useAuxChat } from "@/app/play/use-aux-chat";
import { useDmHub } from "@/app/play/use-dm-hub";
import { DmView } from "@/app/play/dm-view";

type ConnStatus = "connecting" | "connected" | "disconnected";

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RED_SUITS = new Set(["H", "D"]);

export function HiLoClient({ profile }: { profile: Profile | null }) {
  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [gold, setGold] = useState<number>(profile?.gold ?? 0);
  const [betDraft, setBetDraft] = useState<string>("10");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [game, setGame] = useState<HiLoState | null>(null);
  const [history, setHistory] = useState<HiLoRound[]>([]);
  const [lastRound, setLastRound] = useState<HiLoRound | null>(null);

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
    const url = `${scheme}://${partyHost}/parties/hilo/lobby${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: HiLoServerMessage;
      try {
        msg = JSON.parse(e.data as string) as HiLoServerMessage;
      } catch {
        return;
      }
      handleMessage(msg);
    });

    function handleMessage(msg: HiLoServerMessage) {
      switch (msg.type) {
        case "hilo-welcome":
          selfIdRef.current = msg.selfId;
          setChat(msg.chat);
          setGold(msg.gold);
          setHistory(msg.history);
          break;
        case "hilo-state":
          setGame(msg.state);
          setErrorMsg(null);
          break;
        case "hilo-round-end":
          setLastRound(msg.round);
          setHistory((prev) =>
            [msg.round, ...prev].slice(0, HILO_CONFIG.historySize),
          );
          break;
        case "gold-update":
          setGold(msg.gold);
          break;
        case "hilo-error":
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

  const send = useCallback(
    (msg: HiLoClientMessage | { type: "chat"; text: string }) => {
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
    parsedBet >= HILO_CONFIG.minBet &&
    parsedBet <= Math.min(gold, HILO_CONFIG.maxBet);

  const setPreset = (v: number) =>
    setBetDraft(String(Math.max(HILO_CONFIG.minBet, Math.floor(v))));

  const startGame = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (!betValid) return;
      setLastRound(null);
      send({ type: "hilo-start", bet: parsedBet });
    },
    [betValid, parsedBet, send],
  );

  const guess = useCallback(
    (g: HiLoGuess) => send({ type: "hilo-guess", guess: g }),
    [send],
  );

  const setAce = useCallback(
    (value: 1 | 14) => send({ type: "hilo-set-ace", value }),
    [send],
  );

  const cashOut = useCallback(() => send({ type: "hilo-cash-out" }), [send]);

  const inGame = !!game && (game.status === "playing" || game.status === "awaiting-ace");
  const ended = !!game && (game.status === "busted" || game.status === "cashed");

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
          <span className="font-medium">Hi-Lo</span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <StatusIndicator status={status} />
          {profile ? (
            <UserPill profile={{ ...profile, gold }} variant="play" />
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex flex-1 flex-col items-center overflow-auto bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.06),transparent_60%)] p-6">
          {status !== "connected" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="text-sm text-zinc-300">
                {status === "connecting"
                  ? "Démarrage du Hi-Lo..."
                  : "Connexion perdue — recharger la page."}
              </div>
            </div>
          )}

          <div className="flex w-full max-w-2xl flex-col items-center gap-6">
            {!inGame && !ended && (
              <SetupPanel
                gold={gold}
                betDraft={betDraft}
                setBetDraft={setBetDraft}
                setPreset={setPreset}
                betValid={betValid}
                parsedBet={parsedBet}
                onStart={startGame}
                profile={profile}
                errorMsg={errorMsg}
              />
            )}

            {game && (inGame || ended) && (
              <GameView
                game={game}
                onGuess={guess}
                onCashOut={cashOut}
                onSetAce={setAce}
                onRestart={startGame}
                onNewBet={() => {
                  setGame(null);
                  setLastRound(null);
                }}
                ended={ended}
                lastRound={lastRound}
                errorMsg={errorMsg}
              />
            )}

            <History history={history} />
          </div>
        </main>

        <ChatPanel
          channels={buildChannels({
            // Hi-Lo est un jeu solo : pas de proximity.
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
              ? {
                  username: profile.username,
                  isAdmin: profile.is_admin,
                  isBooster: hasRole(profile, "BOOSTER"),
                }
              : undefined
          }
          renderDm={
            profile
              ? () => (
                  <DmView
                    hub={dmHub}
                    selfAuthId={profile.id}
                    selfIsAdmin={profile.is_admin}
                    selfIsBooster={hasRole(profile, "BOOSTER")}
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

function SetupPanel({
  gold,
  betDraft,
  setBetDraft,
  setPreset,
  betValid,
  parsedBet,
  onStart,
  profile,
  errorMsg,
}: {
  gold: number;
  betDraft: string;
  setBetDraft: (v: string) => void;
  setPreset: (v: number) => void;
  betValid: boolean;
  parsedBet: number;
  onStart: (e?: FormEvent) => void;
  profile: Profile | null;
  errorMsg: string | null;
}) {
  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={onStart}
      className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-sm"
    >
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Hi-Lo</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Devine si la prochaine carte est plus haute, plus basse, ou de
          même rang. L&apos;As est joker — tu choisis sa valeur (1 ou 14)
          la première fois qu&apos;il apparaît.
        </p>
      </div>
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
        <span>Mise initiale</span>
        <span className="text-amber-300">
          {gold.toLocaleString("fr-FR")} OS dispo
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={HILO_CONFIG.minBet}
          max={Math.min(gold, HILO_CONFIG.maxBet)}
          step={1}
          value={betDraft}
          onChange={(e) => setBetDraft(e.target.value.replace(/[^0-9]/g, ""))}
          className="w-32 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
          placeholder={String(HILO_CONFIG.minBet)}
        />
        <button
          type="button"
          onClick={() => setPreset(parsedBet / 2)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
        >
          ½
        </button>
        <button
          type="button"
          onClick={() => setPreset(Math.max(parsedBet, 1) * 2)}
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
      <button
        type="submit"
        disabled={!betValid || !profile}
        className="rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {profile ? "Démarrer la partie" : "Connecte-toi pour jouer"}
      </button>
      {errorMsg && <div className="text-xs text-rose-400">{errorMsg}</div>}
    </motion.form>
  );
}

function GameView({
  game,
  onGuess,
  onCashOut,
  onSetAce,
  onRestart,
  onNewBet,
  ended,
  lastRound,
  errorMsg,
}: {
  game: HiLoState;
  onGuess: (g: HiLoGuess) => void;
  onCashOut: () => void;
  onSetAce: (v: 1 | 14) => void;
  onRestart: () => void;
  onNewBet: () => void;
  ended: boolean;
  lastRound: HiLoRound | null;
  errorMsg: string | null;
}) {
  const current = game.history[game.history.length - 1];
  const previous = game.history[game.history.length - 2];
  const awaitingAce = game.status === "awaiting-ace";
  const aceFresh = awaitingAce && current?.rank === "A";

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        <Pill label="Mise" value={`${game.bet.toLocaleString("fr-FR")} OS`} accent="amber" />
        <Pill
          label="Multi"
          value={`×${game.multiplier.toFixed(2)}`}
          accent="emerald"
        />
        <Pill
          label="Cartes"
          value={String(Math.max(0, game.history.length - 1))}
        />
        <Pill
          label="As"
          value={
            game.aceValue === 1
              ? "Bas (1)"
              : game.aceValue === 14
                ? "Haut (14)"
                : "—"
          }
        />
      </div>

      <div className="flex items-end gap-3">
        {previous && <PlayingCard card={previous} dim />}
        <div className="flex flex-col items-center gap-1">
          {previous && (
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Carte courante
            </span>
          )}
          {current && <PlayingCard card={current} highlight={!ended} />}
        </div>
      </div>

      {awaitingAce && (
        <AcePicker
          fresh={aceFresh}
          onPick={onSetAce}
        />
      )}

      {game.status === "playing" && (
        <GuessBar
          payouts={game.payouts}
          onGuess={onGuess}
          onCashOut={onCashOut}
          canCashOut={game.multiplier > 1}
          potential={Math.floor(game.bet * game.multiplier)}
        />
      )}

      {ended && lastRound && (
        <div className="flex flex-col items-center gap-3">
          <div
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              lastRound.outcome === "cashed"
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-rose-500/20 text-rose-300"
            }`}
          >
            {lastRound.outcome === "cashed"
              ? `Encaissé ${lastRound.payout.toLocaleString("fr-FR")} OS (×${lastRound.endingMultiplier.toFixed(2)})`
              : `Bust ! Tu perds ${lastRound.bet.toLocaleString("fr-FR")} OS`}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onRestart}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
            >
              Rejouer même mise
            </button>
            <button
              onClick={onNewBet}
              className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10"
            >
              Changer la mise
            </button>
          </div>
        </div>
      )}

      {errorMsg && <div className="text-xs text-rose-400">{errorMsg}</div>}
    </div>
  );
}

function AcePicker({
  fresh,
  onPick,
}: {
  fresh: boolean;
  onPick: (v: 1 | 14) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3"
    >
      <div className="text-xs uppercase tracking-widest text-amber-200">
        {fresh ? "C'est un As !" : "Le tirage est un As !"}
      </div>
      <div className="text-xs text-zinc-300">
        Choisis sa valeur — verrouillée pour le reste de la partie.
      </div>
      <div className="mt-1 flex gap-2">
        <button
          onClick={() => onPick(1)}
          className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
        >
          As bas (1)
        </button>
        <button
          onClick={() => onPick(14)}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
        >
          As haut (14)
        </button>
      </div>
    </motion.div>
  );
}

function GuessBar({
  payouts,
  onGuess,
  onCashOut,
  canCashOut,
  potential,
}: {
  payouts: { higher: number; lower: number; same: number };
  onGuess: (g: HiLoGuess) => void;
  onCashOut: () => void;
  canCashOut: boolean;
  potential: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-stretch justify-center gap-2">
        <GuessButton
          label="Plus bas"
          mul={payouts.lower}
          onClick={() => onGuess("lower")}
          tone="rose"
        />
        <GuessButton
          label="Même rang"
          mul={payouts.same}
          onClick={() => onGuess("same")}
          tone="violet"
        />
        <GuessButton
          label="Plus haut"
          mul={payouts.higher}
          onClick={() => onGuess("higher")}
          tone="emerald"
        />
      </div>
      <button
        onClick={onCashOut}
        disabled={!canCashOut}
        className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {canCashOut
          ? `Encaisser ${potential.toLocaleString("fr-FR")} OS`
          : "Joue au moins une carte"}
      </button>
    </div>
  );
}

function GuessButton({
  label,
  mul,
  onClick,
  tone,
}: {
  label: string;
  mul: number;
  onClick: () => void;
  tone: "rose" | "violet" | "emerald";
}) {
  const disabled = mul <= 0;
  const palette = {
    rose: "border-rose-400/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200",
    violet:
      "border-violet-400/40 bg-violet-500/15 hover:bg-violet-500/25 text-violet-200",
    emerald:
      "border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-32 flex-col items-center gap-0.5 rounded-lg border px-3 py-3 transition-colors ${palette} disabled:cursor-not-allowed disabled:opacity-30`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="font-mono text-xs opacity-80">
        {disabled ? "—" : `×${mul.toFixed(2)}`}
      </span>
    </button>
  );
}

function PlayingCard({
  card,
  dim,
  highlight,
}: {
  card: Card;
  dim?: boolean;
  highlight?: boolean;
}) {
  const red = RED_SUITS.has(card.suit);
  return (
    <motion.div
      key={`${card.rank}${card.suit}`}
      initial={{ opacity: 0, scale: 0.7, rotateY: 90 }}
      animate={{
        opacity: dim ? 0.45 : 1,
        scale: 1,
        rotateY: 0,
      }}
      transition={{ duration: 0.42, ease: [0.22, 0.85, 0.3, 1.05] }}
      style={{ transformStyle: "preserve-3d", perspective: 600 }}
      className={`flex h-32 w-24 select-none flex-col items-center justify-between rounded-lg border bg-zinc-50 px-2 py-1 shadow-md ${
        highlight
          ? "border-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.35)]"
          : "border-zinc-200"
      } ${red ? "text-rose-600" : "text-zinc-900"}`}
    >
      <span className="self-start text-lg font-bold leading-none tabular-nums">
        {card.rank}
      </span>
      <span className="text-3xl">{SUIT_GLYPH[card.suit] ?? "?"}</span>
      <span className="self-end rotate-180 text-lg font-bold leading-none tabular-nums">
        {card.rank}
      </span>
    </motion.div>
  );
}

function Pill({
  label,
  value,
  accent = "zinc",
}: {
  label: string;
  value: string;
  accent?: "zinc" | "emerald" | "rose" | "amber";
}) {
  const bg = {
    zinc: "bg-zinc-500/10 text-zinc-300",
    emerald: "bg-emerald-500/15 text-emerald-300",
    rose: "bg-rose-500/15 text-rose-300",
    amber: "bg-amber-400/15 text-amber-300",
  }[accent];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${bg}`}
    >
      <span className="opacity-60">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

function History({ history }: { history: HiLoRound[] }) {
  return (
    <div className="w-full rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
        Dernières parties
      </div>
      {history.length === 0 ? (
        <div className="py-3 text-center text-xs text-zinc-500">
          Aucune partie pour l&apos;instant.
        </div>
      ) : (
        <ul className="space-y-1.5 text-sm">
          <AnimatePresence initial={false}>
            {history.map((h) => (
              <motion.li
                key={h.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-white/5"
              >
                <span className="flex items-center gap-1 truncate text-xs text-zinc-300">
                  {h.cards.slice(0, 6).map((c, i) => (
                    <span
                      key={i}
                      className={`tabular-nums ${
                        RED_SUITS.has(c.suit)
                          ? "text-rose-300"
                          : "text-zinc-200"
                      }`}
                    >
                      {c.rank}
                      {SUIT_GLYPH[c.suit]}
                    </span>
                  ))}
                  {h.cards.length > 6 && <span className="text-zinc-500">…</span>}
                </span>
                <span
                  className={`tabular-nums text-xs ${
                    h.outcome === "cashed"
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }`}
                >
                  {h.outcome === "cashed"
                    ? `+${(h.payout - h.bet).toLocaleString("fr-FR")}`
                    : `-${h.bet.toLocaleString("fr-FR")}`}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
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
