"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PLAZA_CONFIG } from "@shared/types";
import type {
  ChatMessage,
  ClientMessage,
  Direction,
  Player,
  ServerMessage,
} from "@shared/types";
import type { PlazaScene } from "@/lib/game/plaza";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";

type ConnStatus = "connecting" | "connected" | "disconnected";

export function PlazaClient({ profile }: { profile: Profile | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PlazaScene | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [input, setInput] = useState("");
  const [selfName, setSelfName] = useState<string>(
    profile?.username ?? "",
  );
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let scene: PlazaScene | null = null;
    let socket: WebSocket | null = null;

    const sendClient = (msg: ClientMessage) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    };

    (async () => {
      const mod = await import("@/lib/game/plaza");
      if (cancelled) return;
      scene = new mod.PlazaScene();
      await scene.init(host, PLAZA_CONFIG.width, PLAZA_CONFIG.height);
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

      if (cancelled) return;

      const partyHost =
        process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999";

      const params = new URLSearchParams();
      if (profile) {
        params.set("authId", profile.id);
        params.set("name", profile.username);
        if (profile.avatar_url) params.set("avatarUrl", profile.avatar_url);
      }
      const qs = params.toString();
      const scheme =
        partyHost.startsWith("localhost") ||
        partyHost.startsWith("127.") ||
        partyHost.startsWith("192.168.")
          ? "ws"
          : "wss";
      const url = `${scheme}://${partyHost}/parties/main/plaza${qs ? `?${qs}` : ""}`;

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
          for (const p of msg.players) scene.addPlayer(p);
          setPlayers(msg.players);
          setChat(msg.chat);
          const self = msg.players.find((p) => p.id === msg.selfId);
          if (self) setSelfName(self.name);
          break;
        }
        case "player-joined":
          scene.addPlayer(msg.player);
          setPlayers((prev) => [...prev, msg.player]);
          break;
        case "player-left":
          scene.removePlayer(msg.playerId);
          setPlayers((prev) =>
            prev.filter((p) => p.id !== msg.playerId),
          );
          break;
        case "player-moved":
          scene.updatePlayer(
            msg.playerId,
            msg.x,
            msg.y,
            msg.direction,
          );
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
          if (msg.playerId === selfIdRef.current) setSelfName(msg.name);
          break;
        case "chat":
          setChat((prev) => [...prev.slice(-29), msg.message]);
          break;
        case "error":
          console.error("[plaza] server error:", msg.message);
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
  }, [profile]);

  const sendChat = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || !socketRef.current) return;
      const msg: ClientMessage = { type: "chat", text };
      socketRef.current.send(JSON.stringify(msg));
      setInput("");
    },
    [input],
  );

  const startEditName = () => {
    setNameDraft(selfName);
    setEditingName(true);
  };

  const commitName = (e?: FormEvent) => {
    e?.preventDefault();
    const n = nameDraft.trim();
    if (n.length >= 2 && socketRef.current) {
      const msg: ClientMessage = { type: "set-name", name: n };
      socketRef.current.send(JSON.stringify(msg));
    }
    setEditingName(false);
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Quitter
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-medium">Plaza</span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <StatusIndicator status={status} />
          <span className="tabular-nums">
            {players.length} joueur{players.length > 1 ? "s" : ""}
          </span>
          {profile ? (
            <UserPill profile={profile} variant="play" />
          ) : (
            selfName &&
            (editingName ? (
              <form
                onSubmit={commitName}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => commitName()}
                  maxLength={20}
                  className="w-32 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </form>
            ) : (
              <button
                onClick={startEditName}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-200 transition-colors hover:bg-white/10"
                title="Changer de pseudo"
              >
                {selfName}
              </button>
            ))
          )}
        </div>
      </header>

      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4">
        <div
          ref={hostRef}
          className="pixi-host rounded-xl border border-white/10 shadow-2xl shadow-black/60"
          style={{
            width: PLAZA_CONFIG.width,
            height: PLAZA_CONFIG.height,
          }}
        />

        {status === "connecting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-zinc-300"
            >
              Connexion à la plaza...
            </motion.div>
          </div>
        )}
        {status === "disconnected" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center text-sm text-zinc-300">
              Connexion perdue.{" "}
              <button
                onClick={() => window.location.reload()}
                className="font-semibold text-indigo-300 underline-offset-4 hover:underline"
              >
                Recharger
              </button>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-8 left-8 w-[22rem]">
          <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/55 backdrop-blur-md">
            <div className="max-h-48 overflow-y-auto px-3 py-2 text-sm">
              {chat.length === 0 ? (
                <div className="italic text-zinc-500">
                  Aucun message. Sois le premier à dire bonjour.
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {chat.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="py-0.5 leading-tight"
                    >
                      <span className="font-semibold text-indigo-300">
                        {m.playerName}
                      </span>
                      <span className="text-zinc-500"> : </span>
                      <span className="text-zinc-100">{m.text}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
            <form
              onSubmit={sendChat}
              className="flex border-t border-white/10"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Écris un message..."
                maxLength={200}
                disabled={status !== "connected"}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || status !== "connected"}
                className="px-4 py-2 text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200 disabled:text-zinc-600"
              >
                Envoyer
              </button>
            </form>
          </div>
          <div className="mt-2 px-1 text-[11px] text-zinc-500">
            Clique sur la plaza pour te déplacer.
          </div>
        </div>
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
