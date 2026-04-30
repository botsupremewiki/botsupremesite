import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { POKEMON_BASE_SET } from "@shared/tcg-pokemon-base";
import { ONEPIECE_BASE_SET } from "@shared/tcg-onepiece-base";
import { RUNETERRA_BASE_SET } from "@shared/tcg-runeterra-base";
import { UserPill } from "@/components/user-pill";

export const dynamic = "force-dynamic";

export default async function TcgGameHub({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  const game = TCG_GAMES[gameId as TcgGameId];

  // Stats serveur (collection, free packs, ELO) si user connecté.
  let owned = 0;
  let totalCards =
    gameId === "pokemon"
      ? POKEMON_BASE_SET.length
      : gameId === "onepiece"
        ? ONEPIECE_BASE_SET.length
        : gameId === "lol"
          ? RUNETERRA_BASE_SET.filter((c) => c.collectible).length
          : 0;
  let deckCount = 0;
  let freePacks = 0;
  let elo: number | null = null;
  const deckSizeLabel =
    gameId === "lol"
      ? "40 cartes (Runeterra)"
      : gameId === "onepiece"
        ? "50 cartes + 1 Leader (One Piece TCG)"
        : "20 cartes (Pocket)";
  const notImplemented = gameId === "lol" || gameId === "onepiece";

  if (profile) {
    const supabase = await createClient();
    if (supabase) {
      const [colRes, deckRes, profRes] = await Promise.all([
        supabase
          .from("tcg_cards_owned")
          .select("card_id,count")
          .eq("user_id", profile.id)
          .eq("game_id", gameId),
        supabase
          .from("tcg_decks")
          .select("id")
          .eq("user_id", profile.id)
          .eq("game_id", gameId),
        supabase
          .from("profiles")
          .select("tcg_free_packs,tcg_elo")
          .eq("id", profile.id)
          .single(),
      ]);
      owned = ((colRes.data ?? []) as { count: number }[]).filter(
        (r) => r.count > 0,
      ).length;
      deckCount = (deckRes.data ?? []).length;
      const prof = profRes.data as
        | {
            tcg_free_packs?: Record<string, number> | null;
            tcg_elo?: Record<string, number> | null;
          }
        | null;
      freePacks = prof?.tcg_free_packs?.[gameId] ?? 0;
      elo = prof?.tcg_elo?.[gameId] ?? null;
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/tcg"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← TCG
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">{game.tagline}</span>
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
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          {profile && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Or Suprême"
                value={profile.gold.toLocaleString("fr-FR")}
                accent="text-amber-300"
              />
              <StatTile
                label="Collection"
                value={`${owned}`}
                suffix={`/ ${totalCards}`}
                accent="text-zinc-100"
              />
              <StatTile
                label="Boosters offerts"
                value={`🎁 ${freePacks}`}
                accent={freePacks > 0 ? "text-emerald-300" : "text-zinc-500"}
                highlight={freePacks > 0}
              />
              <StatTile
                label="ELO classé"
                value={elo !== null ? String(elo) : "—"}
                accent="text-violet-300"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MenuButton
              href={`/play/tcg/${gameId}/boosters`}
              icon="🎴"
              title="Boosters"
              description={
                freePacks > 0
                  ? `${freePacks} booster${freePacks > 1 ? "s" : ""} gratuit${freePacks > 1 ? "s" : ""} en attente`
                  : "Achète des packs thématiques"
              }
              accent="text-amber-200"
              border="border-amber-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.10),transparent_70%)]"
              highlight={freePacks > 0}
            />
            <MenuButton
              href={`/play/tcg/${gameId}/collection`}
              icon="📚"
              title="Ma Collection"
              description={`${owned} / ${totalCards} cartes — tri / recherche / filtres`}
              accent="text-zinc-100"
              border="border-white/20"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.04),transparent_70%)]"
            />
            <MenuButton
              href={`/play/tcg/${gameId}/decks`}
              icon="🛠️"
              title="Mes Decks"
              description={`${deckCount} deck${deckCount > 1 ? "s" : ""} sauvegardé${deckCount > 1 ? "s" : ""} — éditeur ${deckSizeLabel}`}
              accent="text-violet-200"
              border="border-violet-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(167,139,250,0.10),transparent_70%)]"
            />
            <MenuButton
              href={`/play/tcg/${gameId}/battle/bot`}
              icon="🤖"
              title="Combat vs Bot Suprême"
              description="Entraînement vs IA — bat-le 3× pour 1 booster gratuit"
              accent="text-emerald-200"
              border="border-emerald-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.10),transparent_70%)]"
            />
            <MenuButton
              href={`/play/tcg/${gameId}/battle/pvp`}
              icon="🆚"
              title="Combat JcJ"
              description="Match amical sans classement"
              accent="text-sky-200"
              border="border-sky-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.10),transparent_70%)]"
            />
            <MenuButton
              href={`/play/tcg/${gameId}/battle/ranked`}
              icon="🏆"
              title="Combat JcJ classé"
              description={
                elo !== null ? `ELO ${elo} — historique + stats` : "Système ELO — historique + stats"
              }
              accent="text-rose-200"
              border="border-rose-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.10),transparent_70%)]"
            />
            <MenuButton
              href={`/play/tcg/${gameId}/market`}
              icon="💱"
              title="Marché de cartes"
              description="Achète / vends · favoris · tri & recherche"
              accent="text-emerald-200"
              border="border-emerald-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.10),transparent_70%)]"
            />
            {(gameId === "onepiece" || gameId === "lol") && (
              <MenuButton
                href={`/play/tcg/${gameId}/regles`}
                icon="📖"
                title="Règles & Tutoriel"
                description={
                  gameId === "lol"
                    ? "Mana, attack token, mots-clés, combat, level-up champions"
                    : "Phases, mots-clés, combat, récompenses, tutoriel pas-à-pas"
                }
                accent="text-amber-200"
                border="border-amber-400/40"
                gradient="bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.10),transparent_70%)]"
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function StatTile({
  label,
  value,
  suffix,
  accent,
  highlight,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 backdrop-blur-sm ${
        highlight
          ? "border-emerald-400/40 bg-emerald-400/10"
          : "border-white/10 bg-black/40"
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest text-zinc-400">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${accent}`}>
        {value}
        {suffix && (
          <span className="ml-1 text-xs font-normal text-zinc-500">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function MenuButton({
  href,
  icon,
  title,
  description,
  accent,
  border,
  gradient,
  highlight,
  comingSoon,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  accent: string;
  border: string;
  gradient: string;
  highlight?: boolean;
  comingSoon?: boolean;
}) {
  const className = `group flex h-full flex-col gap-2 rounded-xl border p-5 ${border} bg-black/40 ${gradient} ${
    comingSoon
      ? "opacity-50 cursor-not-allowed"
      : "transition-colors hover:bg-white/[0.04]"
  } ${highlight ? "ring-1 ring-amber-400/30" : ""}`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-3xl">{icon}</div>
        {comingSoon && (
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-300">
            Bientôt
          </span>
        )}
      </div>
      <div className={`text-base font-semibold ${accent}`}>{title}</div>
      <div className="text-[11px] leading-relaxed text-zinc-400">
        {description}
      </div>
    </>
  );
  if (comingSoon) return <div className={className}>{content}</div>;
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
