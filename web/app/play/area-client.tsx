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
import { motion } from "framer-motion";
import type {
  ChatMessage,
  ClientMessage,
  Direction,
  Player,
  ServerMessage,
} from "@shared/types";
import type { GameScene, SceneConfig } from "@/lib/game/scene";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { ChatPanel } from "./chat-panel";
import type { ChatChannel } from "./chat-panel";
import { useAuxChat } from "./use-aux-chat";
import { FitBox } from "./fit-box";
import { useDmHub } from "./use-dm-hub";
import { DmView } from "./dm-view";

type ConnStatus = "connecting" | "connected" | "disconnected";

export type AreaClientProps = {
  profile: Profile | null;
  sceneConfig: SceneConfig;
  roomName: string;
  areaLabel: string;
  backHref?: string;
  zoneId?: string;
  zoneLabel?: string;
};

export function AreaClient({
  profile,
  sceneConfig,
  roomName,
  areaLabel,
  backHref = "/",
  zoneId,
  zoneLabel,
}: AreaClientProps) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [selfName, setSelfName] = useState<string>(
    profile?.username ?? "",
  );
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  // Live gold pushed by the plaza/zone server. Falls back to the SSR value
  // until the welcome message arrives — that way we always end up showing
  // the freshest DB-backed balance, even when a client cache hands us a
  // stale page on back-navigation.
  const [liveGold, setLiveGold] = useState<number | null>(null);

  const globalChat = useAuxChat({
    partyName: "global",
    room: "main",
    query: {
      name: profile?.username,
      authId: profile?.id,
    },
  });

  const zoneChat = useAuxChat({
    partyName: "zone",
    room: zoneId ?? "disabled",
    query: {
      name: profile?.username,
      authId: profile?.id,
    },
    enabled: !!zoneId,
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
      scene = new mod.GameScene(sceneConfig);
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
        } else if (landmark.kind === "table" && landmark.href) {
          router.push(landmark.href);
        }
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
      const url = `${scheme}://${partyHost}/parties/main/${roomName}${
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
          const self = msg.players.find((p) => p.id === msg.selfId);
          if (self) setSelfName(self.name);
          if (typeof msg.gold === "number") setLiveGold(msg.gold);
          break;
        }
        case "gold-update":
          setLiveGold(msg.gold);
          break;
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
          if (msg.playerId === selfIdRef.current) setSelfName(msg.name);
          break;
        case "chat":
          setChat((prev) => [...prev.slice(-29), msg.message]);
          break;
        case "error":
          console.error("[area] server error:", msg.message);
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
  }, [profile, sceneConfig, roomName, router]);

  const sendRawChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !socketRef.current) return;
    const msg: ClientMessage = { type: "chat", text: trimmed };
    socketRef.current.send(JSON.stringify(msg));
  }, []);

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
            href={backHref}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Quitter
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-medium">{areaLabel}</span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <StatusIndicator status={status} />
          <span className="tabular-nums">
            {players.length} joueur{players.length > 1 ? "s" : ""}
          </span>
          {profile ? (
            <UserPill
              profile={
                liveGold !== null ? { ...profile, gold: liveGold } : profile
              }
              variant="play"
            />
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

      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex-1">
          <FitBox
            logicalWidth={sceneConfig.width}
            logicalHeight={sceneConfig.height}
          >
            <div
              ref={hostRef}
              className="pixi-host"
              style={{ width: sceneConfig.width, height: sceneConfig.height }}
            />
          </FitBox>

          {status === "connecting" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-zinc-300"
              >
                Connexion...
              </motion.div>
            </div>
          )}
          {status === "disconnected" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
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
        </main>

        <ChatPanel
          channels={buildChannels({
            localMessages: chat,
            localOnSend: (text) => sendRawChat(text),
            localEnabled: status === "connected",
            globalMessages: globalChat.messages,
            globalOnSend: globalChat.send,
            globalEnabled: globalChat.status === "connected",
            zoneMessages: zoneId ? zoneChat.messages : undefined,
            zoneOnSend: zoneId ? zoneChat.send : undefined,
            zoneEnabled: zoneId ? zoneChat.status === "connected" : false,
            zoneLabel,
            zoneReason: zoneId
              ? undefined
              : "Aucune zone sur la plaza",
            dmsReason: profile
              ? undefined
              : "Connecte-toi avec Discord pour les DMs",
          })}
          connected={status === "connected" || globalChat.status === "connected"}
          hint="Entrée ouvre le chat · clique pour te déplacer"
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

export function buildChannels({
  localMessages,
  localOnSend,
  localEnabled,
  globalMessages,
  globalOnSend,
  globalEnabled,
  zoneMessages,
  zoneOnSend,
  zoneEnabled,
  zoneLabel,
  zoneReason,
  dmsReason,
}: {
  localMessages: ChatMessage[];
  localOnSend: (text: string) => void;
  localEnabled: boolean;
  globalMessages: ChatMessage[];
  globalOnSend: (text: string) => void;
  globalEnabled: boolean;
  zoneMessages?: ChatMessage[];
  zoneOnSend?: (text: string) => void;
  zoneEnabled: boolean;
  zoneLabel?: string;
  zoneReason?: string;
  dmsReason?: string;
}): ChatChannel[] {
  return [
    {
      id: "local",
      label: "Ici",
      messages: localMessages,
      onSend: localEnabled ? localOnSend : undefined,
    },
    {
      id: "zone",
      label: zoneLabel ?? "Zone",
      messages: zoneMessages ?? [],
      onSend: zoneEnabled && zoneOnSend ? zoneOnSend : undefined,
      disabledReason: zoneMessages ? undefined : zoneReason,
    },
    {
      id: "global",
      label: "Site",
      messages: globalMessages,
      onSend: globalEnabled ? globalOnSend : undefined,
    },
    {
      id: "dms",
      label: "DMs",
      messages: [],
      disabledReason: dmsReason,
    },
  ];
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
