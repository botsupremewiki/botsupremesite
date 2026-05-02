"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PokemonCardData,
  PokemonEnergyType,
  TcgDeck,
  TcgGameId,
  TcgServerMessage,
} from "@shared/types";
import { BATTLE_CONFIG, TCG_GAMES } from "@shared/types";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import {
  POKEMON_TYPE_EMOJI,
  POKEMON_TYPE_LABEL_FR,
  getTodayArena,
  type PokemonArena,
} from "@shared/tcg-pokemon-arenas";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { CombatNav } from "../../_components/combat-nav";

type ConnStatus = "connecting" | "connected" | "disconnected";

/** Détermine si un deck contient au moins une carte Pokémon du type donné.
 *  Sert à valider que le deck du joueur ne contient pas le type INTERDIT
 *  par l'arène en cours. */
function deckContainsType(
  deck: TcgDeck,
  type: PokemonEnergyType,
): boolean {
  for (const entry of deck.cards) {
    const card = POKEMON_BASE_SET_BY_ID.get(entry.cardId) as
      | PokemonCardData
      | undefined;
    if (!card) continue;
    if (card.kind === "pokemon" && card.type === type) return true;
  }
  return false;
}

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
  // Mode arène : pour Pokemon uniquement, on affiche l'arène du jour avec
  // status (badge déjà gagné ? déjà battu aujourd'hui ?).
  const arena = useMemo<PokemonArena | null>(
    () => (gameId === "pokemon" ? getTodayArena() : null),
    [gameId],
  );
  const [arenaStatus, setArenaStatus] = useState<{
    badge_owned: boolean;
    won_today: boolean;
  } | null>(null);

  // Fetch du statut d'arène (badge déjà gagné ? combat déjà gagné aujourd'hui ?)
  const fetchArenaStatus = useCallback(async () => {
    if (!arena || !profile) return;
    const sb = createClient();
    if (!sb) return;
    const { data } = await sb.rpc("arena_today_status", {
      p_arena_id: arena.id,
    });
    if (data && typeof data === "object") {
      setArenaStatus(data as { badge_owned: boolean; won_today: boolean });
    }
  }, [arena, profile]);

  useEffect(() => {
    fetchArenaStatus();
  }, [fetchArenaStatus]);

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

  const expectedDeckSize =
    gameId === "onepiece" ? 50 : BATTLE_CONFIG.deckSize;
  const validDecks = useMemo(
    () =>
      decks.filter(
        (d) =>
          d.cards.reduce((s, c) => s + c.count, 0) === expectedDeckSize &&
          // OnePiece exige un Leader (Pokémon non).
          (gameId !== "onepiece" || !!d.leaderId),
      ),
    [decks, expectedDeckSize, gameId],
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

  /** Démarre un match Champion d'arène. Le room id contient le type de
   *  l'arène (pour que PartyKit pioche un deck mono-type matchant). */
  function startArenaMatch() {
    if (!profile || !selectedDeckId || starting || !arena) return;
    // Validation client : le deck ne doit pas contenir le type interdit.
    const selected = decks.find((d) => d.id === selectedDeckId);
    if (selected && deckContainsType(selected, arena.forbiddenType)) {
      alert(
        `Ce deck contient des Pokémon ${POKEMON_TYPE_LABEL_FR[arena.forbiddenType]} — interdit dans l'Arène ${arena.name.replace("Arène ", "")} !`,
      );
      return;
    }
    setStarting(true);
    const rand = Math.random().toString(36).slice(2, 8);
    // Pattern : bot-arena-{type}-{authId}-{rand} (cf. battle.ts getArenaType).
    const roomId = `bot-arena-${arena.botType}-${profile.id.slice(0, 8)}-${rand}`;
    router.push(
      `/play/tcg/${gameId}/battle/${roomId}?deck=${selectedDeckId}&arena=${arena.id}`,
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/${gameId}`}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← {game.name}
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
        className={`flex flex-1 flex-col items-center gap-4 overflow-y-auto p-6 ${game.gradient}`}
      >
        <CombatNav gameId={gameId} current="bot" />

        {/* Section Champion d'arène (Pokemon uniquement). 7 arènes en
            rotation hebdomadaire — l'arène du jour est déterminée par
            le jour de la semaine (cf. tcg-pokemon-arenas.ts). */}
        {arena && profile && (() => {
          const selected = decks.find((d) => d.id === selectedDeckId);
          const deckHasForbidden =
            selected != null &&
            deckContainsType(selected, arena.forbiddenType);
          const rewarded = arenaStatus?.won_today ?? false;
          const hasBadge = arenaStatus?.badge_owned ?? false;
          return (
            <div
              className={`w-full max-w-xl rounded-2xl border-2 bg-gradient-to-br ${arena.bg} p-6 backdrop-blur-sm border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)]`}
            >
              <div className="flex items-center gap-3">
                <span className="text-5xl">{arena.icon}</span>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-400">
                    🏟️ Champion d&apos;arène — du jour
                  </div>
                  <h2 className={`text-2xl font-bold ${arena.accent}`}>
                    {arena.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-300">
                    {arena.description}
                  </p>
                </div>
                {hasBadge && (
                  <span
                    className="rounded-full bg-amber-400/20 px-2 py-1 text-xs font-bold text-amber-200 ring-1 ring-amber-400/40"
                    title="Tu possèdes déjà ce badge"
                  >
                    🏅 Badge
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-white/10 bg-black/30 p-2">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                    Bot joue
                  </div>
                  <div className="mt-0.5 font-bold text-zinc-100">
                    {POKEMON_TYPE_EMOJI[arena.botType]}{" "}
                    {POKEMON_TYPE_LABEL_FR[arena.botType]} mono-type
                  </div>
                </div>
                <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-2">
                  <div className="text-[10px] uppercase tracking-widest text-rose-300">
                    Ton deck NE doit PAS contenir
                  </div>
                  <div className="mt-0.5 font-bold text-rose-100">
                    {POKEMON_TYPE_EMOJI[arena.forbiddenType]}{" "}
                    {POKEMON_TYPE_LABEL_FR[arena.forbiddenType]}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-500/5 p-2 text-xs text-amber-200">
                🎁 Récompense : <strong>1 badge</strong>
                {!hasBadge ? " (nouveau !)" : " (déjà acquis)"} +{" "}
                <strong>1 booster gratuit</strong>
                {rewarded && " — déjà gagné aujourd'hui, prochain reset à minuit"}
              </div>

              {deckHasForbidden && (
                <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">
                  ⛔ Ton deck sélectionné contient des Pokémon{" "}
                  {POKEMON_TYPE_LABEL_FR[arena.forbiddenType]} — choisis un
                  autre deck pour défier l&apos;arène.
                </div>
              )}

              <button
                onClick={startArenaMatch}
                disabled={
                  !selectedDeckId ||
                  validDecks.length === 0 ||
                  tcgStatus !== "connected" ||
                  starting ||
                  deckHasForbidden ||
                  rewarded
                }
                title={
                  rewarded
                    ? "Déjà gagné aujourd'hui — reset à minuit"
                    : deckHasForbidden
                      ? `Deck contient ${POKEMON_TYPE_LABEL_FR[arena.forbiddenType]}`
                      : undefined
                }
                className={`mt-3 w-full rounded-lg px-4 py-3 text-base font-extrabold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  rewarded
                    ? "bg-zinc-700 text-zinc-400"
                    : `bg-gradient-to-br from-amber-400 to-amber-600 text-amber-950 shadow-[0_4px_18px_rgba(251,191,36,0.4)] hover:scale-[1.02] hover:from-amber-300 hover:to-amber-500`
                }`}
              >
                {rewarded
                  ? "✓ Arène vaincue aujourd'hui"
                  : `${arena.icon} Défier le ${arena.name.replace("Arène ", "Champion ")}`}
              </button>
            </div>
          );
        })()}

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
                      const valid = total === expectedDeckSize;
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
                            {total}/{expectedDeckSize}
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
