import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ skipTutorial?: string }>;
}) {
  const { gameId } = await params;
  const sp = await searchParams;
  if (!(gameId in TCG_GAMES)) notFound();
  const profile = await getProfile();
  const game = TCG_GAMES[gameId as TcgGameId];

  // Auto-redirect vers le tutoriel pour les 3 TCG (Pokemon, OnePiece, LoL) :
  // si l'user n'a jamais complété le tuto pour ce jeu, on l'envoie
  // automatiquement à sa première visite (sauf si ?skipTutorial=1 dans
  // l'URL — utile pour navigation interne).
  // Le tuto crédite +50 OS + 10 boosters gratuits à la complétion.
  if (
    profile &&
    sp.skipTutorial !== "1" &&
    (gameId === "pokemon" || gameId === "onepiece" || gameId === "lol")
  ) {
    const sb = await createClient();
    if (sb) {
      const { data: doneData } = await sb.rpc("has_completed_tcg_tutorial", {
        p_game_id: gameId,
      });
      if (!doneData) {
        redirect(`/play/tcg/${gameId}/tutorial`);
      }
    }
  }

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
        className={`relative flex flex-1 flex-col overflow-y-auto p-6 ${game.gradient}`}
      >
        {/* Skinning thématique pour le hub OnePiece (vagues + Joly Roger
            en filigrane). */}
        {gameId === "onepiece" && (
          <>
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              aria-hidden="true"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><path d='M0 100 Q 25 50, 50 100 T 100 100 T 150 100 T 200 100' stroke='%23fbbf24' stroke-width='1' fill='none'/><path d='M0 130 Q 25 80, 50 130 T 100 130 T 150 130 T 200 130' stroke='%23dc2626' stroke-width='1' fill='none'/></svg>\")",
                backgroundRepeat: "repeat",
              }}
            />
            <div
              className="pointer-events-none absolute right-8 top-8 text-9xl opacity-[0.06]"
              aria-hidden="true"
            >
              🏴‍☠️
            </div>
          </>
        )}
        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6">
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

          {/* Bannière de bienvenue OnePiece pour le 1er login (free packs
              dispos = nouveau joueur ou n'a pas encore tout consommé). */}
          {gameId === "onepiece" && profile && freePacks >= 5 && (
            <div className="relative overflow-hidden rounded-xl border-2 border-amber-400/40 bg-gradient-to-br from-rose-950/60 via-amber-950/40 to-zinc-950/80 p-5 shadow-[0_0_40px_rgba(251,191,36,0.15)]">
              <div className="pointer-events-none absolute -right-4 -top-4 text-7xl opacity-30">
                🏴‍☠️
              </div>
              <div className="relative">
                <div className="text-xs font-bold uppercase tracking-widest text-amber-300">
                  ⚓ Bienvenue à bord, pirate
                </div>
                <h2 className="font-pirate mt-1 text-3xl tracking-wide text-amber-100">
                  Tu as {freePacks} boosters gratuits qui t'attendent !
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-amber-200/90">
                  Ouvre tes packs pour constituer une collection, monte un
                  deck (1 Leader + 50 cartes), puis pars à l'abordage du{" "}
                  <strong>Bot Suprême</strong> pour t'entraîner. Lis les{" "}
                  <Link
                    href={`/play/tcg/${gameId}/regles`}
                    className="underline hover:text-amber-100"
                  >
                    règles
                  </Link>{" "}
                  si tu débutes.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/play/tcg/${gameId}/boosters`}
                    className="rounded-full border-2 border-amber-300/80 bg-amber-500/20 px-4 py-1.5 text-sm font-bold text-amber-100 hover:bg-amber-500/40"
                  >
                    🎴 Ouvrir mes boosters
                  </Link>
                  <Link
                    href={`/play/tcg/${gameId}/regles`}
                    className="rounded-full border-2 border-amber-300/40 bg-amber-500/5 px-4 py-1.5 text-sm font-bold text-amber-200 hover:bg-amber-500/15"
                  >
                    📖 Lire les règles
                  </Link>
                </div>
              </div>
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
            <MenuButton
              href={`/play/tcg/${gameId}/tutorial`}
              icon="🎓"
              title="Tutoriel guidé"
              description={
                gameId === "pokemon" ||
                gameId === "onepiece" ||
                gameId === "lol"
                  ? "Apprends les bases en 8 étapes. +50 OS et +10 boosters la première fois."
                  : "Apprends les bases en 8 étapes. +50 OS la première fois."
              }
              accent="text-cyan-200"
              border="border-cyan-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.10),transparent_70%)]"
            />
            {(gameId === "onepiece" || gameId === "pokemon") && (
              <MenuButton
                href={`/play/tcg/${gameId}/cosmetics`}
                icon="🛒"
                title="Boutique cosmétique"
                description={
                  gameId === "onepiece"
                    ? "Avatars Leader, sleeves, playmats — pure cosmétique"
                    : "Avatars Pokémon, sleeves par type, playmats, pièces — pure cosmétique"
                }
                accent="text-fuchsia-200"
                border="border-fuchsia-400/40"
                gradient="bg-[radial-gradient(ellipse_at_center,rgba(232,121,249,0.10),transparent_70%)]"
              />
            )}
            <MenuButton
              href={`/play/tcg/${gameId}/replays`}
              icon="📼"
              title="Mes Replays"
              description="Rejoue tes 50 derniers matchs — pause / lecture / vitesse"
              accent="text-indigo-200"
              border="border-indigo-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(129,140,248,0.10),transparent_70%)]"
            />
            <MenuButton
              href={`/play/tcg/${gameId}/tournaments`}
              icon="🏟️"
              title="Tournois"
              description="Rejoins ou crée un tournoi single-elim entre amis"
              accent="text-orange-200"
              border="border-orange-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(251,146,60,0.10),transparent_70%)]"
            />
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
