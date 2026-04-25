"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  PokemonCardData,
  PokemonEnergyType,
  TcgCardOwned,
  TcgClientMessage,
  TcgGameId,
  TcgPackResult,
  TcgRarity,
  TcgServerMessage,
} from "@shared/types";
import { POKEMON_PACK_TYPES, TCG_GAMES } from "@shared/types";
import type { PokemonPackType } from "@shared/types";
import {
  POKEMON_BASE_SET,
  POKEMON_BASE_SET_BY_ID,
} from "@shared/tcg-pokemon-base";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";

type ConnStatus = "connecting" | "connected" | "disconnected";

const RARITY_TIER: Record<TcgRarity, number> = {
  common: 0,
  energy: 0,
  uncommon: 1,
  rare: 2,
  "holo-rare": 3,
};

const RARITY_LABEL: Record<TcgRarity, string> = {
  common: "Commune",
  energy: "Énergie",
  uncommon: "Peu commune",
  rare: "Rare",
  "holo-rare": "Holo rare",
};

const RARITY_COLOR: Record<TcgRarity, string> = {
  common: "border-zinc-500/40 text-zinc-200",
  energy: "border-zinc-500/40 text-zinc-200",
  uncommon: "border-emerald-400/50 text-emerald-200",
  rare: "border-sky-400/60 text-sky-200",
  "holo-rare":
    "border-amber-300/70 text-amber-100 shadow-[0_0_24px_rgba(252,211,77,0.45)]",
};

const TYPE_GLYPH: Record<PokemonEnergyType, string> = {
  fire: "🔥",
  water: "💧",
  grass: "🍃",
  lightning: "⚡",
  psychic: "🌀",
  fighting: "👊",
  colorless: "⭐",
};

const TYPE_BG: Record<PokemonEnergyType, string> = {
  fire: "from-orange-500/30 to-red-700/40",
  water: "from-blue-400/30 to-blue-700/40",
  grass: "from-emerald-400/30 to-emerald-700/40",
  lightning: "from-yellow-400/30 to-yellow-600/40",
  psychic: "from-fuchsia-400/30 to-purple-700/40",
  fighting: "from-amber-700/30 to-stone-700/40",
  colorless: "from-zinc-300/20 to-zinc-500/30",
};

export function TcgClient({
  profile,
  gameId,
}: {
  profile: Profile | null;
  gameId: TcgGameId;
}) {
  const game = TCG_GAMES[gameId];
  const pool = gameId === "pokemon" ? POKEMON_BASE_SET : [];
  const cardById = gameId === "pokemon" ? POKEMON_BASE_SET_BY_ID : new Map();

  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [gold, setGold] = useState<number>(profile?.gold ?? 0);
  const [collection, setCollection] = useState<Map<string, number>>(
    new Map(),
  );
  const [freePacks, setFreePacks] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<TcgPackResult | null>(null);

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
      handleMessage(msg);
    });
    function handleMessage(msg: TcgServerMessage) {
      switch (msg.type) {
        case "tcg-welcome":
          selfIdRef.current = msg.selfId;
          setGold(msg.gold);
          setCollection(
            new Map(msg.collection.map((c) => [c.cardId, c.count])),
          );
          setFreePacks(msg.freePacks);
          break;
        case "tcg-pack-opened":
          setRevealing(msg.pack);
          setCollection((prev) => {
            const next = new Map(prev);
            for (const c of msg.newCounts) next.set(c.cardId, c.count);
            return next;
          });
          setFreePacks(msg.freePacks);
          break;
        case "gold-update":
          setGold(msg.gold);
          break;
        case "tcg-error":
          setErrorMsg(msg.message);
          break;
      }
    }
    return () => {
      cancelled = true;
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
    };
  }, [profile, gameId]);

  const send = useCallback((msg: TcgClientMessage) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const buyPack = useCallback(
    (packTypeId: string) => {
      setErrorMsg(null);
      send({ type: "tcg-buy-pack", packTypeId });
    },
    [send],
  );

  const stats = useMemo(() => {
    const owned = Array.from(collection.values()).filter((n) => n > 0).length;
    const total = pool.length;
    const dupes = Array.from(collection.values()).reduce(
      (s, n) => s + Math.max(0, n - 1),
      0,
    );
    return { owned, total, dupes };
  }, [collection, pool.length]);

  return (
    <div className="flex flex-1 flex-col">
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
          <div className="h-4 w-px bg-white/10" />
          <Link
            href={`/play/tcg/${gameId}/decks`}
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200 transition-colors hover:bg-white/10"
          >
            🃏 Mes decks
          </Link>
          <Link
            href={`/play/tcg/${gameId}/battle`}
            className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-400/20"
          >
            ⚔️ Battle
          </Link>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <StatusIndicator status={status} />
          {profile ? (
            <UserPill profile={{ ...profile, gold }} variant="play" />
          ) : null}
        </div>
      </header>

      <main
        className={`relative flex flex-1 flex-col overflow-auto p-6 ${game.gradient}`}
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

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-zinc-400">
                  Collection
                </div>
                <div className="text-xl font-semibold text-zinc-100">
                  {stats.owned}{" "}
                  <span className="text-sm text-zinc-500">/ {stats.total}</span>
                </div>
              </div>
              <div className="hidden h-8 w-px bg-white/10 md:block" />
              <div className="hidden md:block">
                <div className="text-[11px] uppercase tracking-widest text-zinc-400">
                  Doublons
                </div>
                <div className="text-xl font-semibold text-zinc-100">
                  {stats.dupes}
                </div>
              </div>
              {freePacks > 0 && (
                <>
                  <div className="hidden h-8 w-px bg-white/10 md:block" />
                  <div className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5">
                    <div className="text-[10px] uppercase tracking-widest text-emerald-300">
                      Boosters offerts
                    </div>
                    <div className="text-base font-bold tabular-nums text-emerald-200">
                      🎁 × {freePacks}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-widest text-zinc-400">
                Prix booster
              </div>
              <div className="text-base font-bold tabular-nums text-amber-300">
                {game.packPrice.toLocaleString("fr-FR")} OS
              </div>
            </div>
          </div>

          {/* Pack types chooser */}
          {gameId === "pokemon" && (
            <PokemonPackChooser
              freePacks={freePacks}
              gold={gold}
              packPrice={game.packPrice}
              connected={status === "connected"}
              hasProfile={!!profile}
              onBuy={buyPack}
            />
          )}

          {errorMsg && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          {/* Collection grid */}
          <CollectionGrid
            pool={pool}
            collection={collection}
            cardById={cardById as Map<string, PokemonCardData>}
          />
        </div>

        <AnimatePresence>
          {revealing && (
            <PackRevealOverlay
              key={revealing.id}
              pack={revealing}
              cardById={cardById as Map<string, PokemonCardData>}
              onDone={() => setRevealing(null)}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ─── Pokémon pack chooser ──────────────────────────────────────────────────

function PokemonPackChooser({
  freePacks,
  gold,
  packPrice,
  connected,
  hasProfile,
  onBuy,
}: {
  freePacks: number;
  gold: number;
  packPrice: number;
  connected: boolean;
  hasProfile: boolean;
  onBuy: (packTypeId: string) => void;
}) {
  const packs = Object.values(POKEMON_PACK_TYPES);
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
        Choisis ton booster
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4">
        {packs.map((pack) => (
          <PackTypeCard
            key={pack.id}
            pack={pack}
            freePacks={freePacks}
            gold={gold}
            packPrice={packPrice}
            connected={connected}
            hasProfile={hasProfile}
            onBuy={onBuy}
          />
        ))}
      </div>
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
}: {
  pack: PokemonPackType;
  freePacks: number;
  gold: number;
  packPrice: number;
  connected: boolean;
  hasProfile: boolean;
  onBuy: (packTypeId: string) => void;
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
      <div className="flex items-center justify-center pt-2">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-xl border border-white/10 bg-black/60 text-4xl shadow-inner"
          aria-hidden
        >
          {pack.glyph}
        </div>
      </div>
      <div className="text-center">
        <div className={`text-sm font-semibold ${pack.accent}`}>{pack.name}</div>
        <div className="mt-0.5 line-clamp-2 text-[10px] text-zinc-400">
          {pack.description}
        </div>
      </div>
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
              ? `🎁 Ouvrir (offert)`
              : `${packPrice.toLocaleString("fr-FR")} OS`}
      </button>
    </div>
  );
}

// ─── Collection ────────────────────────────────────────────────────────────

function CollectionGrid({
  pool,
  collection,
  cardById,
}: {
  pool: PokemonCardData[];
  collection: Map<string, number>;
  cardById: Map<string, PokemonCardData>;
}) {
  void cardById;
  const sorted = useMemo(() => {
    return [...pool].sort((a, b) => {
      const ar = RARITY_TIER[a.rarity] ?? 0;
      const br = RARITY_TIER[b.rarity] ?? 0;
      if (ar !== br) return br - ar;
      return a.name.localeCompare(b.name);
    });
  }, [pool]);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {sorted.map((c) => {
        const count = collection.get(c.id) ?? 0;
        return <CardSlot key={c.id} card={c} count={count} />;
      })}
    </div>
  );
}

function CardSlot({ card, count }: { card: PokemonCardData; count: number }) {
  const owned = count > 0;
  return (
    <div
      className={`relative flex flex-col gap-1 rounded-xl border bg-black/40 p-2 transition-opacity ${
        owned ? RARITY_COLOR[card.rarity] : "border-white/5 opacity-30"
      }`}
    >
      <CardFace card={card} faded={!owned} />
      {count > 1 && (
        <div className="absolute right-2 top-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 shadow">
          ×{count}
        </div>
      )}
    </div>
  );
}

// ─── Reveal overlay ────────────────────────────────────────────────────────

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
  const accent =
    RARITY_COLOR[card.rarity] ?? RARITY_COLOR.common;
  return (
    <button
      onClick={clickable ? onClick : undefined}
      className={`relative h-72 w-48 [perspective:1000px] ${
        clickable ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Back */}
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
        {/* Front */}
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

// ─── Pokemon card visuals ──────────────────────────────────────────────────

function CardFace({
  card,
  faded,
  large,
}: {
  card: PokemonCardData;
  faded?: boolean;
  large?: boolean;
}) {
  if (card.kind === "energy") {
    const bg = TYPE_BG[card.energyType] ?? TYPE_BG.colorless;
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-md bg-gradient-to-b ${bg} ${
          large ? "h-full" : "aspect-[5/7]"
        } p-3 ${faded ? "grayscale" : ""}`}
      >
        <div className={large ? "text-7xl" : "text-4xl"}>{card.art}</div>
        <div className="text-center text-xs font-semibold text-zinc-100">
          {card.name}
        </div>
      </div>
    );
  }
  const bg = TYPE_BG[card.type] ?? TYPE_BG.colorless;
  return (
    <div
      className={`flex flex-col gap-1 rounded-md bg-gradient-to-b ${bg} ${
        large ? "h-full" : "aspect-[5/7]"
      } p-2 ${faded ? "grayscale" : ""}`}
    >
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-semibold text-zinc-100">{card.name}</span>
        <span className="tabular-nums text-rose-200">PV {card.hp}</span>
      </div>
      <div className="flex items-center justify-center rounded bg-black/30 py-3">
        <span className={large ? "text-6xl" : "text-4xl"}>{card.art}</span>
      </div>
      {card.ability && (
        <div className="rounded bg-black/40 px-1.5 py-1 text-[8px] leading-tight text-zinc-100">
          <span className="text-amber-300">★ {card.ability.name}</span>
          {large ? ` — ${card.ability.text}` : ""}
        </div>
      )}
      <div className="flex flex-col gap-0.5 text-[8px] leading-tight">
        {card.attacks.slice(0, large ? 2 : 1).map((a, i) => (
          <div key={i} className="rounded bg-black/40 px-1.5 py-1 text-zinc-100">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-0.5">
                {a.cost.map((c, j) => (
                  <span key={j}>{TYPE_GLYPH[c]}</span>
                ))}
                <span className="ml-1 font-semibold">{a.name}</span>
              </span>
              {a.damage !== undefined && (
                <span className="font-bold text-rose-200">
                  {a.damage}
                  {a.damageSuffix ?? ""}
                </span>
              )}
            </div>
            {large && a.text && (
              <div className="mt-0.5 text-[7px] text-zinc-300">{a.text}</div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between text-[8px] text-zinc-300">
        <span>
          {card.weakness && (
            <>
              <span className="text-rose-300">Faiblesse</span>{" "}
              {TYPE_GLYPH[card.weakness]}×2
            </>
          )}
        </span>
        <span>
          {RARITY_LABEL[card.rarity]}
        </span>
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: ConnStatus }) {
  const color =
    status === "connected"
      ? "bg-emerald-400"
      : status === "connecting"
        ? "bg-amber-400"
        : "bg-rose-400";
  const label =
    status === "connected"
      ? "en ligne"
      : status === "connecting"
        ? "connexion"
        : "hors ligne";
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`}>
        {status === "connected" && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-60`}
          />
        )}
      </span>
      {label}
    </span>
  );
}
