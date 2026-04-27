"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Guild = { id: string; name: string; tag: string; level: number; bank_gold: number };

export function SocialClient({
  myGuild,
  allGuilds,
  hasGuild,
}: {
  myGuild: Guild | null;
  allGuilds: Guild[];
  hasGuild: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  async function createGuild() {
    if (!supabase) return;
    setError(null);
    const { error: rpcErr } = await supabase.rpc("eternum_create_guild", {
      p_name: name,
      p_tag: tag,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    router.refresh();
  }
  async function joinGuild(guildId: string) {
    if (!supabase) return;
    setError(null);
    const { error: rpcErr } = await supabase.rpc("eternum_join_guild", {
      p_guild_id: guildId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    router.refresh();
  }
  async function leaveGuild() {
    if (!supabase) return;
    if (!confirm("Quitter ta guilde ?")) return;
    setError(null);
    await supabase.rpc("eternum_leave_guild");
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-hidden">
      {error && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Ma guilde */}
      <section className="shrink-0 rounded-xl border border-emerald-400/30 bg-black/40 p-4">
        <div className="text-[11px] uppercase tracking-widest text-zinc-400">
          Ma guilde
        </div>
        {myGuild ? (
          <div className="mt-2 flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-emerald-200">
                [{myGuild.tag}] {myGuild.name}
              </div>
              <div className="text-xs text-zinc-400">
                Niveau {myGuild.level} · Banque :{" "}
                {myGuild.bank_gold.toLocaleString("fr-FR")} OS
              </div>
            </div>
            <button
              onClick={leaveGuild}
              className="rounded-md bg-rose-500/20 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/30"
            >
              Quitter
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500">
                Nom (3-30 chars)
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100"
              />
            </div>
            <div className="w-24">
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500">
                Tag (2-5)
              </label>
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value.toUpperCase())}
                maxLength={5}
                className="mt-0.5 w-full rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100"
              />
            </div>
            <button
              onClick={createGuild}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
            >
              Créer
            </button>
          </div>
        )}
      </section>

      {/* Liste guildes */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40">
        <div className="shrink-0 border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-400">
          🏰 Guildes existantes (top 20 par niveau)
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {allGuilds.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
              Aucune guilde encore. Crée la première !
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {allGuilds.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between rounded border border-white/5 bg-white/[0.03] px-3 py-2 text-xs"
                >
                  <span>
                    [<span className="text-emerald-300">{g.tag}</span>] {g.name} ·{" "}
                    Niv {g.level}
                  </span>
                  {!hasGuild && (
                    <button
                      onClick={() => joinGuild(g.id)}
                      className="rounded-md bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/30"
                    >
                      Rejoindre
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="shrink-0 rounded-md border border-white/5 bg-white/[0.03] p-3 text-[10px] text-zinc-500">
        Système d&apos;amis (prêt familier 1×/jour) + classements consolidés à
        venir en polish. Boss de guilde : prochain item de roadmap.
      </div>
    </div>
  );
}
