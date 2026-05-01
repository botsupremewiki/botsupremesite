"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import { createClient } from "@/lib/supabase/client";

type PoolEntry = {
  id: string;
  opener_username: string | null;
  pack_type: string | null;
  cards: string[];
  created_at: string;
};

type PickResult = {
  card_id: string;
  opener_username: string | null;
  pack_type: string | null;
  remaining_crystals: number;
};

export function WonderPickClient({
  gameId,
  initialCrystals,
  poolPreview,
}: {
  gameId: string;
  initialCrystals: number;
  poolPreview: PoolEntry[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [crystals, setCrystals] = useState(initialCrystals);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PickResult | null>(null);

  async function pick() {
    setBusy(true);
    setError(null);
    setResult(null);
    const supabase = createClient();
    if (!supabase) {
      setBusy(false);
      return;
    }
    const { data, error: rpcErr } = await supabase.rpc(
      "wonder_pick_perform",
      { p_game_id: gameId },
    );
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as PickResult;
    setResult(r);
    setCrystals(r.remaining_crystals);
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* ── Cristaux + bouton pick ──────────────────────────────── */}
      <div className="rounded-xl border border-fuchsia-300/40 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-fuchsia-200/70">
              Cristaux disponibles
            </div>
            <div className="text-3xl font-bold text-fuchsia-100">
              💎 {crystals}{" "}
              <span className="text-base font-normal text-zinc-400">/ 10</span>
            </div>
          </div>
          <button
            type="button"
            disabled={busy || crystals <= 0}
            onClick={pick}
            className="rounded-md border border-fuchsia-400/60 bg-fuchsia-400/10 px-4 py-2 text-sm font-bold text-fuchsia-100 transition-colors hover:bg-fuchsia-400/20 disabled:opacity-50"
          >
            {busy ? "…" : crystals > 0 ? "🎲 Lancer la pioche" : "Pas de cristal"}
          </button>
        </div>
      </div>

      {/* ── Résultat ────────────────────────────────────────────── */}
      {result ? (
        <div className="rounded-xl border border-emerald-400/40 bg-gradient-to-b from-emerald-400/10 to-emerald-400/5 p-5 text-center">
          <div className="text-2xl">✨</div>
          <div className="mt-1 text-sm text-emerald-200">
            Pioche réussie ! Tu as gagné :
          </div>
          <CardPreview cardId={result.card_id} large />
          <div className="mt-2 text-xs text-zinc-400">
            Pack ouvert par {result.opener_username ?? "?"}
            {result.pack_type ? ` (${result.pack_type})` : ""}
          </div>
        </div>
      ) : null}
      {error ? <div className="text-xs text-rose-300">{error}</div> : null}

      {/* ── Pool preview ────────────────────────────────────────── */}
      {poolPreview.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-5">
          <h2 className="text-sm font-bold text-zinc-100">
            🎴 Packs récents dans le pool
          </h2>
          <p className="mt-1 text-[11px] text-zinc-500">
            Aperçu des 5 derniers packs ouverts par d&apos;autres joueurs.
            La pioche est aléatoire parmi tout le pool (jusqu&apos;à 100
            packs récents).
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {poolPreview.map((p) => (
              <div
                key={p.id}
                className="rounded-md border border-white/10 bg-white/[0.02] p-2"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-zinc-200">
                    {p.opener_username ?? "?"}
                  </span>
                  <span className="text-zinc-500">
                    {p.pack_type ?? "—"} · il y a{" "}
                    {timeAgo(p.created_at)}
                  </span>
                </div>
                <div className="mt-1.5 flex gap-1">
                  {p.cards.map((cardId, i) => (
                    <CardPreview key={i} cardId={cardId} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
          Pool vide. Reviens quand d&apos;autres joueurs auront ouvert
          des packs.
        </div>
      )}
    </div>
  );
}

function CardPreview({
  cardId,
  large = false,
}: {
  cardId: string;
  large?: boolean;
}) {
  const card = POKEMON_BASE_SET_BY_ID.get(cardId);
  const size = large ? "h-44 w-32" : "h-16 w-12";
  if (card && "image" in card && card.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={card.image}
        alt={card.name}
        className={`${size} rounded border border-white/10 object-contain`}
      />
    );
  }
  return (
    <div
      className={`${size} flex items-center justify-center rounded border border-white/10 bg-white/[0.02] text-[9px] text-zinc-500`}
    >
      {cardId}
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}
