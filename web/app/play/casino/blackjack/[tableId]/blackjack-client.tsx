"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  BlackjackSeat,
  BlackjackState,
  Card,
  ChatMessage,
  ClientMessage,
  Direction,
  Player,
  ServerMessage,
} from "@shared/types";
import { BLACKJACK_CONFIG } from "@shared/types";
import type { GameScene, SeatLandmark } from "@/lib/game/scene";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { BLACKJACK_SCENE } from "@/lib/game/configs";
import { ChatPanel } from "@/app/play/chat-panel";
import { buildChannels } from "@/app/play/area-client";
import { useAuxChat } from "@/app/play/use-aux-chat";
import { FitBox } from "@/app/play/fit-box";
import { useDmHub } from "@/app/play/use-dm-hub";
import { DmView } from "@/app/play/dm-view";

type ConnStatus = "connecting" | "connected" | "disconnected";

export function BlackjackClient({
  profile,
  tableId,
}: {
  profile: Profile | null;
  tableId: string;
}) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [blackjack, setBlackjack] = useState<BlackjackState | null>(null);
  const [gold, setGold] = useState<number>(profile?.gold ?? 1000);

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
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let scene: GameScene | null = null;
    let socket: WebSocket | null = null;

    const sendClient = (msg: ClientMessage) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    };

    (async () => {
      const mod = await import("@/lib/game/scene");
      if (cancelled) return;
      scene = new mod.GameScene(BLACKJACK_SCENE);
      await scene.init(host);
      if (cancelled) {
        scene.destroy();
        return;
      }
      sceneRef.current = scene;

      scene.onClickMove = (x, y) => {
        const selfId = selfIdRef.current;
        if (!selfId || !scene) return;
        const self = scene.getPlayerPosition(selfId);
        if (!self) return;
        const dx = x - self.x;
        const dy = y - self.y;
        const direction: Direction =
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? "right"
              : "left"
            : dy > 0
              ? "down"
              : "up";
        scene.updatePlayer(selfId, x, y, direction);
        sendClient({ type: "move", x, y, direction });
      };

      scene.onLandmarkArrival = (landmark) => {
        if (landmark.kind === "portal" && landmark.href) {
          router.push(landmark.href);
        } else if (landmark.kind === "seat") {
          sendClient({
            type: "take-seat",
            seatIndex: (landmark as SeatLandmark).seatIndex,
          });
        }
      };

      if (cancelled) return;

      const partyHost =
        process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999";

      const params = new URLSearchParams();
      if (profile) {
        params.set("authId", profile.id);
        params.set("name", profile.username);
        params.set("gold", String(profile.gold));
        if (profile.avatar_url) params.set("avatarUrl", profile.avatar_url);
      }
      const qs = params.toString();
      const scheme =
        partyHost.startsWith("localhost") ||
        partyHost.startsWith("127.") ||
        partyHost.startsWith("192.168.")
          ? "ws"
          : "wss";
      const url = `${scheme}://${partyHost}/parties/blackjack/${tableId}${
        qs ? `?${qs}` : ""
      }`;

      socket = new WebSocket(url);
      socketRef.current = socket;

      socket.addEventListener("open", () => setStatus("connected"));
      socket.addEventListener("close", () => setStatus("disconnected"));
      socket.addEventListener("error", () => setStatus("disconnected"));

      socket.addEventListener("message", (e) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data as string) as ServerMessage;
        } catch {
          return;
        }
        handleMessage(msg);
      });
    })();

    function handleMessage(msg: ServerMessage) {
      if (!scene) return;
      switch (msg.type) {
        case "welcome": {
          selfIdRef.current = msg.selfId;
          scene.setSelfId(msg.selfId);
          for (const p of msg.players) scene.addPlayer(p);
          setPlayers(msg.players);
          setChat(msg.chat);
          if (msg.blackjack) {
            setBlackjack(msg.blackjack);
            applySeatsToScene(scene, msg.blackjack);
          }
          if (typeof msg.gold === "number") setGold(msg.gold);
          break;
        }
        case "player-joined":
          scene.addPlayer(msg.player);
          setPlayers((prev) => [...prev, msg.player]);
          break;
        case "player-left":
          scene.removePlayer(msg.playerId);
          setPlayers((prev) => prev.filter((p) => p.id !== msg.playerId));
          break;
        case "player-moved":
          scene.updatePlayer(msg.playerId, msg.x, msg.y, msg.direction);
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === msg.playerId
                ? { ...p, x: msg.x, y: msg.y, direction: msg.direction }
                : p,
            ),
          );
          break;
        case "player-renamed":
          scene.renamePlayer(msg.playerId, msg.name);
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === msg.playerId ? { ...p, name: msg.name } : p,
            ),
          );
          break;
        case "chat":
          setChat((prev) => [...prev.slice(-29), msg.message]);
          break;
        case "blackjack-state":
          setBlackjack(msg.state);
          applySeatsToScene(scene, msg.state);
          break;
        case "gold-update":
          setGold(msg.gold);
          break;
        case "error":
          console.warn("[blackjack] server error:", msg.message);
          break;
      }
    }

    return () => {
      cancelled = true;
      if (socket) {
        socket.close();
        if (socketRef.current === socket) socketRef.current = null;
      }
      if (scene) {
        scene.destroy();
        if (sceneRef.current === scene) sceneRef.current = null;
      }
    };
  }, [profile, tableId, router]);

  const sendRawChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !socketRef.current) return;
    const msg: ClientMessage = { type: "chat", text: trimmed };
    socketRef.current.send(JSON.stringify(msg));
  }, []);

  const sendMsg = useCallback((msg: ClientMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const leaveSeat = useCallback(
    () => sendMsg({ type: "leave-seat" }),
    [sendMsg],
  );
  const setReady = useCallback(() => sendMsg({ type: "ready" }), [sendMsg]);
  const placeBet = useCallback(
    (amount: number) => sendMsg({ type: "bet", amount }),
    [sendMsg],
  );
  const hit = useCallback(() => sendMsg({ type: "hit" }), [sendMsg]);
  const stand = useCallback(() => sendMsg({ type: "stand" }), [sendMsg]);

  const selfSeat =
    blackjack?.seats.find((s) => s.playerId === selfIdRef.current) ?? null;
  const isMyTurn =
    blackjack?.phase === "playing" &&
    selfSeat?.seatIndex === blackjack.activeSeatIndex;

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
            Blackjack · Table {tableId.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <StatusIndicator status={status} />
          <span className="tabular-nums">
            {players.length} joueur{players.length > 1 ? "s" : ""}
          </span>
          {profile ? (
            <UserPill
              profile={{ ...profile, gold }}
              variant="play"
            />
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex-1">
          <FitBox
            logicalWidth={BLACKJACK_SCENE.width}
            logicalHeight={BLACKJACK_SCENE.height}
          >
            <div
              className="relative"
              style={{
                width: BLACKJACK_SCENE.width,
                height: BLACKJACK_SCENE.height,
              }}
            >
              <div
                ref={hostRef}
                className="pixi-host"
                style={{
                  width: BLACKJACK_SCENE.width,
                  height: BLACKJACK_SCENE.height,
                }}
              />

              {blackjack && (
                <>
                  <DealerCards state={blackjack} />
                  {blackjack.seats.map((seat) => (
                    <SeatCards
                      key={seat.seatIndex}
                      seat={seat}
                      active={blackjack.activeSeatIndex === seat.seatIndex}
                    />
                  ))}
                </>
              )}

              {blackjack && (
                <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-200 backdrop-blur-sm">
                  {phaseLabel(blackjack.phase)}
                  {blackjack.lastOutcome && blackjack.phase === "resolving" && (
                    <span className="ml-3 text-amber-300 normal-case font-normal tracking-normal">
                      {blackjack.lastOutcome}
                    </span>
                  )}
                </div>
              )}

              {selfSeat && blackjack && (
                <ControlPanel
                  seat={selfSeat}
                  phase={blackjack.phase}
                  isMyTurn={isMyTurn}
                  onReady={setReady}
                  onLeaveSeat={leaveSeat}
                  onBet={placeBet}
                  onHit={hit}
                  onStand={stand}
                />
              )}
            </div>
          </FitBox>

          {status !== "connected" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="text-sm text-zinc-300">
                {status === "connecting" ? (
                  "Arrivée à la table..."
                ) : (
                  <>
                    Connexion perdue.{" "}
                    <button
                      onClick={() => window.location.reload()}
                      className="font-semibold text-indigo-300 underline-offset-4 hover:underline"
                    >
                      Recharger
                    </button>
                  </>
                )}
              </div>
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
          connected={status === "connected" || globalChat.status === "connected"}
          hint="Entrée ouvre le chat · clique un siège pour t'asseoir"
          renderDm={
            profile
              ? () => <DmView hub={dmHub} selfAuthId={profile.id} />
              : undefined
          }
        />
      </div>
    </div>
  );
}

function ControlPanel({
  seat,
  phase,
  isMyTurn,
  onReady,
  onLeaveSeat,
  onBet,
  onHit,
  onStand,
}: {
  seat: BlackjackSeat;
  phase: BlackjackState["phase"];
  isMyTurn: boolean;
  onReady: () => void;
  onLeaveSeat: () => void;
  onBet: (amount: number) => void;
  onHit: () => void;
  onStand: () => void;
}) {
  const canBet = (amount: number) => seat.gold >= amount;

  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 flex flex-col items-end gap-2 rounded-xl border border-white/10 bg-black/70 p-3 text-xs backdrop-blur-md">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-zinc-400">
        <span>Place #{seat.seatIndex + 1}</span>
        <span className="rounded-full bg-amber-400/10 px-2 py-0.5 font-semibold text-amber-300">
          {seat.gold.toLocaleString("fr-FR")} OS
        </span>
        {seat.bet > 0 && (
          <span className="rounded-full bg-rose-400/10 px-2 py-0.5 font-semibold text-rose-300">
            Mise {seat.bet}
          </span>
        )}
      </div>

      {phase === "idle" && (
        <div className="flex gap-2">
          {seat.ready ? (
            <span className="rounded-md bg-emerald-400/10 px-3 py-1.5 text-emerald-300">
              Prêt — en attente des autres
            </span>
          ) : (
            <button
              onClick={onReady}
              className="rounded-md bg-emerald-500 px-3 py-1.5 font-semibold text-white shadow hover:bg-emerald-400"
            >
              Je suis prêt
            </button>
          )}
          <button
            onClick={onLeaveSeat}
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-zinc-200 hover:bg-white/10"
          >
            Quitter
          </button>
        </div>
      )}

      {phase === "betting" && seat.status === "betting" && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-zinc-400">Choisis ta mise</div>
          <div className="flex gap-1.5">
            {BLACKJACK_CONFIG.betPresets.map((amount) => (
              <button
                key={amount}
                disabled={!canBet(amount)}
                onClick={() => onBet(amount)}
                className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-bold text-zinc-900 shadow hover:bg-amber-300 disabled:opacity-40"
              >
                {amount}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "betting" && seat.status === "ready" && (
        <span className="rounded-md bg-emerald-400/10 px-3 py-1.5 text-emerald-300">
          Mise {seat.bet} OS — en attente du deal
        </span>
      )}

      {phase === "playing" && isMyTurn && seat.status === "playing" && (
        <div className="flex gap-2">
          <button
            onClick={onHit}
            className="rounded-md bg-indigo-500 px-3 py-1.5 font-semibold text-white shadow hover:bg-indigo-400"
          >
            Tirer
          </button>
          <button
            onClick={onStand}
            className="rounded-md bg-zinc-700 px-3 py-1.5 font-semibold text-white shadow hover:bg-zinc-600"
          >
            Rester
          </button>
        </div>
      )}

      {phase === "playing" && !isMyTurn && seat.status === "playing" && (
        <span className="rounded-md bg-zinc-500/10 px-3 py-1.5 text-zinc-400">
          En attente des autres...
        </span>
      )}

      {seat.status === "blackjack" && (
        <span className="rounded-md bg-amber-400/20 px-3 py-1.5 font-semibold text-amber-200">
          BLACKJACK
        </span>
      )}
      {seat.status === "busted" && (
        <span className="rounded-md bg-rose-500/20 px-3 py-1.5 font-semibold text-rose-300">
          Sauté (&gt; 21)
        </span>
      )}
      {seat.status === "won" && (
        <span className="rounded-md bg-emerald-500/20 px-3 py-1.5 font-semibold text-emerald-300">
          Gagné
        </span>
      )}
      {seat.status === "lost" && phase === "resolving" && (
        <span className="rounded-md bg-rose-500/20 px-3 py-1.5 font-semibold text-rose-300">
          Perdu
        </span>
      )}
      {seat.status === "pushed" && (
        <span className="rounded-md bg-zinc-500/20 px-3 py-1.5 font-semibold text-zinc-300">
          Égalité
        </span>
      )}
    </div>
  );
}

const SEAT_CARD_POSITIONS: { x: number; y: number }[] = [
  { x: 224, y: 410 },
  { x: 368, y: 410 },
  { x: 512, y: 410 },
  { x: 656, y: 410 },
  { x: 800, y: 410 },
];

function SeatCards({
  seat,
  active,
}: {
  seat: BlackjackSeat;
  active: boolean;
}) {
  if (seat.hand.length === 0) return null;
  const pos = SEAT_CARD_POSITIONS[seat.seatIndex];
  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className={`flex flex-col items-center gap-1 ${
          active ? "drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]" : ""
        }`}
      >
        <div className="flex -space-x-3">
          {seat.hand.map((card, i) => (
            <CardFace key={i} card={card} />
          ))}
        </div>
        <div className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
          {seat.score}
        </div>
      </div>
    </div>
  );
}

function DealerCards({ state }: { state: BlackjackState }) {
  if (state.dealerHand.length === 0 && !state.dealerHoleHidden) return null;
  if (state.phase === "idle" || state.phase === "betting") return null;
  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2"
      style={{ left: 512, top: 180 }}
    >
      <div className="flex flex-col items-center gap-1">
        <div className="flex -space-x-3">
          {state.dealerHand.map((card, i) => (
            <CardFace key={i} card={card} />
          ))}
          {state.dealerHoleHidden && <CardFace hidden />}
        </div>
        <div className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
          Croupier · {state.dealerScore}
          {state.dealerHoleHidden ? "+" : ""}
        </div>
      </div>
    </div>
  );
}

function CardFace({ card, hidden }: { card?: Card; hidden?: boolean }) {
  if (hidden || !card) {
    return (
      <div className="flex h-12 w-9 items-center justify-center rounded-md border border-indigo-300/40 bg-gradient-to-br from-indigo-700 to-indigo-900 shadow-lg">
        <span className="text-xs font-bold text-indigo-300/70">?</span>
      </div>
    );
  }
  const isRed = card.suit === "H" || card.suit === "D";
  return (
    <div className="flex h-12 w-9 flex-col items-center justify-between rounded-md border border-zinc-300 bg-white py-1 shadow-lg">
      <span
        className={`text-xs font-bold leading-none ${
          isRed ? "text-red-600" : "text-zinc-900"
        }`}
      >
        {card.rank}
      </span>
      <span className={`text-lg leading-none ${isRed ? "text-red-600" : "text-zinc-900"}`}>
        {suitSymbol(card.suit)}
      </span>
    </div>
  );
}

function suitSymbol(suit: Card["suit"]): string {
  switch (suit) {
    case "S":
      return "\u2660";
    case "H":
      return "\u2665";
    case "D":
      return "\u2666";
    case "C":
      return "\u2663";
  }
}

function applySeatsToScene(scene: GameScene, state: BlackjackState) {
  for (const seat of state.seats) {
    if (seat.playerId && seat.playerName && seat.playerColor) {
      scene.updateSeat(seat.seatIndex, {
        playerId: seat.playerId,
        playerName: seat.playerName,
        color: seat.playerColor,
      });
    } else {
      scene.updateSeat(seat.seatIndex, null);
    }
  }
}

function phaseLabel(phase: BlackjackState["phase"]): string {
  switch (phase) {
    case "idle":
      return "entre deux manches";
    case "betting":
      return "mises";
    case "playing":
      return "joueurs";
    case "dealer":
      return "croupier";
    case "resolving":
      return "résultats";
  }
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
