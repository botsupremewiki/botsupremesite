"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import type {
  ChatMessage,
  MinesClientMessage,
  MinesGameState,
  MinesServerMessage,
} from "@shared/types";
import { MINES_CONFIG } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { ChatPanel } from "@/app/play/chat-panel";
import { buildChannels } from "@/app/play/area-client";
import { useAuxChat } from "@/app/play/use-aux-chat";
import { useDmHub } from "@/app/play/use-dm-hub";
import { DmView } from "@/app/play/dm-view";

type ConnStatus = "connecting" | "connected" | "disconnected";

export function MinesClient({ profile }: { profile: Profile | null }) {
  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [gold, setGold] = useState<number>(profile?.gold ?? 1000);
  const [game, setGame] = useState<MinesGameState | null>(null);
  const [gridSize, setGridSize] = useState<number>(5);
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
    }
    const url = `${scheme}://${partyHost}/parties/mines/lobby${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: MinesServerMessage;
      try {
        msg = JSON.parse(e.data as string) as MinesServerMessage;
      } catch {
        return;
      }
      handleMessage(msg);
    });

    function handleMessage(msg: MinesServerMessage) {
      switch (msg.type) {
        case "mines-welcome":
          selfIdRef.current = msg.selfId;
          setChat(msg.chat);
          setGold(msg.gold);
          setGame(msg.game);
          break;
        case "mines-state":
          setGame(msg.game);
          setErrorMsg(null);
          break;
        case "gold-update":
          setGold(msg.gold);
          break;
        case "mines-error":
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

  const send = useCallback((msg: MinesClientMessage | { type: "chat"; text: string }) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

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
    parsedBet >= MINES_CONFIG.minBet &&
    parsedBet <= Math.min(gold, MINES_CONFIG.maxBet);

  const startGame = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (!betValid) return;
      send({
        type: "mines-start",
        rows: gridSize,
        cols: gridSize,
        bet: parsedBet,
      });
    },
    [betValid, gridSize, parsedBet, send],
  );

  const revealTile = useCallback(
    (index: number) => {
      send({ type: "mines-reveal", index });
    },
    [send],
  );

  const cashOut = useCallback(() => send({ type: "mines-cash-out" }), [send]);

  const setPreset = (v: number) =>
    setBetDraft(String(Math.max(MINES_CONFIG.minBet, Math.floor(v))));

  const inGame = game?.status === "playing";
  const ended = game && (game.status === "busted" || game.status === "cashed");

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
          <span className="font-medium">Mines</span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <StatusIndicator status={status} />
          {profile ? (
            <UserPill profile={{ ...profile, gold }} variant="play" />
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex flex-1 flex-col items-center justify-center overflow-auto bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.06),transparent_60%)] p-6">
          {status !== "connected" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="text-sm text-zinc-300">
                {status === "connecting"
                  ? "Arrivée aux Mines..."
                  : "Connexion perdue — recharger la page."}
              </div>
            </div>
          )}

          {!inGame && !ended && (
            <SetupPanel
              gold={gold}
              gridSize={gridSize}
              setGridSize={setGridSize}
              betDraft={betDraft}
              setBetDraft={setBetDraft}
              setPreset={setPreset}
              betValid={betValid}
              parsedBet={parsedBet}
              errorMsg={errorMsg}
              onStart={startGame}
              profile={profile}
            />
          )}

          {game && (inGame || ended) && (
            <div className="flex flex-col items-center gap-4">
              <GameHud game={game} onCashOut={cashOut} inGame={!!inGame} />
              <MinesGrid game={game} onReveal={revealTile} />
              {ended && (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                      game.status === "cashed"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/20 text-rose-300"
                    }`}
                  >
                    {game.status === "cashed"
                      ? `Tu gagnes ${Math.floor(
                          game.bet * game.multiplier,
                        ).toLocaleString("fr-FR")} OS (×${game.multiplier.toFixed(2)})`
                      : `Boum ! Tu perds ${game.bet.toLocaleString("fr-FR")} OS`}
                  </div>
                  <button
                    onClick={() => setGame(null)}
                    className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                  >
                    Nouvelle partie
                  </button>
                </div>
              )}
            </div>
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

function SetupPanel({
  gold,
  gridSize,
  setGridSize,
  betDraft,
  setBetDraft,
  setPreset,
  betValid,
  parsedBet,
  errorMsg,
  onStart,
  profile,
}: {
  gold: number;
  gridSize: number;
  setGridSize: (v: number) => void;
  betDraft: string;
  setBetDraft: (v: string) => void;
  setPreset: (v: number) => void;
  betValid: boolean;
  parsedBet: number;
  errorMsg: string | null;
  onStart: (e?: FormEvent) => void;
  profile: Profile | null;
}) {
  const sizes = Array.from(
    { length: MINES_CONFIG.maxSize - MINES_CONFIG.minSize + 1 },
    (_, i) => MINES_CONFIG.minSize + i,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-sm"
    >
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Mines</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Choisis la taille de la grille et ta mise. Le nombre de mines est
          tiré au hasard par la maison. Plus tu révèles de cases, plus le
          multiplicateur monte — mais une seule mine et c&apos;est perdu.
        </p>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
          Taille de la grille
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sizes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setGridSize(s)}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                gridSize === s
                  ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-200"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {s}×{s}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={onStart} className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
          <span>Ta mise</span>
          <span className="text-amber-300">
            {gold.toLocaleString("fr-FR")} OS dispo
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={MINES_CONFIG.minBet}
            max={Math.min(gold, MINES_CONFIG.maxBet)}
            step={1}
            value={betDraft}
            onChange={(e) =>
              setBetDraft(e.target.value.replace(/[^0-9]/g, ""))
            }
            className="w-32 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            placeholder={String(MINES_CONFIG.minBet)}
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
          className="mt-2 rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {profile ? "Démarrer la partie" : "Connecte-toi pour jouer"}
        </button>
        {errorMsg && (
          <div className="text-xs text-rose-400">{errorMsg}</div>
        )}
      </form>
    </motion.div>
  );
}

function GameHud({
  game,
  onCashOut,
  inGame,
}: {
  game: MinesGameState;
  onCashOut: () => void;
  inGame: boolean;
}) {
  const hasReveals = game.revealedCount > 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
      <Pill label="Grille" value={`${game.gridRows}×${game.gridCols}`} />
      <Pill label="Mines" value={String(game.minesCount)} accent="rose" />
      <Pill
        label="Mise"
        value={`${game.bet.toLocaleString("fr-FR")} OS`}
        accent="amber"
      />
      <Pill
        label="Multi"
        value={`×${game.multiplier.toFixed(2)}`}
        accent="emerald"
      />
      {inGame && (
        <Pill
          label="Prochain"
          value={`×${game.nextMultiplier.toFixed(2)}`}
          accent="zinc"
        />
      )}
      {inGame && (
        <button
          onClick={onCashOut}
          disabled={!hasReveals}
          className="ml-2 rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cash out {game.potentialPayout.toLocaleString("fr-FR")} OS
        </button>
      )}
    </div>
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

function MinesGrid({
  game,
  onReveal,
}: {
  game: MinesGameState;
  onReveal: (index: number) => void;
}) {
  const tileSize = Math.max(28, Math.min(64, 560 / game.gridCols));
  const gap = Math.max(4, Math.round(tileSize / 10));

  return (
    <div
      className="rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur-sm"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${game.gridCols}, ${tileSize}px)`,
        gap,
      }}
    >
      {game.tiles.map((tile, i) => {
        const isClickable =
          game.status === "playing" && tile === "hidden";
        return (
          <button
            key={i}
            type="button"
            onClick={isClickable ? () => onReveal(i) : undefined}
            disabled={!isClickable}
            className={`flex items-center justify-center rounded-md text-sm font-bold transition-transform ${
              tile === "hidden"
                ? "bg-zinc-800 hover:scale-105 hover:bg-zinc-700"
                : tile === "safe"
                  ? "bg-emerald-500/25 text-emerald-300"
                  : "bg-rose-500/35 text-rose-300"
            }`}
            style={{ width: tileSize, height: tileSize }}
            aria-label={
              tile === "hidden"
                ? "Case cachée"
                : tile === "safe"
                  ? "Case sûre"
                  : "Mine"
            }
          >
            {tile === "safe" && "◆"}
            {tile === "mine" && "✸"}
          </button>
        );
      })}
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
