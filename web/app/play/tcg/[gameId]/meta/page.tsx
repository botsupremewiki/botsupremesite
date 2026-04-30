import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import { UserPill } from "@/components/user-pill";
import { CombatNav } from "../_components/combat-nav";

export const dynamic = "force-dynamic";

type Overview = {
  total_matches: number;
  ranked_matches: number;
  active_players_24h: number;
  total_decks: number;
  total_unique_players: number;
};

type Archetype = {
  deck_name: string;
  matches: number;
  wins: number;
  losses: number;
  winrate: number;
};

type CardUsage = {
  card_id: string;
  decks_count: number;
  total_copies: number;
};

type TopPlayer = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  elo: number;
  ranked_wins: number;
  ranked_losses: number;
  total_matches: number;
};

export default async function MetaPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();

  let overview: Overview | null = null;
  let archetypes: Archetype[] = [];
  let topCards: CardUsage[] = [];
  let topPlayers: TopPlayer[] = [];

  const supabase = await createClient();
  if (supabase) {
    const [oRes, aRes, cRes, pRes] = await Promise.all([
      supabase.rpc("tcg_meta_overview", { p_game_id: gameId }),
      supabase.rpc("tcg_meta_top_archetypes", {
        p_game_id: gameId,
        p_limit: 10,
      }),
      supabase.rpc("tcg_meta_top_cards", { p_game_id: gameId, p_limit: 12 }),
      supabase.rpc("tcg_meta_top_players", { p_game_id: gameId, p_limit: 10 }),
    ]);
    overview = (oRes.data as Overview) ?? null;
    archetypes = (aRes.data as Archetype[]) ?? [];
    topCards = (cRes.data as CardUsage[]) ?? [];
    topPlayers = (pRes.data as TopPlayer[]) ?? [];
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
          <span className="text-xs text-zinc-500">📈 Méta global</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main
        className={`flex flex-1 flex-col overflow-y-auto p-6 ${game.gradient}`}
      >
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-4">
            <CombatNav gameId={gameId} current="meta" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">📈 Méta global</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Statistiques agrégées de tous les joueurs sur {game.name}.
              Mis à jour en temps réel.
            </p>
          </div>

          {/* ─── Overview ────────────────────────────────────────── */}
          {overview ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Tile
                label="Matchs joués"
                value={overview.total_matches.toLocaleString()}
                accent="text-zinc-100"
              />
              <Tile
                label="Matchs classés"
                value={overview.ranked_matches.toLocaleString()}
                accent="text-amber-300"
              />
              <Tile
                label="Joueurs uniques"
                value={overview.total_unique_players.toLocaleString()}
                accent="text-emerald-300"
              />
              <Tile
                label="Actifs 24h"
                value={overview.active_players_24h.toLocaleString()}
                accent="text-cyan-300"
              />
              <Tile
                label="Decks créés"
                value={overview.total_decks.toLocaleString()}
                accent="text-violet-300"
              />
            </div>
          ) : null}

          {/* ─── Top players ─────────────────────────────────────── */}
          {topPlayers.length > 0 ? (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-zinc-100">
                🏆 Top 10 joueurs (ELO actuel)
              </h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-[11px] uppercase tracking-widest text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Joueur</th>
                      <th className="px-3 py-2 text-right">ELO</th>
                      <th className="px-3 py-2 text-right">Classés W/L</th>
                      <th className="px-3 py-2 text-right">Total matchs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {topPlayers.map((p, i) => (
                      <tr key={p.user_id} className="bg-black/40">
                        <td className="px-3 py-2 font-bold tabular-nums text-amber-200">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/u/${encodeURIComponent(p.username ?? "")}`}
                            className="font-semibold text-zinc-100 hover:underline"
                          >
                            {p.username ?? "?"}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                          {p.elo}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                          {p.ranked_wins}W / {p.ranked_losses}L
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                          {p.total_matches}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* ─── Top archetypes ──────────────────────────────────── */}
          {archetypes.length > 0 ? (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-zinc-100">
                🃏 Top archétypes (winrate, min 5 matchs)
              </h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-[11px] uppercase tracking-widest text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Deck</th>
                      <th className="px-3 py-2 text-right">Matchs</th>
                      <th className="px-3 py-2 text-right">W / L</th>
                      <th className="px-3 py-2 text-right">Winrate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {archetypes.map((a) => (
                      <tr key={a.deck_name} className="bg-black/40">
                        <td className="px-3 py-2 font-semibold text-zinc-100">
                          {a.deck_name}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                          {a.matches}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                          <span className="text-emerald-300">{a.wins}</span>
                          {" / "}
                          <span className="text-rose-300">{a.losses}</span>
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-bold tabular-nums ${
                            a.winrate >= 55
                              ? "text-emerald-300"
                              : a.winrate >= 45
                                ? "text-zinc-200"
                                : "text-rose-300"
                          }`}
                        >
                          {a.winrate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* ─── Top cards (only Pokemon affichable côté image) ──── */}
          {topCards.length > 0 ? (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-zinc-100">
                🎴 Cartes les plus jouées
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Top {topCards.length} en nombre d&apos;exemplaires totaux
                dans les decks (toutes versions confondues).
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {topCards.map((c) => {
                  const card =
                    gameId === "pokemon"
                      ? POKEMON_BASE_SET_BY_ID.get(c.card_id)
                      : null;
                  return (
                    <div
                      key={c.card_id}
                      className="rounded-lg border border-white/10 bg-black/30 p-2"
                    >
                      {card && "image" in card && card.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={card.image}
                          alt={card.name}
                          className="h-32 w-full rounded border border-white/10 object-contain"
                        />
                      ) : (
                        <div className="flex h-32 w-full items-center justify-center rounded border border-white/10 bg-white/[0.02] text-[10px] text-zinc-500">
                          {c.card_id}
                        </div>
                      )}
                      <div className="mt-1.5 truncate text-xs font-bold text-zinc-100">
                        {card?.name ?? c.card_id}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[10px] text-zinc-400">
                        <span>{c.decks_count} decks</span>
                        <span className="font-bold text-amber-300">
                          ×{c.total_copies}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!overview ||
          (overview.total_matches === 0 &&
            archetypes.length === 0 &&
            topCards.length === 0) ? (
            <div className="mt-8 rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
              Pas encore assez de données. Les stats apparaîtront dès que
              les premiers matchs seront joués.
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
      <div className="text-[10px] uppercase tracking-widest text-zinc-400">
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  );
}
