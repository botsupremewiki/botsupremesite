"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TCG_ACHIEVEMENTS,
  tierAccent,
  type Achievement,
} from "@shared/tcg-achievements";
import { createClient } from "@/lib/supabase/client";

const MAX_PINS = 3;

export function PinnableAchievementsGrid({
  unlockedIds,
  unlockedDates,
  initialPins,
}: {
  unlockedIds: string[];
  unlockedDates: Record<string, string>;
  initialPins: string[];
}) {
  const router = useRouter();
  const [pins, setPins] = useState<string[]>(initialPins);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlockedSet = new Set(unlockedIds);

  async function togglePin(id: string) {
    setError(null);
    let next: string[];
    if (pins.includes(id)) {
      next = pins.filter((p) => p !== id);
    } else if (pins.length >= MAX_PINS) {
      setError(`Maximum ${MAX_PINS} achievements épinglés.`);
      return;
    } else {
      next = [...pins, id];
    }
    setPins(next);
    setBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setBusy(false);
      return;
    }
    const { error: rpcErr } = await supabase.rpc("set_pinned_achievements", {
      p_ids: next,
    });
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="mt-1 text-[11px] text-zinc-500">
        Épingle jusqu&apos;à {MAX_PINS} achievements pour les afficher en
        haut de ton profil public.
      </div>
      {error ? (
        <div className="mt-1 text-xs text-rose-300">{error}</div>
      ) : null}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TCG_ACHIEVEMENTS.map((ach: Achievement) => {
          const unlocked = unlockedSet.has(ach.id);
          const date = unlockedDates[ach.id];
          const pinned = pins.includes(ach.id);
          return (
            <div
              key={ach.id}
              className={`relative rounded-lg border p-3 transition-opacity ${
                unlocked
                  ? tierAccent(ach.tier)
                  : "border-white/5 bg-black/30 opacity-50"
              } ${pinned ? "ring-2 ring-amber-300/50" : ""}`}
            >
              {unlocked ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => togglePin(ach.id)}
                  title={pinned ? "Désépingler" : "Épingler sur mon profil"}
                  className={`absolute right-1.5 top-1.5 rounded px-1 text-[11px] transition-colors ${
                    pinned
                      ? "bg-amber-300/20 text-amber-100"
                      : "bg-black/30 text-zinc-400 hover:bg-amber-300/10 hover:text-amber-200"
                  }`}
                >
                  📌
                </button>
              ) : null}
              <div className="flex items-start gap-2">
                <span className={`text-2xl ${unlocked ? "" : "grayscale"}`}>
                  {ach.icon}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-bold">
                    {ach.name}
                    {unlocked ? (
                      <span className="ml-1 text-[10px] uppercase tracking-widest opacity-70">
                        {ach.tier}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    {ach.description}
                  </div>
                  {unlocked && date ? (
                    <div className="mt-1 text-[10px] text-zinc-500">
                      Débloqué le{" "}
                      {new Date(date).toLocaleDateString("fr-FR")}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
