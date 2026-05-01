"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  PokemonCardData,
  PokemonPackType,
  PokemonPackTypeId,
  TcgClientMessage,
  TcgGameId,
  TcgPackResult,
  TcgRarity,
  TcgServerMessage,
} from "@shared/types";
import { POKEMON_PACK_TYPES, TCG_GAMES } from "@shared/types";
import { POKEMON_BASE_SET, POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import { formatPackRate, pokemonPackRate } from "@shared/tcg-pack-odds";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import {
  CardFace,
  CardZoomModal,
  RARITY_COLOR,
  RARITY_GLYPH,
  RARITY_LABEL,
  RARITY_TIER,
} from "../_components/card-visuals";

type ConnStatus = "connecting" | "connected" | "disconnected";

export function BoostersClient({
  profile,
  gameId,
}: {
  profile: Profile | null;
  gameId: TcgGameId;
}) {
  const game = TCG_GAMES[gameId];
  const cardById = POKEMON_BASE_SET_BY_ID;

  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [gold, setGold] = useState<number>(profile?.gold ?? 0);
  const [freePacks, setFreePacks] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<TcgPackResult | null>(null);
  // Détail booster ouvert (liste des cartes droppables) + zoom carte au sein
  // du détail (modal sur modal).
  const [detailPack, setDetailPack] = useState<PokemonPackTypeId | null>(null);
  const [zoomedCard, setZoomedCard] = useState<PokemonCardData | null>(null);

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
    socketRef.current = ws;
    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: TcgServerMessage;
      try {
        msg = JSON.parse(e.data as string) as TcgServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "tcg-welcome":
          setGold(msg.gold);
          setFreePacks(msg.freePacks);
          break;
        case "tcg-pack-opened":
          setRevealing(msg.pack);
          setFreePacks(msg.freePacks);
          break;
        case "gold-update":
          setGold(msg.gold);
          break;
        case "tcg-error":
          setErrorMsg(msg.message);
          break;
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
    };
  }, [profile, gameId]);

  const buyPack = useCallback((packTypeId: string) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setErrorMsg(null);
    ws.send(
      JSON.stringify({
        type: "tcg-buy-pack",
        packTypeId,
      } as TcgClientMessage),
    );
  }, []);

  // Seuls les packs `active: true` apparaissent. Les nouveaux sets
  // (Mew/Dialga/Palkia) sont désactivés tant que la logique de tirage
  // côté PartyKit ne les supporte pas.
  const packs = Object.values(POKEMON_PACK_TYPES).filter((p) => p.active);

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
          <span className="text-xs text-zinc-500">🎴 Boosters</span>
        </div>
        {profile ? (
          <UserPill profile={{ ...profile, gold }} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main
        className={`relative flex flex-1 flex-col overflow-y-auto p-6 ${game.gradient}`}
      >
        {status !== "connected" && !revealing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="text-sm text-zinc-300">
              {status === "connecting"
                ? "Connexion..."
                : "Connexion perdue — recharger la page."}
            </div>
          </div>
        )}

        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">🎴 Boosters</h1>
              <p className="mt-1 text-sm text-zinc-400">
                5 cartes par paquet · slots 1-3 majoritairement ◆ ·
                slot 4 ◆◆ dominant (12,5% ex, 3,5% étoile+) ·
                slot 5 ◆◆◆ garanti (4% ★, 0,5% 👑).
              </p>
            </div>
            <div className="flex items-center gap-4">
              {freePacks > 0 && (
                <div className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5">
                  <div className="text-[10px] uppercase tracking-widest text-emerald-300">
                    Boosters offerts
                  </div>
                  <div className="text-base font-bold tabular-nums text-emerald-200">
                    🎁 × {freePacks}
                  </div>
                </div>
              )}
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-zinc-400">
                  Prix booster
                </div>
                <div className="text-base font-bold tabular-nums text-amber-300">
                  {game.packPrice.toLocaleString("fr-FR")} OS
                </div>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {packs.map((pack) => (
              <PackTypeCard
                key={pack.id}
                pack={pack}
                freePacks={freePacks}
                gold={gold}
                packPrice={game.packPrice}
                connected={status === "connected"}
                hasProfile={!!profile}
                onBuy={buyPack}
                onShowDetail={() => setDetailPack(pack.id)}
              />
            ))}
          </div>
        </div>

        <AnimatePresence>
          {revealing && (
            <PackRevealOverlay
              key={revealing.id}
              pack={revealing}
              cardById={cardById}
              onDone={() => setRevealing(null)}
            />
          )}
        </AnimatePresence>

        {/* Modal "détail booster" : toutes les cartes droppables groupées par rareté. */}
        {detailPack && (
          <BoosterDetailModal
            packId={detailPack}
            onClose={() => setDetailPack(null)}
            onZoomCard={(c) => setZoomedCard(c)}
          />
        )}

        {/* Zoom carte (depuis le détail booster) — modal au-dessus du détail. */}
        <CardZoomModal card={zoomedCard} onClose={() => setZoomedCard(null)} />
      </main>
    </div>
  );
}

function PackTypeCard({
  pack,
  freePacks,
  gold,
  packPrice,
  connected,
  hasProfile,
  onBuy,
  onShowDetail,
}: {
  pack: PokemonPackType;
  freePacks: number;
  gold: number;
  packPrice: number;
  connected: boolean;
  hasProfile: boolean;
  onBuy: (packTypeId: string) => void;
  onShowDetail: () => void;
}) {
  const useFree = freePacks > 0;
  const canPay = gold >= packPrice;
  const disabled =
    !pack.active || !hasProfile || !connected || (!useFree && !canPay);
  return (
    <div
      className={`relative flex flex-col gap-2 rounded-xl border bg-gradient-to-b from-zinc-900/80 to-black/80 p-3 backdrop-blur-sm transition-opacity ${
        pack.active ? pack.border : "border-white/10 opacity-60"
      }`}
    >
      {!pack.active && (
        <span className="absolute right-2 top-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-300">
          Bientôt
        </span>
      )}
      {/* Zone cliquable (preview) : ouvre le détail du booster. */}
      <button
        onClick={onShowDetail}
        disabled={!pack.active}
        className="flex flex-col gap-2 rounded-lg p-1 text-left transition-colors hover:bg-white/5 disabled:cursor-not-allowed"
        title="Voir les cartes du booster"
      >
        <div className="flex items-center justify-center pt-2">
          <div
            className="flex h-24 w-24 items-center justify-center rounded-xl border border-white/10 bg-black/60 text-5xl shadow-inner"
            aria-hidden
          >
            {pack.glyph}
          </div>
        </div>
        <div className="text-center">
          <div className={`text-base font-semibold ${pack.accent}`}>
            {pack.name}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[10px] text-zinc-400">
            {pack.description}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">
            👁️ Voir les cartes
          </div>
        </div>
      </button>
      <button
        onClick={() => onBuy(pack.id)}
        disabled={disabled}
        className={`mt-1 rounded-md px-3 py-2 text-xs font-bold shadow disabled:cursor-not-allowed disabled:opacity-40 ${
          useFree && pack.active
            ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
            : "bg-amber-500 text-amber-950 hover:bg-amber-400"
        }`}
      >
        {!hasProfile
          ? "Connecte-toi"
          : !pack.active
            ? "Bientôt"
            : useFree
              ? `🎁 OUVRIR GRATUITEMENT`
              : `🎴 OUVRIR — ${packPrice.toLocaleString("fr-FR")} OS`}
      </button>
    </div>
  );
}

/** Modal détail d'un booster : liste toutes les cartes droppables, groupées
 *  par rareté (du plus commun au plus rare). Click sur une carte = zoom modal. */
function BoosterDetailModal({
  packId,
  onClose,
  onZoomCard,
}: {
  packId: PokemonPackTypeId;
  onClose: () => void;
  onZoomCard: (card: PokemonCardData) => void;
}) {
  const pack = POKEMON_PACK_TYPES[packId];
  // Filtre identique à getThemedPool côté serveur :
  //   • pack principal OU extraPacks
  //   • EXCLU : les Dresseurs starter (Potion, Poké Ball, Pokédex…) qui
  //     sont donnés au premier login et non droppables en booster
  const cards = POKEMON_BASE_SET.filter((c) => {
    if (c.kind === "trainer" && c.starter) return false;
    return c.pack === packId || c.extraPacks?.includes(packId);
  });
  // Groupement par rareté, du plus commun au plus rare.
  const RARITY_ORDER: TcgRarity[] = [
    "diamond-1",
    "diamond-2",
    "diamond-3",
    "diamond-4",
    "star-1",
    "star-2",
    "star-3",
    "crown",
    "promo",
  ];
  const grouped: Partial<Record<TcgRarity, PokemonCardData[]>> = {};
  for (const c of cards) {
    if (!grouped[c.rarity]) grouped[c.rarity] = [];
    grouped[c.rarity]!.push(c);
  }
  for (const r of RARITY_ORDER) {
    grouped[r]?.sort((a, b) => {
      const aDex = a.kind === "pokemon" ? (a.pokedexId ?? 999) : 9999;
      const bDex = b.kind === "pokemon" ? (b.pokedexId ?? 999) : 9999;
      return aDex - bDex || a.name.localeCompare(b.name);
    });
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden>
              {pack.glyph}
            </span>
            <div>
              <h2 className={`text-lg font-bold ${pack.accent}`}>{pack.name}</h2>
              <p className="text-xs text-zinc-400">
                {cards.length} cartes droppables · {pack.description}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/5 p-2 text-zinc-300 hover:bg-white/10"
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {RARITY_ORDER.map((rarity) => {
            const list = grouped[rarity];
            if (!list || list.length === 0) return null;
            return (
              <section key={rarity} className="mb-6 last:mb-0">
                <div className="mb-2 flex items-baseline gap-2 border-b border-white/5 pb-1">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${
                      RARITY_COLOR[rarity]
                    }`}
                  >
                    {RARITY_GLYPH[rarity]}
                  </span>
                  <span className="text-sm font-semibold text-zinc-200">
                    {RARITY_LABEL[rarity]}
                  </span>
                  <span className="text-xs text-zinc-500">
                    · {list.length} cartes ·{" "}
                    <span className="text-zinc-400">
                      {formatPackRate(pokemonPackRate(rarity))} par pack
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {list.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => onZoomCard(card)}
                      className={`relative aspect-[5/7] overflow-hidden rounded-md border bg-black/40 transition-transform hover:scale-[1.04] hover:ring-2 hover:ring-white/30 ${
                        RARITY_COLOR[rarity]
                      }`}
                      title={card.name}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={card.image}
                        alt={card.name}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="shrink-0 border-t border-white/10 px-5 py-2 text-center text-[11px] text-zinc-500">
          Trié du plus commun au plus rare · Clique une carte pour la zoomer ·
          {" "}
          <span className="text-zinc-400">
            les ★ et 👑 sont très rares (≪ 5% chance par pack)
          </span>
        </footer>
      </div>
    </div>
  );
}

// Le RARITY_TIER est gardé pour usage potentiel futur (sort par rareté).
void RARITY_TIER;

function PackRevealOverlay({
  pack,
  cardById,
  onDone,
}: {
  pack: TcgPackResult;
  cardById: Map<string, PokemonCardData>;
  onDone: () => void;
}) {
  const [revealedIdx, setRevealedIdx] = useState<number>(-1);
  const cards = pack.cards
    .map((id) => cardById.get(id))
    .filter((c): c is PokemonCardData => !!c);
  const allRevealed = revealedIdx >= cards.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-md"
    >
      <div className="flex w-full max-w-4xl flex-col items-center gap-4">
        <div className="text-[11px] uppercase tracking-widest text-zinc-400">
          Pack ouvert · {cards.length} cartes
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {cards.map((card, i) => (
            <RevealCard
              key={`${pack.id}-${i}`}
              card={card}
              flipped={i <= revealedIdx}
              onClick={() => {
                if (i === revealedIdx + 1) setRevealedIdx(i);
              }}
              clickable={i === revealedIdx + 1}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          {!allRevealed ? (
            <>
              <span className="text-xs text-zinc-400">
                Clique pour révéler la carte suivante
              </span>
              <button
                onClick={() => setRevealedIdx(cards.length - 1)}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
              >
                Tout révéler
              </button>
            </>
          ) : (
            <button
              onClick={onDone}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
            >
              Ajouter à ma collection
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function RevealCard({
  card,
  flipped,
  onClick,
  clickable,
}: {
  card: PokemonCardData;
  flipped: boolean;
  onClick: () => void;
  clickable: boolean;
}) {
  const accent = RARITY_COLOR[card.rarity] ?? RARITY_COLOR["diamond-1"];
  // Rareté élevée → effet visuel dramatique au moment du flip.
  const isRare =
    card.rarity === "star-1" ||
    card.rarity === "star-2" ||
    card.rarity === "star-3" ||
    card.rarity === "crown";
  const isCrown = card.rarity === "crown";
  // Couleur de l'aura selon la rareté.
  const auraColor = isCrown
    ? "shadow-[0_0_60px_rgba(250,204,21,0.8)] ring-yellow-300"
    : card.rarity === "star-3"
      ? "shadow-[0_0_50px_rgba(251,146,60,0.7)] ring-orange-300"
      : card.rarity === "star-2"
        ? "shadow-[0_0_40px_rgba(244,114,182,0.6)] ring-rose-300"
        : "shadow-[0_0_40px_rgba(217,70,239,0.6)] ring-fuchsia-300";

  return (
    <button
      onClick={clickable ? onClick : undefined}
      className={`relative h-72 w-48 [perspective:1000px] ${
        clickable ? "cursor-pointer" : "cursor-default"
      }`}
    >
      {/* Aura pulsante derrière la carte si rare et révélée */}
      {flipped && isRare && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 0.9, 0.6, 0.9, 0.6], scale: [0.8, 1.15, 1.05, 1.15, 1.05] }}
          transition={{ duration: 2, repeat: Infinity, repeatType: "loop" }}
          className={`pointer-events-none absolute inset-0 rounded-xl ring-4 ${auraColor}`}
        />
      )}
      {/* Confettis pour les crown */}
      {flipped && isCrown && (
        <>
          {Array.from({ length: 14 }).map((_, i) => {
            // Direction et délai aléatoires pour chaque particule.
            const angle = (i / 14) * Math.PI * 2;
            const dx = Math.cos(angle) * 120;
            const dy = Math.sin(angle) * 120;
            return (
              <motion.span
                key={i}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  x: dx,
                  y: dy,
                  scale: [0, 1.2, 0.4],
                  rotate: 540,
                }}
                transition={{
                  duration: 1.4,
                  delay: 0.6 + i * 0.04,
                  ease: "easeOut",
                }}
                className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-2xl"
              >
                {i % 3 === 0 ? "✨" : i % 3 === 1 ? "👑" : "⭐"}
              </motion.span>
            );
          })}
        </>
      )}
      <motion.div
        animate={{
          rotateY: flipped ? 180 : 0,
          // Petit shake juste avant la révélation finale pour les rares
          // (anticipation = bonus de drama).
          x:
            flipped && isRare
              ? [0, -3, 3, -2, 2, 0]
              : 0,
        }}
        transition={{
          duration: 0.6,
          ease: [0.2, 0.8, 0.2, 1],
          x: { duration: 0.4, delay: 0.5 },
        }}
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl border border-indigo-400/40 bg-gradient-to-br from-indigo-700 to-indigo-950 shadow-xl"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="text-center">
            <div className="text-3xl">🃏</div>
            <div className="mt-1 text-[10px] uppercase tracking-widest text-indigo-200/70">
              {clickable ? "Cliquer" : ""}
            </div>
          </div>
        </div>
        <div
          className={`absolute inset-0 rounded-xl border-2 bg-zinc-950 p-1 ${accent}`}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <CardFace card={card} large />
        </div>
      </motion.div>
    </button>
  );
}
