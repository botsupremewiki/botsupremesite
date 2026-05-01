import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { ONEPIECE_COSMETICS } from "@shared/tcg-onepiece-cosmetics";
import { UserPill } from "@/components/user-pill";
import { CosmeticsShopClient } from "./cosmetics-shop-client";

export const dynamic = "force-dynamic";

export default async function TcgCosmeticsPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];
  const profile = await getProfile();

  if (gameId !== "onepiece") {
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
            <span className="text-xs text-zinc-500">🛒 Cosmétiques</span>
          </div>
          {profile ? (
            <UserPill profile={profile} variant="play" />
          ) : (
            <span className="text-xs text-zinc-500">Invité</span>
          )}
        </header>
        <main className={`flex flex-1 flex-col overflow-y-auto p-6 ${game.gradient}`}>
          <p className="text-zinc-400">
            Boutique cosmétiques disponible uniquement pour One Piece TCG.
          </p>
        </main>
      </div>
    );
  }

  if (!profile) {
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
            <span className="text-xs text-zinc-500">🛒 Cosmétiques</span>
          </div>
          <span className="text-xs text-zinc-500">Invité</span>
        </header>
        <main className={`flex flex-1 flex-col overflow-y-auto p-6 ${game.gradient}`}>
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
            Connecte-toi avec Discord pour accéder à la boutique cosmétique.
          </div>
        </main>
      </div>
    );
  }

  // Charge les cosmétiques possédés + actifs.
  const supabase = await createClient();
  let owned: { cosmetic_type: string; cosmetic_id: string }[] = [];
  let active: Record<string, Record<string, string>> = {};
  if (supabase) {
    const [ownedRes, profRes] = await Promise.all([
      supabase
        .from("tcg_cosmetics_owned")
        .select("cosmetic_type,cosmetic_id")
        .eq("user_id", profile.id)
        .eq("game_id", gameId),
      supabase
        .from("profiles")
        .select("tcg_cosmetics_active")
        .eq("id", profile.id)
        .single(),
    ]);
    owned = ownedRes.data ?? [];
    active = (profRes.data as { tcg_cosmetics_active?: typeof active })
      ?.tcg_cosmetics_active ?? {};
  }
  const gameActive = (active[gameId] ?? {}) as Record<string, string>;

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
          <span className="text-xs text-zinc-500">🛒 Cosmétiques</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className={`flex flex-1 flex-col overflow-y-auto p-6 ${game.gradient}`}>
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="font-pirate mb-2 text-5xl tracking-wide text-amber-200">
            🛒 Boutique cosmétique
          </h1>
          <p className="mb-8 text-sm text-zinc-400">
            Personnalise ton apparence : avatars Leader, dos de cartes (sleeves)
            et playmats thématiques One Piece. Pure cosmétique — n&apos;affecte
            pas le gameplay.
          </p>

          <CosmeticsShopClient
            gameId={gameId}
            profileId={profile.id}
            initialGold={profile.gold}
            ownedKeys={owned.map((o) => `${o.cosmetic_type}:${o.cosmetic_id}`)}
            activeAvatar={gameActive.avatar ?? "default"}
            activeSleeve={gameActive.sleeve ?? "default"}
            activePlaymat={gameActive.playmat ?? "default"}
            catalog={ONEPIECE_COSMETICS}
          />
        </div>
      </main>
    </div>
  );
}
