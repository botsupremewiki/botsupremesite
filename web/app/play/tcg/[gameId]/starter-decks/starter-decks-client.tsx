"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { StarterDeckTemplate } from "@shared/tcg-pokemon-starter-decks";

type Summary = StarterDeckTemplate & {
  missing: { cardId: string; cardName: string; count: number }[];
  adoptable: boolean;
};

export function StarterDecksClient({
  gameId,
  decks,
}: {
  gameId: string;
  decks: Summary[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function adopt(d: Summary) {
    setBusyId(d.id);
    setError(null);
    setToast(null);
    const supabase = createClient();
    if (!supabase) {
      setBusyId(null);
      return;
    }
    // Récupère l'user id pour l'INSERT (RLS only allows own user_id).
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setError("Non authentifié");
      setBusyId(null);
      return;
    }
    const { error: insertErr } = await supabase.from("tcg_decks").insert({
      user_id: userId,
      game_id: gameId,
      name: d.name,
      cards: d.cards.map((c) => ({ card_id: c.cardId, count: c.count })),
      energy_types: d.energyTypes,
      leader_id: null,
      regions: null,
    });
    setBusyId(null);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setToast(`Deck "${d.name}" adopté !`);
    setTimeout(() => router.push(`/play/tcg/${gameId}/decks`), 1000);
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      {decks.map((d) => (
        <div
          key={d.id}
          className={`rounded-xl border p-4 ${
            d.adoptable
              ? "border-emerald-400/40 bg-black/40"
              : "border-white/10 bg-black/40"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="text-4xl">{d.emoji}</div>
            <div className="flex-1">
              <div className="text-base font-bold text-zinc-100">
                {d.name}
              </div>
              <div className="mt-1 text-xs text-zinc-400">{d.description}</div>
              <div className="mt-2 text-[10px] uppercase tracking-widest text-zinc-500">
                {d.cards.length} cartes différentes ·{" "}
                {d.cards.reduce((acc, c) => acc + c.count, 0)} au total
              </div>
            </div>
          </div>
          {!d.adoptable ? (
            <div className="mt-3 rounded-md border border-rose-400/30 bg-rose-400/5 p-2">
              <div className="text-[10px] uppercase tracking-widest text-rose-300">
                Cartes manquantes
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {d.missing.map((m) => (
                  <Link
                    key={m.cardId}
                    href={`/play/tcg/${gameId}/cards/${encodeURIComponent(m.cardId)}`}
                    className="rounded border border-rose-400/30 bg-rose-400/10 px-1.5 py-0.5 text-[11px] text-rose-200 hover:bg-rose-400/20"
                  >
                    {m.cardName} ×{m.count}
                  </Link>
                ))}
              </div>
              <Link
                href={`/play/tcg/${gameId}/boosters`}
                className="mt-2 block text-center text-[11px] text-amber-300 underline-offset-2 hover:underline"
              >
                Ouvre des boosters →
              </Link>
            </div>
          ) : (
            <button
              type="button"
              disabled={busyId === d.id}
              onClick={() => adopt(d)}
              className="mt-3 w-full rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
            >
              {busyId === d.id ? "…" : "✨ Adopter ce deck"}
            </button>
          )}
        </div>
      ))}
      {error ? (
        <div className="text-xs text-rose-300 col-span-full">{error}</div>
      ) : null}
      {toast ? (
        <div className="text-xs text-emerald-300 col-span-full">{toast}</div>
      ) : null}
    </div>
  );
}
