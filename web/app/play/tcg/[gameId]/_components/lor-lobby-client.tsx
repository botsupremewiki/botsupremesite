"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LorLobbyClientMessage,
  LorLobbyServerMessage,
  TcgDeck,
  TcgServerMessage,
} from "@shared/types";
import { RUNETERRA_BATTLE_CONFIG, TCG_GAMES } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";

type ConnStatus = "connecting" | "connected" | "disconnected";
type LobbyState = "idle" | "queued" | "matched";

export function LorLobbyClient({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const game = TCG_GAMES.lol;
  const tcgWsRef = useRef<WebSocket | null>(null);
  const lobbyWsRef = useRef<WebSocket | null>(null);

  const [tcgStatus, setTcgStatus] = useState<ConnStatus>("connecting");
  const [lobbyStatus, setLobbyStatus] = useState<ConnStatus>("connecting");
  const [decks, setDecks] = useState<TcgDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [lobbyState, setLobbyState] = useState<LobbyState>("idle");
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Connect to TCG party to load decks.
  useEffect(() => {
    if (!profile) return;
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
    params.set("authId", profile.id);
    params.set("name", profile.username);
    params.set("gold", String(profile.gold));
    const url = `${scheme}://${partyHost}/parties/tcg/lol?${params.toString()}`;
    const ws = new WebSocket(url);
    tcgWsRef.current = ws;
    ws.addEventListener("open", () => setTcgStatus("connected"));
    ws.addEventListener("close", () => setTcgStatus("disconnected"));
    ws.addEventListener("error", () => setTcgStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: TcgServerMessage;
      try {
        msg = JSON.parse(e.data as string) as TcgServerMessage;
      } catch {
        return;
      }
      if (msg.type === "tcg-welcome") {
        setDecks(msg.decks);
        setSelectedDeckId((prev) => prev ?? msg.decks[0]?.id ?? null);
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (tcgWsRef.current === ws) tcgWsRef.current = null;
    };
  }, [profile]);

  // Connect to LoR lobby.
  useEffect(() => {
    if (!profile) return;
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
    params.set("authId", profile.id);
    params.set("name", profile.username);
    const url = `${scheme}://${partyHost}/parties/lorlobby/main?${params.toString()}`;
    const ws = new WebSocket(url);
    lobbyWsRef.current = ws;
    ws.addEventListener("open", () => setLobbyStatus("connected"));
    ws.addEventListener("close", () => setLobbyStatus("disconnected"));
    ws.addEventListener("error", () => setLobbyStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: LorLobbyServerMessage;
      try {
        msg = JSON.parse(e.data as string) as LorLobbyServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "lor-queued":
          setLobbyState("queued");
          setQueuePosition(msg.position);
          break;
        case "lor-matched":
          setLobbyState("matched");
          // Navigate to battle URL.
          router.push(
            `/play/tcg/lol/battle/${msg.roomId}?deck=${msg.deckId}`,
          );
          break;
        case "lor-lobby-error":
          setErrorMsg(msg.message);
          setLobbyState("idle");
          break;
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (lobbyWsRef.current === ws) lobbyWsRef.current = null;
    };
  }, [profile, router]);

  const queue = useCallback(() => {
    if (!selectedDeckId) {
      setErrorMsg("Sélectionne un deck.");
      return;
    }
    const ws = lobbyWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setErrorMsg(null);
    setLobbyState("queued");
    setQueuePosition(0);
    ws.send(
      JSON.stringify({
        type: "lor-queue",
        deckId: selectedDeckId,
      } as LorLobbyClientMessage),
    );
  }, [selectedDeckId]);

  const leaveQueue = useCallback(() => {
    const ws = lobbyWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setLobbyState("idle");
    setQueuePosition(0);
    ws.send(
      JSON.stringify({ type: "lor-leave-queue" } as LorLobbyClientMessage),
    );
  }, []);

  const validDecks = decks.filter((d) => {
    const total = d.cards.reduce((s, c) => s + c.count, 0);
    return total === RUNETERRA_BATTLE_CONFIG.deckSize;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/tcg/lol"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← {game.name}
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">🆚 Combat JcJ</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main
        className={`relative flex flex-1 flex-col overflow-y-auto p-6 ${game.gradient}`}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <h1 className="text-2xl font-bold text-zinc-100">
              🆚 Combat JcJ — Legends of Runeterra
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Match amical sans classement. Sélectionne un deck valide
              ({RUNETERRA_BATTLE_CONFIG.deckSize} cartes), entre en file, et
              tu seras automatiquement matché contre le prochain joueur en
              attente.
            </p>
          </div>

          {!profile ? (
            <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour entrer en file.
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-xs uppercase tracking-widest text-zinc-400">
                  Deck
                </div>
                {tcgStatus !== "connected" ? (
                  <div className="mt-2 text-sm text-zinc-500">
                    Chargement des decks...
                  </div>
                ) : validDecks.length === 0 ? (
                  <div className="mt-2 text-sm text-zinc-400">
                    Aucun deck valide. Va créer un deck à 40 cartes dans{" "}
                    <Link
                      href="/play/tcg/lol/decks"
                      className="text-sky-300 underline"
                    >
                      Mes Decks
                    </Link>
                    .
                  </div>
                ) : (
                  <select
                    value={selectedDeckId ?? ""}
                    onChange={(e) =>
                      setSelectedDeckId(e.target.value || null)
                    }
                    disabled={lobbyState !== "idle"}
                    className="mt-2 w-full rounded-md border border-white/10 bg-black/60 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
                  >
                    {validDecks.map((d) => {
                      const total = d.cards.reduce((s, c) => s + c.count, 0);
                      return (
                        <option key={d.id} value={d.id}>
                          {d.name} ({total} cartes)
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {errorMsg && (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-4">
                <div>
                  <div className="text-xs uppercase tracking-widest text-zinc-400">
                    File d'attente
                  </div>
                  <div className="mt-1 text-base font-semibold text-zinc-100">
                    {lobbyState === "idle" && "Hors file"}
                    {lobbyState === "queued" &&
                      (queuePosition > 0
                        ? `Position #${queuePosition}`
                        : "En recherche...")}
                    {lobbyState === "matched" && "✅ Adversaire trouvé !"}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Lobby : {lobbyStatus === "connected" ? "✓ connecté" : lobbyStatus}
                  </div>
                </div>
                <div>
                  {lobbyState === "idle" ? (
                    <button
                      onClick={queue}
                      disabled={
                        validDecks.length === 0 ||
                        !selectedDeckId ||
                        lobbyStatus !== "connected"
                      }
                      className="rounded-md bg-sky-500 px-5 py-2 text-sm font-bold text-sky-950 shadow hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      🆚 Entrer en file
                    </button>
                  ) : lobbyState === "queued" ? (
                    <button
                      onClick={leaveQueue}
                      className="rounded-md border border-white/10 bg-white/5 px-5 py-2 text-sm text-zinc-200 hover:bg-white/10"
                    >
                      Quitter la file
                    </button>
                  ) : (
                    <span className="text-sm text-emerald-300">
                      Redirection...
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
