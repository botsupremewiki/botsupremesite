"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@shared/types";

type Member = { authId: string; username: string };

type ServerMessage =
  | { type: "welcome"; messages: ChatMessage[]; members: Member[] }
  | { type: "message"; message: ChatMessage }
  | { type: "presence"; members: Member[] }
  | { type: "error"; message: string };

type Status = "idle" | "connecting" | "connected" | "disconnected" | "error";

export function useImperiumAllianceChat({
  authId,
  username,
  allianceId,
}: {
  authId: string | null;
  username: string | null;
  allianceId: string | null;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!authId || !allianceId) {
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
    const url = `${scheme}://${partyHost}/parties/imperiumalliance/${allianceId}?${params.toString()}`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    setStatus("connecting");
    setError(null);

    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("error"));
    ws.addEventListener("message", (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data as string) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "welcome":
          setMessages(msg.messages);
          setMembers(msg.members);
          break;
        case "message":
          setMessages((prev) => [...prev, msg.message]);
          break;
        case "presence":
          setMembers(msg.members);
          break;
        case "error":
          setError(msg.message);
          ws.close();
          break;
      }
    });

    return () => {
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
    };
  }, [authId, username, allianceId]);

  const send = useCallback((text: string) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!text.trim()) return;
    ws.send(JSON.stringify({ type: "send", text: text.trim() }));
  }, []);

  return { status, messages, members, error, send };
}
