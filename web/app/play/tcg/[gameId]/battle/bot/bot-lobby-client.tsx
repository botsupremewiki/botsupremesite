"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TcgDeck, TcgGameId, TcgServerMessage } from "@shared/types";
import { TCG_GAMES } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";

type ConnStatus = "connecting" | "connected" | "disconnected";

export function BotLobbyClient({
  profile,
  gameId,
}: {
  profile: Profile | null;
  gameId: TcgGameId;
}) {
  const router = useRouter();
  const game = TCG_GAMES[gameId];
  const tcgWsRef = useRef<WebSocket | null>(null);

  const [tcgStatus, setTcgStatus] = useState<ConnStatus>("connecting");
  const [decks, setDecks] = useState<TcgDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Load decks via the TCG party.
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
    const url = `${scheme}://${partyHost}/parties/tcg/${gameId}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
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
        if (!selectedDeckId && msg.decks.length > 0) {
          setSelectedDeckId(msg.decks[0].id);
        }
      } else if (msg.type === "tcg-decks") {
        setDecks(msg.decks);
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (tcgWsRef.current === ws) tcgWsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, gameId]);

  const validDecks = useMemo(
    () =>
      decks.filter(
        (d) => d.cards.reduce((s, c) => s + c.count, 0) === 60,
      ),
    [decks],
  );

  function startBotMatch() {
    if (!profile || !selectedDeckId || starting) return;
    setStarting(true);
    // Bot rooms use a `bot-{authId}-{rand}` id pattern. The battle server
    // detects this and auto-fills p2 as the Bot Suprême AI.
    const rand = Math.random().toString(36).slice(2, 8);
    const roomId = `bot-${profile.id.slice(0, 8)}-${rand}`;
    router.push(
      `/play/tcg/${gameId}/battle/${roomId}?deck=${selectedDeckId}`,
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/${gameId}/battle`}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Combats
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">vs Bot Suprême</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main
        className={`flex flex-1 items-center justify-center p-6 ${game.gradient}`}
      >
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-zinc-100">
            🤖 Bot Suprême
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Combat d&apos;entraînement contre l&apos;IA. Le Bot joue avec un
            miroir de ton deck pour un match équilibré. Bat-le 3 fois dans la
            journée pour gagner un booster gratuit.
          </p>

          {!profile && (
            <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi avec Discord pour battre.
            </div>
          )}

          {profile && (
            <div className="mt-5 flex flex-col gap-4">
              <div>
                <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
                  Ton deck
                </div>
                {decks.length === 0 ? (
                  <div className="rounded-md border border-dashed border-white/10 p-4 text-center text-sm text-zinc-400">
                    Tu n&apos;as pas encore de deck.{" "}
                    <Link
                      href={`/play/tcg/${gameId}/decks`}
                      className="text-amber-300 underline-offset-4 hover:underline"
                    >
                      Construis ton premier deck
                    </Link>{" "}
                    pour pouvoir battre.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {decks.map((deck) => {
                      const total = deck.cards.reduce(
                        (s, c) => s + c.count,
                        0,
                      );
                      const valid = total === 60;
                      const isSelected = selectedDeckId === deck.id;
                      return (
                        <button
                          key={deck.id}
                          onClick={() => valid && setSelectedDeckId(deck.id)}
                          disabled={!valid || starting}
                          className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                            isSelected
                              ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
                              : valid
                                ? "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                                : "border-white/5 bg-white/[0.02] text-zinc-500"
                          } disabled:cursor-not-allowed`}
                        >
                          <span className="font-semibold">{deck.name}</span>
                          <span
                            className={`text-xs tabular-nums ${
                              valid ? "text-emerald-300" : "text-rose-400"
                            }`}
                          >
                            {total}/60
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {tcgStatus !== "connected" && (
                <div className="text-xs text-zinc-500">
                  Chargement de tes decks…
                </div>
              )}

              <button
                onClick={startBotMatch}
                disabled={
                  !selectedDeckId ||
                  validDecks.length === 0 ||
                  tcgStatus !== "connected" ||
                  starting
                }
                className="rounded-md bg-amber-500 px-4 py-2.5 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {starting ? "Démarrage…" : "🤖 Affronter le Bot Suprême"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
