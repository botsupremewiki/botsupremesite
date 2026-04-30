"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { TcgDeck, TcgServerMessage } from "@shared/types";
import { RUNETERRA_BATTLE_CONFIG, TCG_GAMES } from "@shared/types";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";

type ConnStatus = "connecting" | "connected" | "disconnected";

export function LorBotLauncherClient({
  profile,
  questState,
}: {
  profile: Profile | null;
  // Phase 3.85 : compteur de quête bot wins du jour, lu côté serveur.
  // null = pas encore initialisé (anonyme ou supabase down).
  questState?: { bot_wins: number; rewarded: boolean } | null;
}) {
  const router = useRouter();
  const game = TCG_GAMES.lol;
  const tcgWsRef = useRef<WebSocket | null>(null);
  const [tcgStatus, setTcgStatus] = useState<ConnStatus>("connecting");
  const [decks, setDecks] = useState<TcgDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const validDecks = decks.filter((d) => {
    const total = d.cards.reduce((s, c) => s + c.count, 0);
    return total === RUNETERRA_BATTLE_CONFIG.deckSize;
  });

  const startBotBattle = () => {
    if (!selectedDeckId) {
      setErrorMsg("Sélectionne un deck.");
      return;
    }
    const roomId = crypto.randomUUID();
    router.push(
      `/play/tcg/lol/battle/${roomId}?deck=${selectedDeckId}&bot=1`,
    );
  };

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
          <span className="text-xs text-zinc-500">🤖 Combat solo</span>
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
              🤖 Combat solo — Bot Suprême
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Entraîne-toi contre l'IA. Le bot mirror ton deck et joue
              naïvement (joue l'unité la moins chère, attaque dès qu'il a
              le jeton, ne défend pas). Pratique pour tester un deck ou
              apprendre les mécaniques.
            </p>
          </div>

          {/* Phase 3.85 : progression quête bot wins du jour. */}
          {profile && questState && (
            <div
              className={`rounded-xl border p-4 ${
                questState.rewarded
                  ? "border-amber-300/40 bg-amber-400/10"
                  : "border-emerald-400/30 bg-emerald-500/5"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-widest text-zinc-400">
                    Quête journalière
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-100">
                    {questState.rewarded
                      ? "🎁 Quête remplie ! Reviens demain."
                      : `Bat le bot 3× pour 1 booster gratuit + 100 OS / win`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums text-emerald-300">
                    {Math.min(questState.bot_wins, 3)}
                    <span className="text-zinc-500">/3</span>
                  </div>
                </div>
              </div>
              {/* Barre de progression */}
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/40">
                <div
                  className={`h-full transition-all ${
                    questState.rewarded
                      ? "bg-amber-400"
                      : "bg-gradient-to-r from-emerald-500 to-emerald-300"
                  }`}
                  style={{
                    width: `${(Math.min(questState.bot_wins, 3) / 3) * 100}%`,
                  }}
                />
              </div>
              <div className="mt-1 text-[10px] text-zinc-500">
                Reset à minuit · bonus +100 OS appliqué automatiquement à
                chaque victoire vs bot.
              </div>
            </div>
          )}

          {!profile ? (
            <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi pour jouer.
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
                    Aucun deck valide. Va créer un deck à
                    {" "}{RUNETERRA_BATTLE_CONFIG.deckSize} cartes dans{" "}
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
                    className="mt-2 w-full rounded-md border border-white/10 bg-black/60 px-3 py-2 text-sm text-zinc-100"
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

              <div className="flex justify-end">
                <button
                  onClick={startBotBattle}
                  disabled={validDecks.length === 0 || !selectedDeckId}
                  className="rounded-md bg-emerald-500 px-5 py-2 text-sm font-bold text-emerald-950 shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  🤖 Lancer le combat solo
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
