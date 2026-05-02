"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PokemonCardData,
  TcgGameId,
  TcgRarity,
  TradeClientMessage,
  TradeServerMessage,
  TradeSlotState,
} from "@shared/types";
import type { Profile } from "@/lib/auth";
import type { FriendSummary } from "../page";

/** Raretés autorisées pour les échanges (aligné Pokemon TCG Pocket) :
 *  ◆ → ◆◆◆◆ + ★ uniquement. Les ★★/★★★/👑 sont trop précieuses. */
const TRADABLE_RARITIES: ReadonlySet<TcgRarity> = new Set<TcgRarity>([
  "diamond-1",
  "diamond-2",
  "diamond-3",
  "diamond-4",
  "star-1",
]);

type ConnStatus = "idle" | "connecting" | "connected" | "disconnected";

/** Onglet Échange : pick d'un ami → connection à la room realtime
 *  trade/{gameId}-{userA}-{userB} → écran 2 slots avec validation
 *  bilatérale. */
export function TradeTab({
  profile,
  gameId,
  pool,
  cardById,
  ownedMap,
  friends,
  tradesRemainingToday,
  onError,
  onCompleted,
}: {
  profile: Profile;
  gameId: TcgGameId;
  pool: PokemonCardData[];
  cardById: Map<string, PokemonCardData>;
  ownedMap: Map<string, number>;
  friends: FriendSummary[];
  tradesRemainingToday: number;
  onError: (msg: string) => void;
  onCompleted: () => void;
}) {
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(
    null,
  );
  const [status, setStatus] = useState<ConnStatus>("idle");
  const [slots, setSlots] = useState<TradeSlotState[]>([]);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const acceptedFriends = useMemo(
    () => friends.filter((f) => f.status === "accepted"),
    [friends],
  );

  const selectedFriend = useMemo(
    () => acceptedFriends.find((f) => f.friend_id === selectedFriendId) ?? null,
    [acceptedFriends, selectedFriendId],
  );

  // Cartes que je peux poser : doublons (count >= 2) avec rareté tradable.
  const myTradableCards = useMemo(() => {
    return pool.filter((c) => {
      if (!TRADABLE_RARITIES.has(c.rarity)) return false;
      const owned = ownedMap.get(c.id) ?? 0;
      return owned >= 2;
    });
  }, [pool, ownedMap]);

  // Identifie mon slot et celui de l'ami dans le payload reçu du serveur.
  const mySlot = useMemo(
    () => slots.find((s) => s.authId === profile.id) ?? null,
    [slots, profile.id],
  );
  const friendSlot = useMemo(
    () => slots.find((s) => s.authId !== profile.id) ?? null,
    [slots, profile.id],
  );

  // Connexion / déconnexion à la room quand on choisit un ami.
  useEffect(() => {
    if (!selectedFriendId) {
      // Cleanup éventuel.
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("idle");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlots([]);
      return;
    }
    // Room id canonique : sort les 2 IDs pour avoir le même nom dans les
    // 2 sens (sinon A entrerait dans une room et B dans une autre).
    const ids = [profile.id, selectedFriendId].sort();
    const roomId = `${gameId}-${ids[0]}-${ids[1]}`;
    const partyHost =
      process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999";
    const scheme =
      partyHost.startsWith("localhost") ||
      partyHost.startsWith("127.") ||
      partyHost.startsWith("192.168.")
        ? "ws"
        : "wss";
    const params = new URLSearchParams();
    params.set("authId", profile.id);
    params.set("name", profile.username);
    params.set("gameId", gameId);
    const url = `${scheme}://${partyHost}/parties/trade/${roomId}?${params.toString()}`;
    setStatus("connecting");
    setSlots([]);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      let msg: TradeServerMessage;
      try {
        msg = JSON.parse(e.data as string) as TradeServerMessage;
      } catch {
        return;
      }
      if (msg.type === "trade-state") {
        setSlots(msg.slots);
      } else if (msg.type === "trade-error") {
        onError(msg.message);
      } else if (msg.type === "trade-completed") {
        onCompleted();
        // Le serveur reset les slots côté state ; le state local va
        // suivre via le prochain trade-state. On peut aussi reset ici.
        setSlots((prev) =>
          prev.map((s) => ({ ...s, cardId: null, validated: false })),
        );
      }
    });
    return () => {
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [selectedFriendId, profile.id, profile.username, gameId, onError, onCompleted]);

  function send(msg: TradeClientMessage) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  function pickCard(cardId: string) {
    send({ type: "trade-put-card", cardId });
    setShowCardPicker(false);
  }
  function clearMyCard() {
    send({ type: "trade-remove-card" });
  }
  function toggleValidate() {
    if (!mySlot) return;
    if (mySlot.validated) send({ type: "trade-unvalidate" });
    else send({ type: "trade-validate" });
  }

  // ─── No friend selected → picker ─────────────────────────────────────
  if (!selectedFriendId) {
    return (
      <div className="flex h-full flex-col items-center gap-4 overflow-y-auto pr-1">
        <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-black/40 p-5">
          <h2 className="text-lg font-bold text-zinc-100">
            🤝 Nouvel échange
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Choisis un ami avec qui échanger 1 carte. Les 2 doivent valider
            pour conclure le trade. Si l&apos;un des 2 retire sa carte, les
            validations sont annulées.
          </p>
          <div className="mt-3 rounded-md border border-sky-400/30 bg-sky-400/5 p-2 text-[11px] text-sky-200">
            ℹ️ Cap{" "}
            <strong className="font-bold">{tradesRemainingToday}/3</strong>{" "}
            échanges restants aujourd&apos;hui. Seules les cartes ◆→★ sont
            échangeables. Tu dois posséder ≥2 exemplaires de ta carte (on
            garde 1 en collection).
          </div>

          {acceptedFriends.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
              Tu n&apos;as pas encore d&apos;amis. Va sur{" "}
              <a
                href="/play/amis"
                className="text-amber-300 underline-offset-4 hover:underline"
              >
                /play/amis
              </a>{" "}
              pour ajouter des amis.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {acceptedFriends.map((f) => (
                <button
                  key={f.friend_id}
                  onClick={() => setSelectedFriendId(f.friend_id)}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-amber-400/40 hover:bg-amber-400/5"
                >
                  {f.friend_avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.friend_avatar_url}
                      alt={f.friend_username}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-zinc-300">
                      {f.friend_username[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="font-semibold text-zinc-100">
                      {f.friend_username}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      Cliquer pour ouvrir la room d&apos;échange
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Friend selected → trade room ────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setSelectedFriendId(null)}
          className="text-xs text-zinc-400 hover:text-zinc-100"
        >
          ← Changer d&apos;ami
        </button>
        <span
          className={`text-[11px] ${
            status === "connected"
              ? "text-emerald-300"
              : status === "connecting"
                ? "text-amber-300"
                : "text-rose-300"
          }`}
        >
          {status === "connected" && "🟢 Connecté"}
          {status === "connecting" && "⏳ Connexion…"}
          {status === "disconnected" && "🔴 Déconnecté"}
          {status === "idle" && "—"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TradeSlot
          title="Toi"
          subtitle={profile.username}
          slot={mySlot}
          card={mySlot?.cardId ? cardById.get(mySlot.cardId) ?? null : null}
          isMine
          onPickCard={() => setShowCardPicker(true)}
          onClearCard={clearMyCard}
        />
        <TradeSlot
          title="Ami"
          subtitle={selectedFriend?.friend_username ?? "—"}
          slot={friendSlot}
          card={
            friendSlot?.cardId
              ? cardById.get(friendSlot.cardId) ?? null
              : null
          }
          isMine={false}
        />
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          onClick={toggleValidate}
          disabled={!mySlot?.cardId}
          className={`rounded-md border-2 px-6 py-2.5 text-sm font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            mySlot?.validated
              ? "border-emerald-300/70 bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
              : "border-amber-300/70 bg-amber-500 text-amber-950 hover:bg-amber-400"
          }`}
        >
          {mySlot?.validated ? "✓ Tu as validé (clic pour annuler)" : "Valider l'échange"}
        </button>
        <p className="text-[11px] text-zinc-500">
          {!mySlot?.cardId
            ? "Pose une carte pour pouvoir valider."
            : !friendSlot?.cardId
              ? "En attente que ton ami pose une carte."
              : !mySlot?.validated && !friendSlot?.validated
                ? "Cliquez tous les 2 sur Valider pour exécuter l'échange."
                : !friendSlot?.validated
                  ? "En attente de la validation de ton ami."
                  : !mySlot?.validated
                    ? "Ton ami a validé, à toi de valider."
                    : "Validation des 2 — exécution en cours…"}
        </p>
      </div>

      {showCardPicker && (
        <CardPickerModal
          cards={myTradableCards}
          ownedMap={ownedMap}
          onClose={() => setShowCardPicker(false)}
          onPick={pickCard}
        />
      )}
    </div>
  );
}

function TradeSlot({
  title,
  subtitle,
  slot,
  card,
  isMine,
  onPickCard,
  onClearCard,
}: {
  title: string;
  subtitle: string;
  slot: TradeSlotState | null;
  card: PokemonCardData | null;
  isMine: boolean;
  onPickCard?: () => void;
  onClearCard?: () => void;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-xl border p-4 ${
        slot?.validated
          ? "border-emerald-400/60 bg-emerald-400/5"
          : "border-white/10 bg-black/40"
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-zinc-400">
          {title}
        </span>
        <span className="text-xs font-semibold text-zinc-200">{subtitle}</span>
      </div>
      <div className="relative flex aspect-[5/7] w-44 items-center justify-center rounded-xl border-2 border-dashed border-white/15 bg-black/40">
        {card ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image}
            alt={card.name}
            className="h-full w-full rounded-xl object-contain"
          />
        ) : (
          <span className="text-[11px] text-zinc-500">
            {isMine ? "Aucune carte posée" : "En attente…"}
          </span>
        )}
      </div>
      {isMine && (
        <div className="flex w-full gap-2">
          <button
            onClick={onPickCard}
            className="flex-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/20"
          >
            {card ? "Changer" : "Choisir une carte"}
          </button>
          {card && (
            <button
              onClick={onClearCard}
              className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20"
            >
              Retirer
            </button>
          )}
        </div>
      )}
      <div
        className={`text-[11px] font-semibold ${
          slot?.validated ? "text-emerald-300" : "text-zinc-500"
        }`}
      >
        {slot?.validated ? "✓ Validé" : "○ Non validé"}
      </div>
    </div>
  );
}

function CardPickerModal({
  cards,
  ownedMap,
  onClose,
  onPick,
}: {
  cards: PokemonCardData[];
  ownedMap: Map<string, number>;
  onClose: () => void;
  onPick: (cardId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [cards, search]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-100">
            Choisis une carte à échanger
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100"
          >
            ✕
          </button>
        </div>
        <input
          type="text"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Rechercher dans tes doublons échangeables…"
          className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400/50 focus:outline-none"
        />
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
          {filtered.length === 0 ? (
            <div className="col-span-full rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
              Aucune carte échangeable. Tu dois avoir ≥2 exemplaires d&apos;une
              carte ◆→★ pour pouvoir l&apos;échanger.
            </div>
          ) : (
            filtered.map((c) => {
              const owned = ownedMap.get(c.id) ?? 0;
              return (
                <button
                  key={c.id}
                  onClick={() => onPick(c.id)}
                  className="group relative rounded-lg border border-white/10 bg-black/40 p-1 transition-colors hover:border-amber-400/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.image}
                    alt={c.name}
                    className="aspect-[5/7] w-full rounded object-contain"
                  />
                  <span className="absolute right-1 top-1 rounded-full bg-black/80 px-1.5 py-0.5 text-[9px] font-bold text-zinc-300">
                    ×{owned}
                  </span>
                  <div className="mt-1 truncate text-[10px] text-zinc-300">
                    {c.name}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
