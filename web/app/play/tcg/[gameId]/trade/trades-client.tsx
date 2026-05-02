"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PokemonCardData, TcgRarity } from "@shared/types";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import type { TradeRow } from "./page";

type TradeCard = { cardId: string; count: number };

/** Raretés autorisées pour les échanges (aligné Pokemon TCG Pocket) :
 *  • ◆ → ◆◆◆◆ : toutes raretés losanges (commune → rare ex)
 *  • ★ : Full Art simple
 *
 *  PAS autorisées : ★★, ★★★, 👑 (full art alt, immersive, couronne).
 *  Ces raretés sont trop précieuses pour permettre le trade libre. */
const TRADABLE_RARITIES: ReadonlySet<TcgRarity> = new Set<TcgRarity>([
  "diamond-1",
  "diamond-2",
  "diamond-3",
  "diamond-4",
  "star-1",
]);

/** Indique si une carte peut être échangée selon sa rareté. */
function isCardTradable(card: PokemonCardData | undefined): boolean {
  if (!card) return false;
  return TRADABLE_RARITIES.has(card.rarity);
}

export function TradesClient({
  gameId,
  myUserId,
  collection,
  pool,
  initialTrades,
}: {
  gameId: string;
  myUserId: string;
  collection: { card_id: string; count: number }[];
  pool: PokemonCardData[];
  initialTrades: TradeRow[];
}) {
  const router = useRouter();
  const [trades, setTrades] = useState(initialTrades);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Combien de trades je peux encore initier dans les 24 prochaines
   *  heures (cap = 3/jour). null = pas encore chargé. */
  const [remainingToday, setRemainingToday] = useState<number | null>(null);

  // Charge le compteur de trades restants à l'init et à chaque refresh.
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    (async () => {
      const { data } = await supabase.rpc("tcg_trades_remaining_today", {
        p_game_id: gameId,
      });
      if (typeof data === "number") setRemainingToday(data);
    })();
  }, [gameId, trades]);

  // Refresh : recharge la page pour récupérer les trades à jour.
  const refresh = () => router.refresh();

  const onAccept = async (tradeId: string) => {
    setBusyId(tradeId);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Supabase indisponible.");
        return;
      }
      const { error: err } = await supabase.rpc("accept_trade", {
        p_trade_id: tradeId,
      });
      if (err) {
        setError(err.message);
      } else {
        setTrades((t) => t.filter((tr) => tr.id !== tradeId));
        refresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const onDecline = async (tradeId: string) => {
    setBusyId(tradeId);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Supabase indisponible.");
        return;
      }
      const { error: err } = await supabase.rpc("decline_trade", {
        p_trade_id: tradeId,
      });
      if (err) setError(err.message);
      else setTrades((t) => t.filter((tr) => tr.id !== tradeId));
    } finally {
      setBusyId(null);
    }
  };

  const onCancel = async (tradeId: string) => {
    setBusyId(tradeId);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Supabase indisponible.");
        return;
      }
      const { error: err } = await supabase.rpc("cancel_trade", {
        p_trade_id: tradeId,
      });
      if (err) setError(err.message);
      else setTrades((t) => t.filter((tr) => tr.id !== tradeId));
    } finally {
      setBusyId(null);
    }
  };

  // Trades reçus (à valider) vs envoyés (en attente).
  const received = useMemo(
    () => trades.filter((t) => !t.is_sender),
    [trades],
  );
  const sent = useMemo(() => trades.filter((t) => t.is_sender), [trades]);

  return (
    <div className="mt-6 space-y-6">
      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* ─── Trades reçus ─── */}
      <section>
        <h2 className="text-lg font-bold text-zinc-100">📬 Reçus</h2>
        <p className="text-xs text-zinc-500">
          Trades qui attendent ta validation.
        </p>
        {received.length === 0 ? (
          <div className="mt-2 rounded-md border border-dashed border-white/10 p-3 text-xs text-zinc-500">
            Aucun trade en attente.
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {received.map((t) => (
              <TradeCardView
                key={t.id}
                trade={t}
                meSendsLeft={false}
                busy={busyId === t.id}
                onAccept={() => onAccept(t.id)}
                onDecline={() => onDecline(t.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ─── Trades envoyés ─── */}
      <section>
        <h2 className="text-lg font-bold text-zinc-100">📤 Envoyés</h2>
        <p className="text-xs text-zinc-500">
          Trades en attente que l&apos;autre joueur valide.
        </p>
        {sent.length === 0 ? (
          <div className="mt-2 rounded-md border border-dashed border-white/10 p-3 text-xs text-zinc-500">
            Aucun trade en attente.
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {sent.map((t) => (
              <TradeCardView
                key={t.id}
                trade={t}
                meSendsLeft={true}
                busy={busyId === t.id}
                onCancel={() => onCancel(t.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ─── Nouvelle proposition ─── */}
      <section>
        {!showForm ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowForm(true)}
              disabled={remainingToday === 0}
              title={
                remainingToday === 0
                  ? "Limite de 3 trades par 24h atteinte. Reviens demain ou annule un trade en attente."
                  : undefined
              }
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 shadow-lg hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              + Nouvelle proposition
            </button>
            {remainingToday !== null && (
              <span
                className={`text-xs ${
                  remainingToday === 0
                    ? "text-rose-300"
                    : remainingToday === 1
                      ? "text-amber-300"
                      : "text-zinc-400"
                }`}
              >
                <span className="font-bold tabular-nums">
                  {remainingToday}
                </span>{" "}
                / 3 trade{remainingToday > 1 ? "s" : ""} restant
                {remainingToday > 1 ? "s" : ""} aujourd&apos;hui
              </span>
            )}
          </div>
        ) : (
          <NewTradeForm
            gameId={gameId}
            collection={collection}
            pool={pool}
            onCancel={() => setShowForm(false)}
            onSent={() => {
              setShowForm(false);
              refresh();
            }}
            myUserId={myUserId}
          />
        )}
      </section>
    </div>
  );
}

/** Mini-affichage d'une carte avec image + count, utilisé dans
 *  TradeCardView pour montrer les cartes offertes / demandées. */
function MiniCard({ cardId, count }: { cardId: string; count: number }) {
  const data = POKEMON_BASE_SET_BY_ID.get(cardId);
  if (!data) {
    return (
      <div className="flex h-20 w-14 items-center justify-center rounded border border-white/10 bg-black/40 text-[10px] text-zinc-500">
        ?
      </div>
    );
  }
  return (
    <div className="relative" title={`${data.name} ×${count}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.image}
        alt={data.name}
        className="h-20 w-14 rounded object-contain shadow"
      />
      {count > 1 && (
        <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
          ×{count}
        </span>
      )}
    </div>
  );
}

function TradeCardView({
  trade,
  meSendsLeft,
  busy,
  onAccept,
  onDecline,
  onCancel,
}: {
  trade: TradeRow;
  /** Si true : MES cartes (offertes par moi) à gauche. Si false : leurs
   *  cartes à gauche, mes cartes (demandées) à droite. */
  meSendsLeft: boolean;
  busy: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}) {
  const leftLabel = meSendsLeft
    ? `Tu offres à ${trade.recipient_username}`
    : `${trade.sender_username} t'offre`;
  const rightLabel = meSendsLeft
    ? `Tu demandes à ${trade.recipient_username}`
    : `Il/Elle te demande`;
  const leftCards = trade.offered_cards;
  const rightCards = trade.requested_cards;

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-400">
            {leftLabel}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {leftCards.map((c, i) => (
              <MiniCard key={i} cardId={c.cardId} count={c.count} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-400">
            {rightLabel}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rightCards.map((c, i) => (
              <MiniCard key={i} cardId={c.cardId} count={c.count} />
            ))}
          </div>
        </div>
      </div>
      {trade.message && (
        <div className="mt-2 rounded border border-white/5 bg-white/[0.02] p-2 text-xs italic text-zinc-300">
          &laquo; {trade.message} &raquo;
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        {onAccept && (
          <button
            onClick={onAccept}
            disabled={busy}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            ✓ Accepter
          </button>
        )}
        {onDecline && (
          <button
            onClick={onDecline}
            disabled={busy}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-rose-500/20 disabled:opacity-40"
          >
            Refuser
          </button>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-rose-500/20 disabled:opacity-40"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}

/** Formulaire de création d'un trade. 2 listes : mes cartes (offered) et
 *  toutes les cartes du set (requested). Ergonomie minimale : on clique
 *  sur une carte pour l'ajouter (count=1 par défaut), re-clic = retire. */
function NewTradeForm({
  gameId,
  collection,
  pool,
  onCancel,
  onSent,
}: {
  gameId: string;
  myUserId: string;
  collection: { card_id: string; count: number }[];
  pool: PokemonCardData[];
  onCancel: () => void;
  onSent: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [offered, setOffered] = useState<Map<string, number>>(new Map());
  const [requested, setRequested] = useState<Map<string, number>>(new Map());
  const [searchOffer, setSearchOffer] = useState("");
  const [searchReq, setSearchReq] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Cartes offertes : seulement celles que je possède en doublon (au moins
  // 2) — on garde toujours au moins 1 exemplaire dans la collection. Sinon
  // l'échange viderait la carte (frustrant si rare).
  // Restriction Pocket : seules les raretés ◆ → ★ peuvent être échangées
  // (cf. TRADABLE_RARITIES en haut du fichier). Les ★★, ★★★, 👑 sont
  // exclues parce que trop précieuses.
  const ownedDoubles = useMemo(
    () =>
      collection
        .filter((c) => c.count >= 2)
        .map((c) => ({
          card: POKEMON_BASE_SET_BY_ID.get(c.card_id),
          owned: c.count,
        }))
        .filter((x): x is { card: PokemonCardData; owned: number } => !!x.card)
        .filter(({ card }) => isCardTradable(card)),
    [collection],
  );

  const filteredOffer = useMemo(() => {
    const q = searchOffer.trim().toLowerCase();
    return ownedDoubles.filter(
      ({ card }) => !q || card.name.toLowerCase().includes(q),
    );
  }, [ownedDoubles, searchOffer]);

  const filteredReq = useMemo(() => {
    const q = searchReq.trim().toLowerCase();
    return pool
      .filter((c) => isCardTradable(c))
      .filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [pool, searchReq]);

  const offeredEntries = Array.from(offered.entries()).filter(
    ([, n]) => n > 0,
  );
  const requestedEntries = Array.from(requested.entries()).filter(
    ([, n]) => n > 0,
  );

  function bumpOffered(cardId: string, max: number) {
    setOffered((m) => {
      const next = new Map(m);
      const cur = next.get(cardId) ?? 0;
      // Cap à max-1 pour garder toujours 1 exemplaire en collection.
      next.set(cardId, Math.min(cur + 1, max - 1));
      return next;
    });
  }
  function bumpRequested(cardId: string) {
    setRequested((m) => {
      const next = new Map(m);
      next.set(cardId, (next.get(cardId) ?? 0) + 1);
      return next;
    });
  }
  function clearOffered(cardId: string) {
    setOffered((m) => {
      const next = new Map(m);
      next.delete(cardId);
      return next;
    });
  }
  function clearRequested(cardId: string) {
    setRequested((m) => {
      const next = new Map(m);
      next.delete(cardId);
      return next;
    });
  }

  const submit = async () => {
    setErr(null);
    if (!recipient.trim()) {
      setErr("Saisis le pseudo du destinataire.");
      return;
    }
    if (offeredEntries.length === 0) {
      setErr("Sélectionne au moins une carte à offrir.");
      return;
    }
    if (requestedEntries.length === 0) {
      setErr("Sélectionne au moins une carte à demander.");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      if (!supabase) {
        setErr("Supabase indisponible.");
        return;
      }
      const { error: e } = await supabase.rpc("create_trade", {
        p_game_id: gameId,
        p_recipient_username: recipient.trim(),
        p_offered: offeredEntries.map(([cardId, count]) => ({ cardId, count })),
        p_requested: requestedEntries.map(([cardId, count]) => ({
          cardId,
          count,
        })),
        p_message: message.trim() || null,
      });
      if (e) setErr(e.message);
      else onSent();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-400/40 bg-black/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-zinc-100">
          ✉️ Nouvelle proposition
        </h3>
        <button
          onClick={onCancel}
          className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
        >
          Annuler
        </button>
      </div>
      {/* Note sur les restrictions de rareté (alignée Pokemon TCG Pocket) */}
      <div className="mt-2 rounded-md border border-sky-400/30 bg-sky-400/5 p-2 text-[11px] text-sky-200">
        ℹ️ Seules les cartes <strong>◆ Communes</strong> à <strong>★ Full
        Art</strong> peuvent être échangées. Les ★★, ★★★ et 👑 sont
        exclues. Limite de <strong>3 trades par jour</strong>.
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Pseudo du destinataire"
          className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400/50 focus:outline-none"
        />
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message (optionnel)"
          className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400/50 focus:outline-none"
        />
      </div>

      {/* Sélection : cartes offertes */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-amber-300">
              📤 Cartes offertes ({offeredEntries.reduce((s, [, n]) => s + n, 0)})
            </span>
            <input
              type="text"
              value={searchOffer}
              onChange={(e) => setSearchOffer(e.target.value)}
              placeholder="🔍 Filtrer mes doublons…"
              className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-zinc-100"
            />
          </div>
          {/* Sélectionnées */}
          <div className="mb-2 flex flex-wrap gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/5 p-2 min-h-12">
            {offeredEntries.length === 0 && (
              <span className="text-[10px] italic text-zinc-500">
                Clique une carte ci-dessous pour l&apos;offrir.
              </span>
            )}
            {offeredEntries.map(([cid, n]) => (
              <button
                key={cid}
                onClick={() => clearOffered(cid)}
                title="Cliquer pour retirer"
                className="rounded"
              >
                <MiniCard cardId={cid} count={n} />
              </button>
            ))}
          </div>
          {/* Disponibles (mes doublons) */}
          <div className="grid max-h-64 grid-cols-3 gap-1 overflow-y-auto rounded border border-white/5 bg-black/30 p-2 sm:grid-cols-4">
            {filteredOffer.map(({ card, owned }) => {
              const taken = offered.get(card.id) ?? 0;
              const canAdd = taken < owned - 1; // garde toujours 1 en collection
              return (
                <button
                  key={card.id}
                  onClick={() => canAdd && bumpOffered(card.id, owned)}
                  disabled={!canAdd}
                  title={`${card.name} — possédées ${owned}, offertes ${taken}/${owned - 1}`}
                  className={`relative rounded transition-transform ${
                    canAdd ? "hover:scale-105" : "opacity-40 cursor-not-allowed"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.image}
                    alt={card.name}
                    className="h-20 w-14 rounded object-contain"
                  />
                  <span className="absolute right-0 top-0 rounded-bl bg-black/80 px-1 text-[9px] font-bold text-zinc-300">
                    {owned}
                  </span>
                </button>
              );
            })}
            {filteredOffer.length === 0 && (
              <div className="col-span-full text-center text-[11px] text-zinc-500">
                {ownedDoubles.length === 0
                  ? "Tu n'as pas de doublons."
                  : "Aucune carte ne correspond."}
              </div>
            )}
          </div>
        </div>

        {/* Sélection : cartes demandées */}
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-emerald-300">
              📥 Cartes demandées ({requestedEntries.reduce((s, [, n]) => s + n, 0)})
            </span>
            <input
              type="text"
              value={searchReq}
              onChange={(e) => setSearchReq(e.target.value)}
              placeholder="🔍 Filtrer le set complet…"
              className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-zinc-100"
            />
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/5 p-2 min-h-12">
            {requestedEntries.length === 0 && (
              <span className="text-[10px] italic text-zinc-500">
                Clique une carte ci-dessous pour la demander.
              </span>
            )}
            {requestedEntries.map(([cid, n]) => (
              <button
                key={cid}
                onClick={() => clearRequested(cid)}
                title="Cliquer pour retirer"
                className="rounded"
              >
                <MiniCard cardId={cid} count={n} />
              </button>
            ))}
          </div>
          <div className="grid max-h-64 grid-cols-3 gap-1 overflow-y-auto rounded border border-white/5 bg-black/30 p-2 sm:grid-cols-4">
            {filteredReq.slice(0, 60).map((card) => (
              <button
                key={card.id}
                onClick={() => bumpRequested(card.id)}
                title={card.name}
                className="rounded transition-transform hover:scale-105"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.image}
                  alt={card.name}
                  className="h-20 w-14 rounded object-contain"
                />
              </button>
            ))}
            {filteredReq.length === 0 && (
              <div className="col-span-full text-center text-[11px] text-zinc-500">
                Aucune carte ne correspond.
              </div>
            )}
          </div>
        </div>
      </div>

      {err && (
        <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">
          {err}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
        >
          Annuler
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          {submitting ? "Envoi…" : "✉️ Envoyer la proposition"}
        </button>
      </div>
    </div>
  );
}
