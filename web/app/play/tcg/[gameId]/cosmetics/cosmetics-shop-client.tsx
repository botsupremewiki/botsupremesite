"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ONEPIECE_BASE_SET_BY_ID } from "@shared/tcg-onepiece-base";
import type {
  CosmeticItem,
  CosmeticType,
} from "@shared/tcg-onepiece-cosmetics";

const TABS: { type: CosmeticType; label: string; emoji: string }[] = [
  { type: "avatar", label: "Avatars", emoji: "👤" },
  { type: "sleeve", label: "Sleeves", emoji: "🃏" },
  { type: "playmat", label: "Playmats", emoji: "🗺️" },
];

export function CosmeticsShopClient({
  gameId,
  profileId,
  initialGold,
  ownedKeys,
  activeAvatar,
  activeSleeve,
  activePlaymat,
  catalog,
}: {
  gameId: string;
  profileId: string;
  initialGold: number;
  ownedKeys: string[];
  activeAvatar: string;
  activeSleeve: string;
  activePlaymat: string;
  catalog: CosmeticItem[];
}) {
  const [tab, setTab] = useState<CosmeticType>("avatar");
  const [gold, setGold] = useState(initialGold);
  const [owned, setOwned] = useState<Set<string>>(new Set(ownedKeys));
  const [active, setActive] = useState({
    avatar: activeAvatar,
    sleeve: activeSleeve,
    playmat: activePlaymat,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const items = catalog.filter((c) => c.type === tab);

  async function buy(item: CosmeticItem) {
    if (item.price > gold) {
      setError("Or Suprême insuffisant.");
      return;
    }
    setError(null);
    setBusy(`buy-${item.type}-${item.id}`);
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase indisponible.");
      setBusy(null);
      return;
    }
    const { data, error: rpcErr } = await supabase.rpc("buy_tcg_cosmetic", {
      p_user_id: profileId,
      p_game_id: gameId,
      p_cosmetic_type: item.type,
      p_cosmetic_id: item.id,
      p_price: item.price,
    });
    setBusy(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const res = data as
      | { ok: true; gold: number }
      | { ok: false; reason: string };
    if (!res.ok) {
      setError(`Achat refusé : ${res.reason}`);
      return;
    }
    setGold(res.gold);
    setOwned((prev) => new Set(prev).add(`${item.type}:${item.id}`));
    router.refresh();
  }

  async function equip(item: CosmeticItem) {
    setError(null);
    setBusy(`equip-${item.type}-${item.id}`);
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase indisponible.");
      setBusy(null);
      return;
    }
    const { data, error: rpcErr } = await supabase.rpc("equip_tcg_cosmetic", {
      p_user_id: profileId,
      p_game_id: gameId,
      p_cosmetic_type: item.type,
      p_cosmetic_id: item.id,
    });
    setBusy(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const res = data as { ok: true } | { ok: false; reason: string };
    if (!res.ok) {
      setError(`Équipement refusé : ${res.reason}`);
      return;
    }
    setActive((prev) => ({ ...prev, [item.type]: item.id }));
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {TABS.map((t) => (
          <button
            key={t.type}
            onClick={() => setTab(t.type)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              tab === t.type
                ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
                : "border-white/10 bg-black/20 text-zinc-300 hover:border-white/20"
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
        <div className="ml-auto rounded-full border border-amber-400/30 bg-amber-400/5 px-3 py-1 text-xs text-amber-200">
          ⚱ {gold.toLocaleString("fr-FR")} OS
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const key = `${item.type}:${item.id}`;
          const isOwned = item.id === "default" || owned.has(key);
          const isActive = active[item.type] === item.id;
          const isBusy = busy === `buy-${key}` || busy === `equip-${key}`;

          // Pour avatars, on affiche l'image du Leader si défini.
          const leaderMeta = item.leaderCardId
            ? ONEPIECE_BASE_SET_BY_ID.get(item.leaderCardId)
            : null;

          return (
            <div
              key={key}
              className={`relative flex flex-col gap-2 rounded-lg border p-3 transition-all ${
                isActive
                  ? "border-emerald-400/60 bg-emerald-400/10 shadow-[0_0_20px_rgba(52,211,153,0.2)]"
                  : isOwned
                    ? "border-amber-400/40 bg-amber-400/5"
                    : "border-white/10 bg-black/30"
              }`}
            >
              {/* Aperçu */}
              <div className="flex h-32 items-center justify-center overflow-hidden rounded-md bg-zinc-950/60">
                {item.type === "avatar" && leaderMeta ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={leaderMeta.image}
                    alt={item.name}
                    className="h-full object-contain"
                  />
                ) : item.type === "sleeve" ? (
                  <div
                    className={`h-24 w-16 rounded-md border-2 border-white/20 bg-gradient-to-br ${
                      item.sleeveColor ?? "from-rose-900 to-rose-950"
                    } shadow-inner`}
                  >
                    <div className="flex h-full items-center justify-center text-2xl">
                      {item.emoji}
                    </div>
                  </div>
                ) : item.type === "playmat" ? (
                  <div className="flex h-full w-full items-center justify-center text-5xl">
                    {item.emoji}
                  </div>
                ) : (
                  <div className="text-5xl">{item.emoji}</div>
                )}
              </div>

              {/* Infos */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{item.emoji}</span>
                  <span className="font-bold text-zinc-100">{item.name}</span>
                  {isActive && (
                    <span className="ml-auto rounded-full bg-emerald-400/20 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                      ÉQUIPÉ
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">{item.description}</p>
              </div>

              {/* Action */}
              <div className="mt-auto pt-2">
                {!isOwned ? (
                  <button
                    onClick={() => buy(item)}
                    disabled={isBusy || item.price > gold}
                    className="w-full rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm font-bold text-amber-100 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBusy
                      ? "..."
                      : `🛒 Acheter (${item.price.toLocaleString("fr-FR")} OS)`}
                  </button>
                ) : isActive ? (
                  <div className="w-full rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-center text-sm font-bold text-emerald-100">
                    ✓ Équipé
                  </div>
                ) : (
                  <button
                    onClick={() => equip(item)}
                    disabled={isBusy}
                    className="w-full rounded-md border border-zinc-400/40 bg-zinc-400/10 px-3 py-1.5 text-sm font-bold text-zinc-100 hover:bg-zinc-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBusy ? "..." : "⚙️ Équiper"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
