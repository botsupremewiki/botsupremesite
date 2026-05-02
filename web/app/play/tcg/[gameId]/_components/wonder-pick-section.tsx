"use client";

/**
 * Wonder Pick — section intégrée dans la page boosters.
 *
 * Spec utilisateur :
 *   • 1 carte par membre dans le pool global (la "best card" de leur
 *     dernier pack GRATUIT ouvert). Pas les achats OS.
 *   • Si un membre ré-ouvre un pack gratuit, son entrée est REMPLACÉE.
 *   • 5 cartes mélangées s'affichent (face cachée) à chaque démarrage
 *     d'une session.
 *   • 1 Wonder Pick par jour par utilisateur (cooldown 24h glissantes).
 *   • Le user CHOISIT 1 dos sur 5 (vraie pick — pas un random serveur).
 *   • Au pick : reveal animé + carte créditée à sa collection.
 */

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import { CardZoomModal } from "./card-visuals";

type WonderPickStatus = {
  can_pick: boolean;
  hours_until_reset: number;
  pool_size: number;
};

type WonderPickResult = {
  card_id: string;
  opener_username: string;
};

/** Statut par défaut affiché tant que la RPC n'a pas répondu OU si elle
 *  échoue (RPC manquante = SQL pas encore exécuté, etc). On affiche
 *  toujours la section pour que l'user comprenne la mécanique, même si
 *  rien n'est dispo pour l'instant. */
const FALLBACK_STATUS: WonderPickStatus = {
  can_pick: false,
  hours_until_reset: 0,
  pool_size: 0,
};

export function WonderPickSection({ gameId }: { gameId: string }) {
  // null = pas encore résolu (1er render). On utilise un state séparé
  // `statusReady` pour distinguer "en cours de chargement" vs "résolu
  // avec valeurs 0". Évite le bug "Chargement..." infini si la RPC
  // n'existe pas (cas du SQL pas encore exécuté).
  const [status, setStatus] = useState<WonderPickStatus>(FALLBACK_STATUS);
  const [statusReady, setStatusReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  /** Ordre random fixe pendant la session — on shuffle 0-4 à chaque
   *  start pour rendre le pick visuellement aléatoire (le user ne doit
   *  pas pouvoir deviner quelle carte est où). */
  const [cardOrder, setCardOrder] = useState<number[]>([]);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<WonderPickResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomCard, setZoomCard] = useState<string | null>(null);

  // Charge le statut au mount. Si la RPC échoue (ex. SQL pas exécuté
  // ou réseau down), on reste sur FALLBACK_STATUS et on marque
  // statusReady=true pour SORTIR de l'état "chargement".
  const fetchStatus = useCallback(async () => {
    const sb = createClient();
    if (!sb) {
      setStatusReady(true);
      return;
    }
    try {
      const { data, error: rpcErr } = await sb.rpc("wonder_pick_status", {
        p_game_id: gameId,
      });
      if (rpcErr) {
        // RPC manquante (SQL pas exécuté) ou non-auth → on garde le
        // fallback mais on ne bloque pas l'affichage.
        console.warn("[wonder-pick] status RPC error:", rpcErr.message);
      } else if (data && typeof data === "object") {
        setStatus(data as WonderPickStatus);
      }
    } catch (err) {
      console.warn("[wonder-pick] status threw:", err);
    } finally {
      setStatusReady(true);
    }
  }, [gameId]);
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function startSession() {
    setError(null);
    setLoading(true);
    const sb = createClient();
    if (!sb) {
      setError("Connexion Supabase impossible");
      setLoading(false);
      return;
    }
    const { data, error: rpcErr } = await sb.rpc("wonder_pick_start", {
      p_game_id: gameId,
    });
    setLoading(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as { session_id: string; count: number } | null;
    if (!r) {
      setError("Réponse vide");
      return;
    }
    setSessionId(r.session_id);
    // Shuffle un order de 5 indices (0-4) pour donner un placement visuel
    // aléatoire des dos. Le user clique un dos à une position N (0-4) ;
    // on enverra cardOrder[N] comme p_index à la RPC.
    const order = [0, 1, 2, 3, 4];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    setCardOrder(order);
    setPickedIndex(null);
    setResult(null);
  }

  async function pickCard(visualIndex: number) {
    if (!sessionId || pickedIndex !== null) return;
    setPickedIndex(visualIndex);
    setLoading(true);
    const sb = createClient();
    if (!sb) {
      setError("Connexion Supabase impossible");
      setLoading(false);
      return;
    }
    const realIndex = cardOrder[visualIndex];
    const { data, error: rpcErr } = await sb.rpc("wonder_pick_pick", {
      p_session_id: sessionId,
      p_index: realIndex,
    });
    setLoading(false);
    if (rpcErr) {
      setError(rpcErr.message);
      setPickedIndex(null);
      return;
    }
    const r = data as WonderPickResult | null;
    if (r) {
      setResult(r);
      // Refresh le statut (cooldown maintenant actif).
      void fetchStatus();
    }
  }

  function reset() {
    setSessionId(null);
    setCardOrder([]);
    setPickedIndex(null);
    setResult(null);
    setError(null);
  }

  // Wonder Pick uniquement pour Pokemon en v1 — adapter facilement aux
  // autres jeux en passant un getCardImage générique.
  if (gameId !== "pokemon") return null;

  // Cas 1 : session en cours (5 dos affichés)
  if (sessionId) {
    return (
      <div className="rounded-xl border-2 border-fuchsia-400/60 bg-gradient-to-br from-fuchsia-950/60 to-purple-950/60 p-5 shadow-[0_0_24px_rgba(217,70,239,0.3)]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-fuchsia-100">
            ✨ Wonder Pick — choisis 1 carte sur 5
          </h3>
          {!result && (
            <button
              onClick={reset}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
            >
              Annuler
            </button>
          )}
        </div>
        {!result && (
          <p className="mb-3 text-xs text-fuchsia-200/80">
            Les 5 cartes ci-dessous viennent de joueurs qui ont ouvert un
            booster gratuit. Tape sur celle que tu veux — tu ne sais pas
            laquelle est où, c&apos;est la magie !
          </p>
        )}

        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {[0, 1, 2, 3, 4].map((visualIdx) => {
            const isPicked = pickedIndex === visualIdx;
            const isOtherPicked = pickedIndex !== null && !isPicked;
            return (
              <motion.button
                key={visualIdx}
                onClick={() => pickCard(visualIdx)}
                disabled={pickedIndex !== null || loading}
                animate={
                  isOtherPicked
                    ? { opacity: 0.3, scale: 0.92 }
                    : { opacity: 1, scale: 1 }
                }
                whileHover={pickedIndex === null ? { y: -4, scale: 1.04 } : {}}
                whileTap={pickedIndex === null ? { scale: 0.95 } : {}}
                transition={{ duration: 0.2 }}
                className={`relative aspect-[5/7] overflow-hidden rounded-lg border-2 transition-all ${
                  isPicked
                    ? "border-amber-300/80 ring-4 ring-amber-300/50"
                    : "border-fuchsia-400/40 hover:border-fuchsia-300"
                } ${
                  pickedIndex === null && !loading
                    ? "cursor-pointer"
                    : "cursor-default"
                }`}
              >
                {isPicked && result ? (
                  // Reveal de la carte choisie.
                  <motion.div
                    initial={{ rotateY: 0 }}
                    animate={{ rotateY: 360 }}
                    transition={{ duration: 0.6 }}
                    className="absolute inset-0"
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    {(() => {
                      const card = POKEMON_BASE_SET_BY_ID.get(result.card_id);
                      return card ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={card.image}
                          alt={card.name}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                          ?
                        </div>
                      );
                    })()}
                  </motion.div>
                ) : (
                  // Dos de carte.
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-fuchsia-700 via-purple-800 to-fuchsia-900">
                    <span className="text-4xl">✨</span>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-amber-300/60 bg-amber-400/10 p-4 text-center"
          >
            <div className="text-2xl">🎉</div>
            <div className="text-sm font-bold text-amber-100">
              Tu as obtenu :{" "}
              <span className="text-amber-200">
                {POKEMON_BASE_SET_BY_ID.get(result.card_id)?.name ??
                  result.card_id}
              </span>
            </div>
            <div className="text-xs text-amber-200/70">
              Carte offerte par{" "}
              <span className="font-semibold">{result.opener_username}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setZoomCard(result.card_id)}
                className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-zinc-100 hover:bg-white/10"
              >
                🔍 Voir la carte
              </button>
              <button
                onClick={reset}
                className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-100 hover:bg-emerald-400/20"
              >
                ✓ Fermer
              </button>
            </div>
          </motion.div>
        )}

        {error && (
          <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        {zoomCard && (
          <CardZoomModal
            card={POKEMON_BASE_SET_BY_ID.get(zoomCard) ?? null}
            onClose={() => setZoomCard(null)}
          />
        )}
      </div>
    );
  }

  // Cas 2 : pas de session — affichage du statut + bouton "Lancer".
  // États possibles :
  //   - statusReady=false → affichage du squelette avec valeurs 0 mais
  //     pas bloquant (l'user voit la section et son explication)
  //   - pool_size < 5 → "Aucun Wonder Pick disponible pour le moment"
  //   - can_pick = false (cooldown) → "Reviens dans Xh"
  //   - can_pick = true && pool >= 5 → bouton actif
  const canPick = statusReady && status.can_pick && status.pool_size >= 5;
  const noPool = statusReady && status.pool_size < 5;
  const onCooldown = statusReady && !status.can_pick;
  return (
    <div className="rounded-xl border-2 border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-950/40 to-purple-950/40 p-5">
      <div className="flex items-start gap-4">
        <div className="text-4xl">✨</div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-fuchsia-100">
            Wonder Pick — 1 par jour
          </h3>
          <p className="mt-1 text-xs text-fuchsia-200/80">
            Choisis 1 carte sur 5 face cachée — la &quot;best card&quot; du
            dernier booster gratuit d&apos;un autre joueur. Tente ta chance
            une fois par jour.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded bg-black/30 px-2 py-0.5 text-zinc-300">
              🎴 Pool :{" "}
              <strong className="text-fuchsia-200">
                {statusReady ? status.pool_size : "…"}
              </strong>{" "}
              joueur{status.pool_size > 1 ? "s" : ""}
            </span>
            {noPool && (
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-200">
                ⌛ Aucun Wonder Pick disponible pour le moment
              </span>
            )}
            {onCooldown && !noPool && (
              <span className="rounded bg-rose-500/20 px-2 py-0.5 text-rose-200">
                ⏳ Reviens dans {Math.ceil(status.hours_until_reset)}h
              </span>
            )}
            {canPick && (
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-200">
                ✓ Disponible !
              </span>
            )}
          </div>
          {noPool && (
            <p className="mt-2 text-[11px] text-zinc-400">
              D&apos;autres joueurs doivent d&apos;abord ouvrir leurs
              boosters gratuits pour alimenter le pool. Reviens un peu
              plus tard.
            </p>
          )}
        </div>
        <button
          onClick={startSession}
          disabled={!canPick || loading}
          title={
            onCooldown
              ? `Cooldown actif — reviens dans ${Math.ceil(status.hours_until_reset)}h`
              : noPool
                ? `Pool insuffisant (${status.pool_size}/5). D'autres joueurs doivent ouvrir des packs gratuits.`
                : undefined
          }
          className="rounded-lg bg-gradient-to-br from-fuchsia-400 to-purple-600 px-5 py-3 text-sm font-extrabold text-fuchsia-50 shadow-[0_4px_16px_rgba(217,70,239,0.4)] transition-all hover:scale-[1.03] hover:from-fuchsia-300 hover:to-purple-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:from-zinc-700 disabled:to-zinc-800 disabled:opacity-50 disabled:shadow-none"
        >
          {loading ? "..." : "✨ Lancer Wonder Pick"}
        </button>
      </div>
      {error && (
        <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}
