"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDuration } from "@shared/imperium";

type IncomingAttack = {
  march_id: string;
  to_village_id: string;
  to_x: number;
  to_y: number;
  kind: "raid" | "attack" | "conquest";
  arrives_at: string;
};

export function IncomingAttacksAlert() {
  const [attacks, setAttacks] = useState<IncomingAttack[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const supabase = createClient();
      if (!supabase) return;
      const { data } = await supabase.rpc("imperium_get_incoming_attacks");
      if (cancelled) return;
      setAttacks((data ?? []) as IncomingAttack[]);
    }
    poll();
    const t = setInterval(poll, 30_000);
    const t2 = setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(t2);
    };
  }, []);

  void tick;
  if (attacks.length === 0) return null;

  return (
    <section className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-4 animate-pulse-slow">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-2xl">⚠</span>
        <span className="font-bold text-rose-200">
          {attacks.length === 1
            ? "Une attaque arrive !"
            : `${attacks.length} attaques arrivent !`}
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-1 text-xs">
        {attacks.slice(0, 5).map((a) => {
          const remaining = Math.max(
            0,
            Math.floor((new Date(a.arrives_at).getTime() - Date.now()) / 1000),
          );
          return (
            <div
              key={a.march_id}
              className="flex items-center gap-2 rounded border border-rose-400/30 bg-black/40 px-2 py-1"
            >
              <span>{kindGlyph(a.kind)}</span>
              <span className="text-zinc-200">
                {a.kind === "conquest"
                  ? "Tentative de conquête"
                  : a.kind === "attack"
                    ? "Attaque"
                    : "Raid"}
              </span>
              <span className="text-zinc-500">
                sur ({a.to_x}, {a.to_y})
              </span>
              <span className="ml-auto tabular-nums font-bold text-rose-300">
                {formatDuration(remaining)}
              </span>
            </div>
          );
        })}
        {attacks.length > 5 && (
          <div className="text-zinc-500">
            … +{attacks.length - 5} autres
          </div>
        )}
      </div>
    </section>
  );
}

function kindGlyph(kind: string): string {
  switch (kind) {
    case "raid":
      return "💰";
    case "attack":
      return "⚔";
    case "conquest":
      return "👑";
    default:
      return "🚶";
  }
}
