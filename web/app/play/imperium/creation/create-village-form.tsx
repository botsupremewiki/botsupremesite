"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  IMPERIUM_FACTIONS,
  type ImperiumFaction,
} from "@shared/imperium";

const FACTION_IDS: ImperiumFaction[] = ["legion", "horde", "ordre"];

export function CreateVillageForm() {
  const router = useRouter();
  const [faction, setFaction] = useState<ImperiumFaction>("legion");
  const [name, setName] = useState("Mon village");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const f = IMPERIUM_FACTIONS[faction];

  async function submit() {
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase indisponible.");
      return;
    }
    setError(null);
    const { error: rpcErr } = await supabase.rpc("imperium_create_village", {
      p_faction: faction,
      p_name: name,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    startTransition(() => {
      router.push("/play/imperium");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">
          Fonde ton village impérial
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Choisis ta faction et ton nom de village. Le changement de faction
          coûtera 100 000 OS plus tard. Tu reçois 750 de chaque ressource au
          départ et un bouclier de bienvenue de 24h.
        </p>
      </div>

      <section>
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          1. Faction
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FACTION_IDS.map((id) => {
            const data = IMPERIUM_FACTIONS[id];
            const active = faction === id;
            return (
              <button
                key={id}
                onClick={() => setFaction(id)}
                className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? `${data.border} bg-white/[0.04] ring-1 ring-amber-400/40`
                    : "border-white/10 bg-black/40 hover:bg-white/[0.04]"
                } ${data.gradient}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{data.glyph}</span>
                  {active && (
                    <span className="text-[10px] uppercase tracking-widest text-amber-300">
                      Sélectionné
                    </span>
                  )}
                </div>
                <div className={`text-base font-bold ${data.accent}`}>
                  {data.name}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {data.short}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                  {data.role}
                </div>
                <div className="mt-2 text-[10px] text-zinc-500">
                  Muraille : <span className="text-zinc-300">{data.wallSkin}</span> · bonus
                  défense max{" "}
                  <span className="text-zinc-300">
                    +{Math.round(data.wallBonusCap * 100)}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          2. Nom du village
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400/50"
          placeholder="Aurelium, Velkar, Sanctus..."
        />
        <div className="mt-1 text-[10px] text-zinc-500">
          1-30 caractères. Tu pourras le renommer plus tard contre 5 000 OS.
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
          Récap
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{f.glyph}</div>
            <div>
              <div className={`text-base font-bold ${f.accent}`}>
                {name || "(sans nom)"} — {f.name}
              </div>
              <div className="text-[11px] text-zinc-400">
                Spawn aléatoire en périphérie · 750 / 750 / 750 / 750 ·
                bouclier 24h
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={isPending || !name.trim()}
          className="rounded-md bg-amber-500 px-6 py-3 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {isPending ? "Fondation…" : "Fonder mon village"}
        </button>
      </div>
    </div>
  );
}
