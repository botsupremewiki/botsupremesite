"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_JOBS,
  type EternumJobId,
} from "@shared/types";
import {
  ETERNUM_ITEMS,
  ETERNUM_RESOURCES_BY_ID,
  craftCostFor,
  type ItemTemplate,
} from "@shared/eternum-items";
import { createClient } from "@/lib/supabase/client";
import type { ResourceRow } from "./page";

const JOB_IDS: EternumJobId[] = [
  "blacksmith",
  "tanner",
  "weaver",
  "jeweler",
  "armorer",
  "baker",
];

export function MetiersClient({
  initialJob,
  initialResources,
}: {
  initialJob: EternumJobId | null;
  initialResources: ResourceRow[];
}) {
  const router = useRouter();
  const [job, setJob] = useState<EternumJobId | null>(initialJob);
  const [resources, setResources] = useState<ResourceRow[]>(initialResources);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const resByMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resources) m.set(r.resource_id, r.count);
    return m;
  }, [resources]);

  const recipes = useMemo<ItemTemplate[]>(() => {
    if (!job) return [];
    return ETERNUM_ITEMS.filter((it) => it.craftedBy === job);
  }, [job]);

  async function pickJob(j: EternumJobId) {
    if (!supabase) return;
    setError(null);
    const { error: rpcErr } = await supabase.rpc("eternum_set_job", {
      p_job_id: j,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setJob(j);
    setOkMsg(`Métier : ${ETERNUM_JOBS[j].name}`);
    router.refresh();
  }

  async function craft(item: ItemTemplate) {
    if (!supabase || !item.craftedBy) return;
    setError(null);
    setOkMsg(null);
    const cost = craftCostFor(item);
    const { error: rpcErr } = await supabase.rpc("eternum_craft_item", {
      p_item_id: item.id,
      p_required_job: item.craftedBy,
      p_cost: cost,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    // Décrémente local resources
    setResources((prev) =>
      prev.map((r) => {
        const c = cost.find((x) => x.resourceId === r.resource_id);
        return c ? { ...r, count: r.count - c.count } : r;
      }),
    );
    setOkMsg(`✓ ${item.name} crafté !`);
    router.refresh();
  }

  async function bake() {
    if (!supabase) return;
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("eternum_bake_bread");
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as { energy_gained: number; bread_today: number; cap: number };
    setOkMsg(
      `🍞 +${r.energy_gained} énergie (${r.bread_today}/${r.cap} pains aujourd'hui)`,
    );
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden">
      {/* Sélection métier */}
      <section className="shrink-0 rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          Métier actif (changeable au Prestige)
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {JOB_IDS.map((j) => {
            const cfg = ETERNUM_JOBS[j];
            const active = job === j;
            return (
              <button
                key={j}
                onClick={() => pickJob(j)}
                className={`flex flex-col gap-1 rounded-md border p-3 text-left transition-colors ${
                  active
                    ? "border-amber-400/60 bg-amber-400/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{cfg.glyph}</span>
                  <span className="text-sm font-semibold text-zinc-100">
                    {cfg.name}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400">{cfg.description}</div>
              </button>
            );
          })}
        </div>
      </section>

      {(error || okMsg) && (
        <div
          className={`shrink-0 rounded-md border px-3 py-2 text-sm ${
            error
              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
              : "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
          }`}
        >
          {error ?? okMsg}
        </div>
      )}

      {/* Action spéciale Boulanger */}
      {job === "baker" && (
        <section className="shrink-0 rounded-xl border border-amber-400/40 bg-amber-400/[0.04] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-amber-200">🍞 Cuire du pain</div>
              <div className="text-xs text-zinc-400">
                3 blés → +15 énergie. Cap journalier : 5 pains.
              </div>
            </div>
            <button
              onClick={bake}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400"
            >
              Cuire
            </button>
          </div>
        </section>
      )}

      {/* Recettes + ressources */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-3">
        {/* Recettes */}
        <section className="col-span-2 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <div className="shrink-0 border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-400">
            {job ? `Recettes ${ETERNUM_JOBS[job].name}` : "Choisis un métier"}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {recipes.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
                {job
                  ? "Aucune recette pour ce métier."
                  : "Choisis un métier pour voir les recettes."}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {recipes.map((r) => (
                  <RecipeRow
                    key={r.id}
                    item={r}
                    resByMap={resByMap}
                    onCraft={craft}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Inventaire ressources */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <div className="shrink-0 border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-400">
            🛡️ Ressources
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {resources.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/10 p-3 text-center text-xs text-zinc-500">
                Vide. Drops dans donjons / raids / world boss / aventure idle.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {resources.map((r) => {
                  const meta = ETERNUM_RESOURCES_BY_ID.get(r.resource_id);
                  return (
                    <div
                      key={r.resource_id}
                      className="flex items-center justify-between rounded border border-white/5 bg-white/[0.03] px-2 py-1 text-xs"
                    >
                      <span>
                        {meta?.glyph} {meta?.name ?? r.resource_id}
                      </span>
                      <span className="font-bold tabular-nums text-amber-300">
                        {r.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function RecipeRow({
  item,
  resByMap,
  onCraft,
}: {
  item: ItemTemplate;
  resByMap: Map<string, number>;
  onCraft: (i: ItemTemplate) => void;
}) {
  const cost = craftCostFor(item);
  const canCraft = cost.every((c) => (resByMap.get(c.resourceId) ?? 0) >= c.count);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="flex-1">
        <div className="text-sm font-semibold text-zinc-100">{item.name}</div>
        <div className="text-[10px] text-zinc-500">
          Slot : {item.slot} · Niveau requis : {item.levelRequired}
        </div>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
          {cost.map((c) => {
            const meta = c.resourceId
              ? ETERNUM_RESOURCES_BY_ID.get(c.resourceId)
              : null;
            const have = resByMap.get(c.resourceId) ?? 0;
            const ok = have >= c.count;
            return (
              <span
                key={c.resourceId}
                className={`rounded border px-1.5 py-0.5 ${
                  ok
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                    : "border-rose-400/30 bg-rose-400/10 text-rose-200"
                }`}
              >
                {meta?.glyph} {have}/{c.count}
              </span>
            );
          })}
        </div>
      </div>
      <button
        onClick={() => onCraft(item)}
        disabled={!canCraft}
        className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-40"
      >
        Crafter
      </button>
    </div>
  );
}
