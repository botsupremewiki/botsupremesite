"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DmClientMessage,
  DmConversation,
  DmMessage,
  DmServerMessage,
} from "@shared/types";

export type DmHub = ReturnType<typeof useDmHub>;

type Status = "idle" | "connecting" | "connected" | "disconnected";

export function useDmHub({
  authId,
  username,
  enabled = true,
}: {
  authId: string | null;
  username: string | null;
  enabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [threadsByPartner, setThreadsByPartner] = useState<
    Record<string, DmMessage[]>
  >({});
  const [searchResults, setSearchResults] = useState<
    { id: string; username: string; avatarUrl?: string }[]
  >([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || !authId) {
      setStatus("idle");
      return;
    }
    const partyHost =
      process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999";
    const scheme =
      partyHost.startsWith("localhost") ||
      partyHost.startsWith("127.") ||
      partyHost.startsWith("192.168.")
        ? "ws"
        : "wss";
    const params = new URLSearchParams();
    params.set("authId", authId);
    if (username) params.set("name", username);
    const url = `${scheme}://${partyHost}/parties/dm/hub?${params.toString()}`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    setStatus("connecting");

    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      let msg: DmServerMessage;
      try {
        msg = JSON.parse(e.data as string) as DmServerMessage;
      } catch {
        return;
      }
      handleMsg(msg);
    });

    function handleMsg(msg: DmServerMessage) {
      switch (msg.type) {
        case "dm-welcome":
          setConversations(msg.conversations);
          break;
        case "dm-sent":
        case "dm-incoming": {
          const m = msg.message;
          const isSelf = m.senderId === authId;
          const partnerId = isSelf ? m.recipientId : m.senderId;
          setThreadsByPartner((prev) => {
            const existing = prev[partnerId] ?? [];
            if (existing.some((x) => x.id === m.id)) return prev;
            return { ...prev, [partnerId]: [...existing, m] };
          });
          setConversations((prev) => upsertConversation(prev, partnerId, m, isSelf, authId!));
          break;
        }
        case "dm-thread":
          setThreadsByPartner((prev) => ({
            ...prev,
            [msg.partnerId]: msg.messages,
          }));
          break;
        case "dm-user-lookup":
          setSearchQuery(msg.query);
          setSearchResults(msg.results);
          break;
        case "dm-error":
          console.warn("[dm] server error:", msg.message);
          break;
      }
    }

    return () => {
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
    };
  }, [authId, username, enabled]);

  const send = useCallback((msg: DmClientMessage) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const sendDm = useCallback(
    (recipientId: string, text: string) => {
      send({ type: "send", recipientId, text });
    },
    [send],
  );
  const loadThread = useCallback(
    (partnerId: string) => send({ type: "load-thread", partnerId }),
    [send],
  );
  const markRead = useCallback(
    (partnerId: string) => {
      send({ type: "mark-read", partnerId });
      setConversations((prev) =>
        prev.map((c) =>
          c.partnerId === partnerId ? { ...c, unreadCount: 0 } : c,
        ),
      );
    },
    [send],
  );
  const lookupUser = useCallback(
    (q: string) => send({ type: "lookup-user", query: q }),
    [send],
  );

  return {
    status,
    conversations,
    threadsByPartner,
    searchResults,
    searchQuery,
    sendDm,
    loadThread,
    markRead,
    lookupUser,
  };
}

function upsertConversation(
  prev: DmConversation[],
  partnerId: string,
  msg: DmMessage,
  isSelf: boolean,
  selfAuthId: string,
): DmConversation[] {
  const existing = prev.find((c) => c.partnerId === partnerId);
  if (existing) {
    const updated: DmConversation = {
      ...existing,
      lastMessage: msg,
      unreadCount:
        !isSelf && msg.recipientId === selfAuthId
          ? existing.unreadCount + 1
          : existing.unreadCount,
    };
    return [updated, ...prev.filter((c) => c.partnerId !== partnerId)];
  }
  return [
    {
      partnerId,
      partnerName: msg.senderName ?? msg.recipientName ?? "Nouveau contact",
      lastMessage: msg,
      unreadCount: !isSelf ? 1 : 0,
    },
    ...prev,
  ];
}
