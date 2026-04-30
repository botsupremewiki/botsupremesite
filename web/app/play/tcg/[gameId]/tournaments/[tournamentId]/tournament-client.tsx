"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

type TournamentDetail = {
  id: string;
  name: string;
  game_id: string;
  created_by: string;
  size: number;
  status: string;
  prize_gold: number;
  prize_packs: number;
  winner_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type EntryRow = {
  user_id: string;
  username: string | null;
  deck_id: string | null;
  deck_name: string | null;
  seed: number | null;
  placement: number | null;
};

type MatchRow = {
  id: string;
  round: number;
  bracket_position: number;
  player_a: string | null;
  player_b: string | null;
  player_a_username: string | null;
  player_b_username: string | null;
  winner_id: string | null;
  status: string;
};

const ROUND_NAMES_8: Record<number, string> = {
  1: "Quarts de finale",
  2: "Demi-finales",
  3: "Finale",
};
const ROUND_NAMES_4: Record<number, string> = {
  1: "Demi-finales",
  2: "Finale",
};

export function TournamentClient({
  gameId,
  tournament,
  entries,
  matches,
  myUserId,
  myDecks,
}: {
  gameId: string;
  tournament: TournamentDetail;
  entries: EntryRow[];
  matches: MatchRow[];
  myUserId: string | null;
  myDecks: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<string>(
    myDecks[0]?.id ?? "",
  );

  const myEntry = useMemo(
    () => (myUserId ? entries.find((e) => e.user_id === myUserId) : null),
    [entries, myUserId],
  );
  const isCreator = myUserId === tournament.created_by;
  const isFull = entries.length >= tournament.size;
  const allDecksSelected = entries.every((e) => e.deck_id);

  async function callRpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase indisponible");
      setBusy(false);
      return null;
    }
    const { data, error: rpcErr } = await supabase.rpc(fn, args);
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return null;
    }
    startTransition(() => router.refresh());
    return data;
  }

  const matchesByRound = useMemo(() => {
    const m = new Map<number, MatchRow[]>();
    for (const match of matches) {
      const arr = m.get(match.round) ?? [];
      arr.push(match);
      m.set(match.round, arr);
    }
    return m;
  }, [matches]);

  const roundNames = tournament.size === 8 ? ROUND_NAMES_8 : ROUND_NAMES_4;
  const totalRounds = tournament.size === 8 ? 3 : 2;
  const podium = entries
    .filter((e) => e.placement !== null && e.placement <= 3)
    .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99));

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header tournoi ────────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-300/40 bg-amber-300/5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-amber-200/70">
              Tournoi
            </div>
            <h1 className="text-2xl font-bold text-amber-100">
              {tournament.name}
            </h1>
          </div>
          <div className="text-right text-xs text-zinc-400">
            <div>
              Statut :{" "}
              <span className="font-bold text-amber-100">
                {tournament.status}
              </span>
            </div>
            <div>
              Inscrits : {entries.length} / {tournament.size}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1">
            🪙 {tournament.prize_gold.toLocaleString()} OS
          </span>
          {tournament.prize_packs > 0 ? (
            <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1">
              🎴 {tournament.prize_packs} booster{tournament.prize_packs > 1 ? "s" : ""}
            </span>
          ) : null}
          <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1">
            👥 {tournament.size} joueurs single-elim
          </span>
        </div>
      </div>

      {/* ── Podium si fini ────────────────────────────────────────── */}
      {tournament.status === "finished" && podium.length > 0 ? (
        <div className="rounded-xl border border-amber-300/40 bg-gradient-to-b from-amber-300/10 to-amber-300/5 p-5">
          <h2 className="text-lg font-bold text-amber-100">🏆 Podium</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {podium.map((p) => (
              <div
                key={p.user_id}
                className={`rounded-lg border p-3 text-center ${
                  p.placement === 1
                    ? "border-amber-300/60 bg-amber-300/10"
                    : p.placement === 2
                      ? "border-zinc-300/40 bg-zinc-300/10"
                      : "border-amber-700/40 bg-amber-700/10"
                }`}
              >
                <div className="text-2xl">
                  {p.placement === 1 ? "🥇" : p.placement === 2 ? "🥈" : "🥉"}
                </div>
                <Link
                  href={`/u/${encodeURIComponent(p.username ?? "")}`}
                  className="mt-1 block font-bold text-zinc-100 hover:underline"
                >
                  {p.username ?? "?"}
                </Link>
                <div className="mt-0.5 text-[10px] text-zinc-500">
                  {p.deck_name ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Actions joueur ────────────────────────────────────────── */}
      {myUserId && tournament.status === "open" ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-5">
          {!myEntry || !myEntry.deck_id ? (
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                S&apos;inscrire avec un deck
              </h2>
              {myDecks.length === 0 ? (
                <div className="mt-2 text-sm text-rose-300">
                  Tu n&apos;as pas de deck pour ce jeu. Crées-en un d&apos;abord.
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={selectedDeck}
                    onChange={(e) => setSelectedDeck(e.target.value)}
                    className="rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-zinc-100 outline-none"
                  >
                    {myDecks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || !selectedDeck}
                    onClick={() =>
                      callRpc("join_tournament", {
                        p_tournament_id: tournament.id,
                        p_deck_id: selectedDeck,
                      })
                    }
                    className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
                  >
                    {myEntry ? "Confirmer le deck" : "S'inscrire"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-emerald-300">
                ✅ Inscrit avec <strong>{myEntry.deck_name}</strong>
              </div>
              {!isCreator ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    callRpc("leave_tournament", {
                      p_tournament_id: tournament.id,
                    })
                  }
                  className="rounded-md border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-200 transition-colors hover:bg-rose-400/20"
                >
                  Quitter
                </button>
              ) : null}
            </div>
          )}
          {isCreator && isFull && allDecksSelected ? (
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
              <div className="text-xs text-amber-200">
                Le tournoi est plein. Lance le bracket !
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  callRpc("start_tournament", {
                    p_tournament_id: tournament.id,
                  })
                }
                className="rounded-md border border-amber-400/60 bg-amber-400/10 px-3 py-1.5 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-400/20 disabled:opacity-50"
              >
                Démarrer le tournoi 🚀
              </button>
            </div>
          ) : null}
          {error ? (
            <div className="mt-2 text-xs text-rose-300">{error}</div>
          ) : null}
        </div>
      ) : null}

      {/* ── Liste des inscrits ────────────────────────────────────── */}
      {tournament.status === "open" ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-5">
          <h2 className="text-base font-bold text-zinc-100">
            👥 Inscrits ({entries.length} / {tournament.size})
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {entries.map((e) => (
              <div
                key={e.user_id}
                className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
              >
                <Link
                  href={`/u/${encodeURIComponent(e.username ?? "")}`}
                  className="font-semibold text-zinc-100 hover:underline"
                >
                  {e.username ?? "?"}
                </Link>
                <span className="text-[11px] text-zinc-500">
                  {e.deck_name ?? "Deck non choisi"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Bracket ───────────────────────────────────────────────── */}
      {tournament.status !== "open" ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-5">
          <h2 className="text-lg font-bold text-zinc-100">🎯 Bracket</h2>
          <div className="mt-4 flex flex-col gap-6">
            {Array.from({ length: totalRounds }, (_, i) => i + 1).map(
              (round) => {
                const arr = matchesByRound.get(round) ?? [];
                return (
                  <div key={round}>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-amber-200">
                      {roundNames[round]}
                    </h3>
                    {arr.length === 0 ? (
                      <div className="mt-2 text-xs text-zinc-500">
                        En attente du round précédent…
                      </div>
                    ) : (
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {arr.map((m) => (
                          <MatchCard
                            key={m.id}
                            match={m}
                            myUserId={myUserId}
                            tournamentId={tournament.id}
                            gameId={gameId}
                            onReport={(winnerId) =>
                              callRpc("report_match_result", {
                                p_match_id: m.id,
                                p_winner_id: winnerId,
                              })
                            }
                            busy={busy}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </div>
          {error ? (
            <div className="mt-2 text-xs text-rose-300">{error}</div>
          ) : null}
          <div className="mt-4 rounded-md border border-white/10 bg-white/[0.02] p-3 text-[11px] text-zinc-400">
            💡 Pour jouer un match : utilisez le mode <strong>PvP libre</strong>{" "}
            avec votre adversaire (créez une room et donnez le code), puis le
            gagnant clique « Reporter victoire » ici. Le bracket avance
            automatiquement quand tous les matches du round sont terminés.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MatchCard({
  match,
  myUserId,
  tournamentId: _tournamentId,
  gameId,
  onReport,
  busy,
}: {
  match: MatchRow;
  myUserId: string | null;
  tournamentId: string;
  gameId: string;
  onReport: (winnerId: string) => void;
  busy: boolean;
}) {
  const isParticipant =
    myUserId !== null &&
    (myUserId === match.player_a || myUserId === match.player_b);
  const canReport = match.status === "pending" && isParticipant;
  const winnerName =
    match.winner_id === match.player_a
      ? match.player_a_username
      : match.player_b_username;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <PlayerLine
        username={match.player_a_username}
        isWinner={match.winner_id === match.player_a}
        canPick={canReport && match.player_a !== null}
        onPick={() => match.player_a && onReport(match.player_a)}
        busy={busy}
      />
      <div className="my-1 text-center text-[10px] uppercase tracking-widest text-zinc-500">
        vs
      </div>
      <PlayerLine
        username={match.player_b_username}
        isWinner={match.winner_id === match.player_b}
        canPick={canReport && match.player_b !== null}
        onPick={() => match.player_b && onReport(match.player_b)}
        busy={busy}
      />
      {match.status === "done" ? (
        <div className="mt-2 text-center text-[11px] text-emerald-300">
          ✅ {winnerName ?? "?"} gagne
        </div>
      ) : isParticipant ? (
        <div className="mt-2 text-center">
          <Link
            href={`/play/tcg/${gameId}/battle/pvp`}
            className="text-[11px] text-amber-300 underline-offset-2 hover:underline"
          >
            Lancer un PvP libre →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function PlayerLine({
  username,
  isWinner,
  canPick,
  onPick,
  busy,
}: {
  username: string | null;
  isWinner: boolean;
  canPick: boolean;
  onPick: () => void;
  busy: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1 ${
        isWinner ? "bg-emerald-400/10" : ""
      }`}
    >
      <span
        className={`text-sm ${
          isWinner ? "font-bold text-emerald-200" : "text-zinc-200"
        }`}
      >
        {username ?? <span className="text-zinc-600">— en attente —</span>}
      </span>
      {canPick ? (
        <button
          type="button"
          disabled={busy}
          onClick={onPick}
          className="rounded border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
        >
          A gagné
        </button>
      ) : null}
    </div>
  );
}
