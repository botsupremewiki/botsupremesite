"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ServerMessage } from "@shared/types";

export type AuxChatStatus = "connecting" | "connected" | "disconnected";

export type UseAuxChatOptions = {
  partyName: string;
  room: string;
  query?: Record<string, string | undefined>;
  enabled?: boolean;
};

export function useAuxChat({
  partyName,
  room,
  query = {},
  enabled = true,
}: UseAuxChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AuxChatStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      setMessages([]);
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
    for (const [k, v] of Object.entries(query)) {
      if (v != null) params.set(k, v);
    }
    const qs = params.toString();
    const url = `${scheme}://${partyHost}/parties/${partyName}/${room}${
      qs ? `?${qs}` : ""
    }`;

    const ws = new WebSocket(url);
    socketRef.current = ws;
    setStatus("connecting");

    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data as string) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === "welcome") {
        setMessages(msg.chat);
      } else if (msg.type === "chat") {
        setMessages((prev) => [...prev.slice(-59), msg.message]);
      }
    });

    return () => {
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    partyName,
    room,
    // stringify query to avoid reconnects on reference changes
    JSON.stringify(query),
  ]);

  const send = useCallback((text: string) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "chat", text }));
  }, []);

  return { messages, status, send };
}
