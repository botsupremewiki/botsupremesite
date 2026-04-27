"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  PokemonCardData,
  PokemonPackType,
  TcgClientMessage,
  TcgGameId,
  TcgPackResult,
  TcgServerMessage,
} from "@shared/types";
import { POKEMON_PACK_TYPES, TCG_GAMES } from "@shared/types";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { CardFace, RARITY_COLOR } from "../_components/card-visuals";

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

  const packs = Object.values(POKEMON_PACK_TYPES);

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
                5 cartes par paquet — distribution Pocket-style (≈ 3-4 communes,
                1-2 rares, ~30% chance d&apos;une très rare).
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

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
        <div className={`text-sm font-semibold ${pack.accent}`}>
          {pack.name}
        </div>
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
              ? `🎁 GRATUIT`
              : `${packPrice.toLocaleString("fr-FR")} OS`}
      </button>
    </div>
  );
}

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
