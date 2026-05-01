import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { ONEPIECE_COSMETICS } from "@shared/tcg-onepiece-cosmetics";
import { CosmeticsShopClient } from "./cosmetics-shop-client";

export const dynamic = "force-dynamic";

export default async function TcgCosmeticsPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  if (gameId !== "onepiece") {
    return (
      <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
        <Link
          href={`/play/tcg/${gameId}`}
          className="text-sm text-zinc-400 hover:text-white"
        >
          ← Retour au hub
        </Link>
        <p className="mt-4 text-zinc-400">
          Boutique cosmétiques disponible uniquement pour One Piece TCG.
        </p>
      </div>
    );
  }

  const profile = await getProfile();
  if (!profile) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
        <Link
          href={`/play/tcg/${gameId}`}
          className="text-sm text-zinc-400 hover:text-white"
        >
          ← Retour au hub
        </Link>
        <p className="mt-4 text-zinc-400">Connecte-toi pour accéder à la boutique.</p>
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
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-rose-950/20 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/play/tcg/${gameId}`}
            className="text-sm text-zinc-400 hover:text-white"
          >
            ← Retour au hub
          </Link>
          <div className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-sm">
            <span className="text-amber-300">⚱ </span>
            <span className="text-amber-100">
              {profile.gold.toLocaleString("fr-FR")}
            </span>{" "}
            <span className="text-amber-300">OS</span>
          </div>
        </div>

        <h1 className="font-pirate mb-2 text-5xl tracking-wide text-amber-200">
          🛒 Boutique cosmétique
        </h1>
        <p className="mb-8 text-sm text-zinc-400">
          Personnalise ton apparence : avatars Leader, dos de cartes (sleeves)
          et playmats thématiques One Piece. Pure cosmétique — n'affecte pas
          le gameplay.
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
    </div>
  );
}
