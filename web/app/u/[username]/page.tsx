import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { ReportButton } from "@/components/report-button";
import { ACHIEVEMENTS } from "@shared/achievements";
import { TCG_ACHIEVEMENTS, tierAccent } from "@shared/tcg-achievements";
import { TCG_GAMES } from "@shared/types";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";

export const dynamic = "force-dynamic";

type PublicTarget = {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
  tcg_elo: Record<string, number> | null;
};

type PublicDeckRow = {
  id: string;
  game_id: string;
  name: string;
  cards: { card_id: string; count: number }[] | null;
  share_code: string | null;
  energy_types: string[] | null;
};

type TcgPlayerStats = {
  elo: number;
  total: number;
  wins: number;
  losses: number;
  ranked_total: number;
  ranked_wins: number;
};

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const decoded = decodeURIComponent(username);
  const me = await getProfile();

  // Si on est l'utilisateur lui-même, on redirige vers la page Profil
  // privée — plus complète.
  if (me && me.username === decoded) {
    redirect("/play/profil");
  }

  const supabase = await createClient();
  let target: PublicTarget | null = null;
  let unlockedCount = 0;
  let streak = 0;
  let pokemonStats: TcgPlayerStats | null = null;
  let pokemonAchievementIds: string[] = [];
  let publicDecks: PublicDeckRow[] = [];

  if (supabase) {
    const { data } = await supabase
      .from("profiles")
      .select("id,username,avatar_url,created_at,tcg_elo")
      .eq("username", decoded)
      .maybeSingle();
    if (data) {
      target = data as PublicTarget;
      const [achievementsRes, dailyRes, statsRes, tcgAchRes, decksRes] =
        await Promise.all([
          supabase
            .from("achievements_progress")
            .select("unlocked_at")
            .eq("user_id", data.id)
            .not("unlocked_at", "is", null),
          supabase
            .from("daily_rewards")
            .select("streak_count")
            .eq("user_id", data.id)
            .maybeSingle(),
          // Stats TCG Pokémon (autres TCGs à ajouter plus tard).
          supabase.rpc("get_tcg_player_stats", {
            p_user_id: data.id,
            p_game_id: "pokemon",
          }),
          supabase.rpc("get_user_achievements", {
            p_user_id: data.id,
            p_game_id: "pokemon",
          }),
          // Decks publics (RLS autorise déjà la lecture des is_public=true).
          supabase
            .from("tcg_decks")
            .select("id,game_id,name,cards,share_code,energy_types")
            .eq("user_id", data.id)
            .eq("is_public", true)
            .order("updated_at", { ascending: false })
            .limit(20),
        ]);
      unlockedCount = achievementsRes.data?.length ?? 0;
      streak =
        (dailyRes.data as { streak_count?: number } | null)?.streak_count ??
        0;
      pokemonStats = (statsRes.data as TcgPlayerStats) ?? null;
      pokemonAchievementIds =
        ((tcgAchRes.data as { achievement_id: string }[]) ?? []).map(
          (a) => a.achievement_id,
        );
      publicDecks = (decksRes.data as PublicDeckRow[]) ?? [];
    }
  }
  const tcgWinrate =
    pokemonStats && pokemonStats.total > 0
      ? Math.round((pokemonStats.wins / pokemonStats.total) * 100)
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Plaza
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold">Profil public</span>
        </div>
        {me ? <UserPill profile={me} variant="play" /> : null}
      </header>
      <main className="flex flex-1 flex-col items-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.06),transparent_60%)] p-6">
        {target ? (
          <div className="flex w-full max-w-3xl flex-col gap-6">
            {/* ─── Carte d'identité ─────────────────────────────────── */}
            <div className="rounded-xl border border-white/10 bg-black/40 p-6">
              <div className="flex items-center gap-4">
                <Avatar url={target.avatar_url} name={target.username} />
                <div>
                  <div className="text-xl font-bold text-zinc-100">
                    {target.username}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    Membre depuis le{" "}
                    {new Date(target.created_at).toLocaleDateString("fr-FR")}
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat
                  label="Achievements"
                  value={`${unlockedCount}/${ACHIEVEMENTS.length}`}
                />
                <Stat label="Streak daily" value={`${streak}/30`} />
                <Stat label="Statut" value="Joueur actif" />
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="text-[11px] text-zinc-500">
                  Plus de détails (gold, inventaire) sont privés. Pour
                  interagir avec ce joueur, utilise les actions sur son
                  pseudo dans le chat.
                </div>
                {me && me.id !== target.id ? (
                  <ReportButton
                    targetId={target.id}
                    targetUsername={target.username}
                  />
                ) : null}
              </div>
            </div>

            {/* ─── Stats TCG Pokémon ────────────────────────────────── */}
            {pokemonStats && pokemonStats.total > 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/40 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-zinc-100">
                    🃏 Stats TCG Pokémon
                  </h2>
                  <span className="text-[11px] uppercase tracking-widest text-zinc-500">
                    {TCG_GAMES.pokemon.name}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat
                    label="ELO"
                    value={String(pokemonStats.elo)}
                    accent="text-amber-300"
                  />
                  <Stat
                    label="Matchs"
                    value={String(pokemonStats.total)}
                  />
                  <Stat
                    label="Victoires"
                    value={String(pokemonStats.wins)}
                    accent="text-emerald-300"
                  />
                  <Stat
                    label="Winrate"
                    value={tcgWinrate !== null ? `${tcgWinrate}%` : "—"}
                    accent={
                      tcgWinrate !== null && tcgWinrate >= 50
                        ? "text-emerald-300"
                        : "text-rose-300"
                    }
                  />
                </div>
                {pokemonStats.ranked_total > 0 ? (
                  <div className="mt-3 text-[11px] text-zinc-500">
                    Classés : {pokemonStats.ranked_wins} /{" "}
                    {pokemonStats.ranked_total}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* ─── Decks publics ────────────────────────────────────── */}
            {publicDecks.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/40 p-6">
                <h2 className="text-lg font-bold text-zinc-100">
                  📤 Decks publics
                  <span className="ml-2 text-sm font-normal text-zinc-500">
                    {publicDecks.length}
                  </span>
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Decks partagés par {target.username}. Copie le code pour
                  importer un deck dans ta collection.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {publicDecks.map((deck) => (
                    <PublicDeckCard key={deck.id} deck={deck} />
                  ))}
                </div>
              </div>
            ) : null}

            {/* ─── Achievements TCG Pokémon ─────────────────────────── */}
            {pokemonAchievementIds.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/40 p-6">
                <h2 className="text-lg font-bold text-zinc-100">
                  🏅 Achievements TCG Pokémon
                  <span className="ml-2 text-sm font-normal text-zinc-500">
                    {pokemonAchievementIds.length} / {TCG_ACHIEVEMENTS.length}
                  </span>
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Badges débloqués en jouant des matchs PvP / classés.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {TCG_ACHIEVEMENTS.filter((ach) =>
                    pokemonAchievementIds.includes(ach.id),
                  ).map((ach) => (
                    <div
                      key={ach.id}
                      className={`rounded-lg border p-3 ${tierAccent(ach.tier)}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-2xl">{ach.icon}</span>
                        <div className="flex-1">
                          <div className="text-sm font-bold">
                            {ach.name}
                            <span className="ml-1 text-[10px] uppercase tracking-widest opacity-70">
                              {ach.tier}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-400">
                            {ach.description}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-rose-400/40 bg-rose-400/5 p-6 text-sm text-rose-200">
            Joueur <span className="font-mono">{decoded}</span> introuvable.
          </div>
        )}
      </main>
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="h-16 w-16 rounded-full border border-white/10 object-cover"
      />
    );
  }
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500 text-2xl font-bold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={`text-sm font-bold tabular-nums ${accent ?? "text-zinc-100"}`}
      >
        {value}
      </div>
    </div>
  );
}

function PublicDeckCard({ deck }: { deck: PublicDeckRow }) {
  // Préview : on prend les 3 cartes les plus jouées pour Pokémon (les autres
  // jeux n'ont pas encore d'index image dispo côté client).
  const cards = deck.cards ?? [];
  const totalCards = cards.reduce((acc, c) => acc + (c.count ?? 0), 0);
  const previewIds: string[] = [];
  if (deck.game_id === "pokemon") {
    const sorted = [...cards].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    for (const entry of sorted) {
      if (previewIds.length >= 3) break;
      const card = POKEMON_BASE_SET_BY_ID.get(entry.card_id);
      if (card && "image" in card && card.image) {
        previewIds.push(card.image);
      }
    }
  }
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-zinc-100">
            {deck.name}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
            <span>{deck.game_id}</span>
            <span>·</span>
            <span>{totalCards} cartes</span>
          </div>
        </div>
        {deck.share_code ? (
          <code className="shrink-0 rounded border border-indigo-300/30 bg-indigo-300/10 px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest text-indigo-200">
            🔗 {deck.share_code}
          </code>
        ) : null}
      </div>
      {previewIds.length > 0 ? (
        <div className="mt-2 flex gap-1">
          {previewIds.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              className="h-20 w-14 shrink-0 rounded border border-white/10 object-cover"
            />
          ))}
        </div>
      ) : null}
      {deck.energy_types && deck.energy_types.length > 0 ? (
        <div className="mt-2 flex gap-1 text-[10px] text-zinc-500">
          Énergies :{" "}
          {deck.energy_types.map((t) => (
            <span key={t} className="font-mono">
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
