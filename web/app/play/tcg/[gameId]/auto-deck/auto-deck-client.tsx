"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type EnrichedCard = {
  cardId: string;
  count: number;
  name: string;
  image: string | null;
};

export function AutoDeckClient({
  gameId,
  name,
  cards,
  energyTypes,
}: {
  gameId: string;
  name: string;
  cards: EnrichedCard[];
  energyTypes: string[];
}) {
  const router = useRouter();
  const [deckName, setDeckName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = cards.reduce((acc, c) => acc + c.count, 0);

  async function save() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setBusy(false);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setError("Non authentifié");
      setBusy(false);
      return;
    }
    const { error: insertErr } = await supabase.from("tcg_decks").insert({
      user_id: userId,
      game_id: gameId,
      name: deckName,
      cards: cards.map((c) => ({ card_id: c.cardId, count: c.count })),
      energy_types: energyTypes,
      leader_id: null,
      regions: null,
    });
    setBusy(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    router.push(`/play/tcg/${gameId}/decks`);
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-bold text-emerald-200">
            ✨ Deck généré
          </div>
          <div className="text-xs text-zinc-400">
            {total} cartes · types : {energyTypes.join(", ")}
          </div>
        </div>
        <input
          type="text"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          maxLength={40}
          className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-emerald-300/40"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {cards.map((c) => (
          <div
            key={c.cardId}
            className="rounded-lg border border-white/10 bg-black/40 p-2"
          >
            {c.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.image}
                alt={c.name}
                className="h-32 w-full rounded border border-white/10 object-contain"
              />
            ) : (
              <div className="flex h-32 w-full items-center justify-center text-[10px] text-zinc-500">
                {c.cardId}
              </div>
            )}
            <div className="mt-1 truncate text-xs font-bold text-zinc-100">
              {c.name}
            </div>
            <div className="text-[10px] text-amber-300">×{c.count}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={busy || !deckName.trim()}
          onClick={save}
          className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
        >
          {busy ? "…" : "💾 Sauvegarder ce deck"}
        </button>
        {error ? <span className="text-xs text-rose-300">{error}</span> : null}
      </div>
    </div>
  );
}
