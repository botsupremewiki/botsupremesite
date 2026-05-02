"use client";

/**
 * ProfilePopup : modale full-screen affichable depuis n'importe où.
 *
 * Affiche :
 *   • Avatar + username + date d'inscription
 *   • Stats Pokemon TCG (collection / decks / ELO)
 *   • Album Pokemon en mode CLASSEUR (9 cartes par page, navigation < >)
 *   • Bouton like (1 like par user par album, toggle)
 *   • Bouton "Demander en ami" (réutilise le système friends existant)
 *   • Croix de fermeture en haut à droite
 *
 * La popup est rendue par <ProfilePopupHost /> qui consomme le context.
 * Pour l'ouvrir : useProfilePopup().open(username).
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { POKEMON_BASE_SET, POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import type { PokemonCardData } from "@shared/types";
import { useProfilePopup } from "./profile-popup-context";

/** Nombre de cartes par page d'album (3×3 grille type classeur). */
const ALBUM_PAGE_SIZE = 9;

type ProfileData = {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
  is_admin?: boolean;
};

type CollectionEntry = {
  card_id: string;
  count: number;
};

type LikesData = {
  total: number;
  liked_by_me: boolean;
};

export function ProfilePopupHost() {
  const { current, close } = useProfilePopup();
  return (
    <AnimatePresence>
      {current && <ProfilePopup username={current} onClose={close} />}
    </AnimatePresence>
  );
}

function ProfilePopup({
  username,
  onClose,
}: {
  username: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionEntry[]>([]);
  const [likes, setLikes] = useState<LikesData>({
    total: 0,
    liked_by_me: false,
  });
  const [albumPage, setAlbumPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);

  // Echap pour fermer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Charge le profil + collection + likes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      if (!supabase) {
        if (!cancelled) {
          setError("Supabase indisponible");
          setLoading(false);
        }
        return;
      }
      // 1) Profile par username.
      const { data: profData } = await supabase
        .from("profiles")
        .select("id,username,avatar_url,created_at,is_admin")
        .eq("username", username)
        .maybeSingle();
      if (cancelled) return;
      if (!profData) {
        setError(`Joueur "${username}" introuvable`);
        setLoading(false);
        return;
      }
      const p = profData as ProfileData;
      setProfile(p);
      // 2) Mon user id (pour disable le like sur soi-même + bouton ami).
      const { data: meData } = await supabase.auth.getUser();
      if (!cancelled && meData?.user) {
        setMe({ id: meData.user.id });
      }
      // 3) Collection publique de la cible (RPC bypasse RLS).
      const { data: colData } = await supabase.rpc("get_public_collection", {
        p_target_id: p.id,
        p_game_id: "pokemon",
      });
      if (!cancelled) {
        setCollection((colData as CollectionEntry[]) ?? []);
      }
      // 4) Likes.
      const { data: likesData } = await supabase.rpc("get_collection_likes", {
        p_target_id: p.id,
        p_game_id: "pokemon",
      });
      if (!cancelled && likesData && typeof likesData === "object") {
        setLikes(likesData as LikesData);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, username]);

  // Liste triée des Pokémon dans la collection (ordre Pokédex).
  const ownedCards = useMemo(() => {
    const ownedIds = new Set(collection.map((c) => c.card_id));
    return POKEMON_BASE_SET
      .filter((c) => ownedIds.has(c.id))
      .sort((a, b) => {
        // Tri par pokedexId puis par numéro de carte du set.
        const ap = a.kind === "pokemon" ? a.pokedexId ?? 9999 : 9999;
        const bp = b.kind === "pokemon" ? b.pokedexId ?? 9999 : 9999;
        if (ap !== bp) return ap - bp;
        return a.number - b.number;
      });
  }, [collection]);

  // Total cartes uniques dans le set actif (pour afficher "X / Y").
  const totalCardsInSet = POKEMON_BASE_SET.length;
  const totalPages = Math.max(1, Math.ceil(ownedCards.length / ALBUM_PAGE_SIZE));
  const pageCards = ownedCards.slice(
    albumPage * ALBUM_PAGE_SIZE,
    (albumPage + 1) * ALBUM_PAGE_SIZE,
  );

  // Toggle like.
  async function toggleLike() {
    if (!supabase || !profile || busy) return;
    if (me?.id === profile.id) {
      setActionFeedback("Tu ne peux pas liker ton propre album");
      return;
    }
    setBusy(true);
    setActionFeedback(null);
    const { data, error: rpcErr } = await supabase.rpc(
      "toggle_collection_like",
      { p_target_id: profile.id, p_game_id: "pokemon" },
    );
    setBusy(false);
    if (rpcErr) {
      setActionFeedback(rpcErr.message);
      return;
    }
    const r = data as { liked: boolean; total: number } | null;
    if (r) {
      setLikes({ total: r.total, liked_by_me: r.liked });
    }
  }

  // Demander en ami.
  async function sendFriendRequest() {
    if (!supabase || !profile || busy) return;
    if (me?.id === profile.id) return;
    setBusy(true);
    setActionFeedback(null);
    const { error: rpcErr } = await supabase.rpc("friend_request", {
      p_target: profile.id,
    });
    setBusy(false);
    setActionFeedback(rpcErr ? rpcErr.message : "Demande envoyée ✓");
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
      >
        {/* Bouton fermer */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-zinc-900 p-2 text-zinc-200 shadow ring-1 ring-white/20 transition-colors hover:bg-zinc-800"
          aria-label="Fermer"
        >
          ✕
        </button>

        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
            Chargement du profil…
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center text-sm text-rose-300">
            {error}
          </div>
        ) : profile ? (
          <div className="flex min-h-0 flex-col overflow-y-auto">
            {/* Header : avatar + username + date + likes */}
            <div className="flex items-center gap-4 border-b border-white/5 bg-gradient-to-br from-indigo-950/50 to-zinc-950 p-5">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.username}
                  className="h-16 w-16 rounded-full border-2 border-white/20 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/20 bg-zinc-800 text-2xl">
                  👤
                </div>
              )}
              <div className="flex-1">
                <h2
                  className={`text-xl font-bold ${
                    profile.is_admin ? "text-rose-300" : "text-zinc-100"
                  }`}
                >
                  {profile.username}
                  {profile.is_admin && (
                    <span className="ml-2 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-300">
                      admin
                    </span>
                  )}
                </h2>
                <div className="mt-0.5 text-xs text-zinc-500">
                  Membre depuis{" "}
                  {new Date(profile.created_at).toLocaleDateString("fr-FR", {
                    year: "numeric",
                    month: "long",
                  })}
                </div>
                <a
                  href={`/u/${encodeURIComponent(profile.username)}`}
                  className="mt-1 inline-block text-[11px] text-amber-300 underline-offset-4 hover:underline"
                >
                  Voir le profil complet →
                </a>
              </div>
              {/* Boutons d'action — uniquement si on regarde quelqu'un d'autre */}
              {me && me.id !== profile.id && (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={sendFriendRequest}
                    disabled={busy}
                    className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
                  >
                    🤝 Demander en ami
                  </button>
                </div>
              )}
            </div>

            {/* Stats Pokemon TCG */}
            <div className="grid grid-cols-2 gap-2 border-b border-white/5 bg-black/20 px-5 py-3 text-xs sm:grid-cols-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Collection
                </div>
                <div className="text-base font-bold tabular-nums text-zinc-100">
                  {ownedCards.length}{" "}
                  <span className="text-xs font-normal text-zinc-500">
                    / {totalCardsInSet}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Likes album
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleLike}
                    disabled={busy || me?.id === profile.id}
                    title={
                      me?.id === profile.id
                        ? "Tu ne peux pas liker ton propre album"
                        : likes.liked_by_me
                          ? "Retirer le like"
                          : "Liker cet album"
                    }
                    className={`text-xl transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50 ${
                      likes.liked_by_me ? "" : "grayscale"
                    }`}
                    aria-label={
                      likes.liked_by_me ? "Retirer le like" : "Liker l'album"
                    }
                  >
                    ❤️
                  </button>
                  <span className="text-base font-bold tabular-nums text-rose-300">
                    {likes.total}
                  </span>
                </div>
              </div>
            </div>

            {actionFeedback && (
              <div className="border-b border-white/5 bg-emerald-500/10 px-5 py-2 text-xs text-emerald-300">
                {actionFeedback}
              </div>
            )}

            {/* Album classeur — 9 cartes par page */}
            <div className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-200">
                  📒 Album Pokémon
                </h3>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <button
                      onClick={() => setAlbumPage((p) => Math.max(0, p - 1))}
                      disabled={albumPage === 0}
                      className="rounded border border-white/10 bg-white/5 px-2 py-1 text-zinc-200 hover:bg-white/10 disabled:opacity-30"
                      aria-label="Page précédente"
                    >
                      ◀
                    </button>
                    <span className="tabular-nums">
                      Page {albumPage + 1} / {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setAlbumPage((p) => Math.min(totalPages - 1, p + 1))
                      }
                      disabled={albumPage >= totalPages - 1}
                      className="rounded border border-white/10 bg-white/5 px-2 py-1 text-zinc-200 hover:bg-white/10 disabled:opacity-30"
                      aria-label="Page suivante"
                    >
                      ▶
                    </button>
                  </div>
                )}
              </div>

              {ownedCards.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
                  Album vide — ce joueur n&apos;a encore aucune carte.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 rounded-lg border-2 border-amber-700/40 bg-gradient-to-br from-amber-950/30 to-zinc-950 p-3">
                  {pageCards.map((card) => (
                    <AlbumSlot key={card.id} card={card} />
                  ))}
                  {/* Padding empty slots pour garder grille 3×3 même si dernière page incomplète */}
                  {Array.from({
                    length: ALBUM_PAGE_SIZE - pageCards.length,
                  }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="aspect-[5/7] rounded border-2 border-dashed border-zinc-700/40 bg-black/20"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

function AlbumSlot({ card }: { card: PokemonCardData }) {
  return (
    <div
      className="relative aspect-[5/7] overflow-hidden rounded border-2 border-amber-700/30 bg-black/40 transition-transform hover:scale-[1.04] hover:border-amber-400/60"
      title={card.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.image}
        alt={card.name}
        className="h-full w-full object-contain"
        loading="lazy"
      />
    </div>
  );
}

// Helper exports — utiliser POKEMON_BASE_SET_BY_ID externalement si besoin.
export { POKEMON_BASE_SET_BY_ID };
