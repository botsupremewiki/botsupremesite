"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  formatNumber,
  formatDuration,
  imperiumSkipCost,
  type ImperiumVillageRow,
  type ImperiumBuildingRow,
  type ImperiumUnitRow,
  type ImperiumResearchRow,
  type ImperiumForgeRow,
  type ImperiumQueueRow,
} from "@shared/imperium";
import {
  imperiumUnitsByFaction,
  UNIT_BASIC_INFANTRY,
  type ImperiumUnitMeta,
} from "@shared/imperium-units";

type Props = {
  village: ImperiumVillageRow;
  buildings: ImperiumBuildingRow[];
  initialUnits: ImperiumUnitRow[];
  initialResearch: ImperiumResearchRow[];
  initialForge: ImperiumForgeRow[];
  initialQueue: ImperiumQueueRow[];
};

export function MilitaireView({
  village,
  buildings,
  initialUnits,
  initialResearch,
  initialForge,
  initialQueue,
}: Props) {
  const router = useRouter();
  const [units, setUnits] = useState(initialUnits);
  const [research, setResearch] = useState(initialResearch);
  const [forge, setForge] = useState(initialForge);
  const [queue, setQueue] = useState(initialQueue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const factionUnits = useMemo(
    () => imperiumUnitsByFaction(village.faction),
    [village.faction],
  );

  const buildingLevel = (kind: string) =>
    buildings.find((b) => b.kind === kind)?.level ?? 0;

  const isResearched = (unitKind: string) =>
    research.find((r) => r.unit_kind === unitKind)?.researched ?? false;

  const forgeOf = (unitKind: string) =>
    forge.find((f) => f.unit_kind === unitKind) ?? null;

  const unitCount = (unitKind: string) =>
    units.find((u) => u.unit_kind === unitKind)?.count ?? 0;

  const recruiting = (unitKind: string) =>
    units.find((u) => u.unit_kind === unitKind)?.recruiting_count ?? 0;

  const researchInQueue = queue.find((q) => q.kind === "research");
  const forgeInQueue = queue.find((q) => q.kind === "forge");

  async function refresh() {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.rpc("imperium_tick", { p_village_id: village.id });
    const [u, r, f, q] = await Promise.all([
      supabase.from("imperium_units").select("*").eq("village_id", village.id),
      supabase
        .from("imperium_research")
        .select("*")
        .eq("village_id", village.id),
      supabase.from("imperium_forge").select("*").eq("village_id", village.id),
      supabase
        .from("imperium_construction_queue")
        .select("*")
        .eq("village_id", village.id),
    ]);
    if (u.data) setUnits(u.data as ImperiumUnitRow[]);
    if (r.data) setResearch(r.data as ImperiumResearchRow[]);
    if (f.data) setForge(f.data as ImperiumForgeRow[]);
    if (q.data) setQueue(q.data as ImperiumQueueRow[]);
  }

  async function startResearch(unitKind: string) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc("imperium_research_unit", {
        p_village_id: village.id,
        p_unit_kind: unitKind,
      });
      if (rpcErr) throw rpcErr;
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function recruit(unitKind: string, count: number) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc("imperium_recruit", {
        p_village_id: village.id,
        p_unit_kind: unitKind,
        p_count: count,
      });
      if (rpcErr) throw rpcErr;
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function forgeUpgrade(
    unitKind: string,
    axis: "attack" | "defense",
  ) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc("imperium_forge_upgrade", {
        p_village_id: village.id,
        p_unit_kind: unitKind,
        p_axis: axis,
      });
      if (rpcErr) throw rpcErr;
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function skipQueue(qId: string, costOs: number) {
    if (costOs >= 20000) {
      const ok = window.confirm(
        `Skip de ce timer = ${costOs.toLocaleString("fr-FR")} OS. Confirmer ?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc("imperium_skip_timer", {
        p_queue_id: qId,
      });
      if (rpcErr) throw rpcErr;
      await refresh();
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <PrereqBanner
        barracks={buildingLevel("barracks")}
        stable={buildingLevel("stable")}
        workshop={buildingLevel("workshop")}
        academy={buildingLevel("academy")}
        forge={buildingLevel("forge")}
      />

      {researchInQueue && (
        <FilebleRow
          label="Recherche en cours"
          targetKind={researchInQueue.target_kind}
          finishesAt={researchInQueue.finishes_at}
          onSkip={(cost) => skipQueue(researchInQueue.id, cost)}
          disabled={busy}
        />
      )}
      {forgeInQueue && (
        <FilebleRow
          label="Forge en cours"
          targetKind={forgeInQueue.target_kind}
          finishesAt={forgeInQueue.finishes_at}
          onSkip={(cost) => skipQueue(forgeInQueue.id, cost)}
          disabled={busy}
        />
      )}

      <section>
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          Unités de la {village.faction}
        </div>
        <div className="flex flex-col gap-2">
          {factionUnits.map((u) => {
            const isBasicInf =
              UNIT_BASIC_INFANTRY[village.faction] === u.kind;
            const researched = isBasicInf || isResearched(u.kind);
            const f = forgeOf(u.kind);
            const cnt = unitCount(u.kind);
            const rec = recruiting(u.kind);
            return (
              <UnitRow
                key={u.id}
                unit={u}
                researched={researched}
                count={cnt}
                recruiting={rec}
                forge={f}
                academyLevel={buildingLevel("academy")}
                onResearch={() => startResearch(u.kind)}
                onRecruit={(n) => recruit(u.kind, n)}
                onForge={(axis) => forgeUpgrade(u.kind, axis)}
                researchInProgress={!!researchInQueue}
                forgeInProgress={!!forgeInQueue}
                disabled={busy}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PrereqBanner({
  barracks,
  stable,
  workshop,
  academy,
  forge,
}: {
  barracks: number;
  stable: number;
  workshop: number;
  academy: number;
  forge: number;
}) {
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <Tile label="⚔️ Caserne" value={barracks} />
      <Tile label="🐎 Écurie" value={stable} />
      <Tile label="🔨 Atelier" value={workshop} />
      <Tile label="📜 Académie" value={academy} />
      <Tile label="⚒️ Forge" value={forge} />
    </section>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/10 bg-black/40 p-2">
      <div className="text-[10px] text-zinc-400">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-zinc-100">
        niv {value}
      </div>
    </div>
  );
}

function FilebleRow({
  label,
  targetKind,
  finishesAt,
  onSkip,
  disabled,
}: {
  label: string;
  targetKind: string;
  finishesAt: string;
  onSkip: (cost: number) => void;
  disabled: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  void tick;
  const remaining = Math.max(
    0,
    Math.floor((new Date(finishesAt).getTime() - Date.now()) / 1000),
  );
  const skipPrice = imperiumSkipCost(remaining);
  return (
    <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/40 p-3 text-xs">
      <div>
        <div className="text-zinc-400">{label}</div>
        <div className="text-zinc-100">{targetKind}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-zinc-300">
          {formatDuration(remaining)}
        </span>
        {skipPrice !== null && (
          <button
            onClick={() => onSkip(skipPrice)}
            disabled={disabled}
            className="rounded bg-amber-500/80 px-2 py-1 text-[10px] font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
          >
            Skip {formatNumber(skipPrice)} OS
          </button>
        )}
      </div>
    </div>
  );
}

function UnitRow({
  unit,
  researched,
  count,
  recruiting,
  forge,
  academyLevel,
  onResearch,
  onRecruit,
  onForge,
  researchInProgress,
  forgeInProgress,
  disabled,
}: {
  unit: ImperiumUnitMeta;
  researched: boolean;
  count: number;
  recruiting: number;
  forge: ImperiumForgeRow | null;
  academyLevel: number;
  onResearch: () => void;
  onRecruit: (n: number) => void;
  onForge: (axis: "attack" | "defense") => void;
  researchInProgress: boolean;
  forgeInProgress: boolean;
  disabled: boolean;
}) {
  const [recCount, setRecCount] = useState(1);
  const cost = unit.cost;
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-3 ${
        researched
          ? "border-white/10 bg-black/40"
          : "border-white/5 bg-white/[0.02] opacity-70"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{unit.glyph}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">
              {unit.name}
            </span>
            <span className="text-[10px] uppercase text-zinc-500">
              {unit.category}
            </span>
            <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] tabular-nums text-zinc-300">
              {formatNumber(count)}
              {recruiting > 0 && (
                <span className="ml-1 text-amber-300">
                  +{recruiting}
                </span>
              )}
            </span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] tabular-nums text-zinc-400 sm:grid-cols-6">
            <Stat k="Att" v={unit.att} />
            <Stat k="DI" v={unit.di} />
            <Stat k="DC" v={unit.dc} />
            <Stat k="Vit" v={unit.vit} />
            <Stat k="Loot" v={unit.loot} />
            <Stat k="Blé/h" v={unit.wheatH} />
          </div>
          <div className="mt-1 flex flex-wrap gap-1 text-[10px] tabular-nums text-zinc-500">
            <span>🪵 {formatNumber(cost.wood)}</span>
            <span>🧱 {formatNumber(cost.clay)}</span>
            <span>⛓️ {formatNumber(cost.iron)}</span>
            <span>🌾 {formatNumber(cost.wheat)}</span>
            <span className="ml-2">⏱️ {formatDuration(unit.time)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!researched ? (
          <button
            onClick={onResearch}
            disabled={
              disabled ||
              researchInProgress ||
              academyLevel < 1
            }
            className="rounded bg-sky-500/80 px-3 py-1 text-xs font-bold text-sky-950 hover:bg-sky-400 disabled:opacity-50"
          >
            📜 Rechercher
          </button>
        ) : (
          <>
            <input
              type="number"
              min={1}
              max={1000}
              value={recCount}
              onChange={(e) =>
                setRecCount(Math.max(1, parseInt(e.target.value) || 1))
              }
              className="w-20 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none"
            />
            <button
              onClick={() => onRecruit(recCount)}
              disabled={disabled || recCount < 1}
              className="rounded bg-rose-500/80 px-3 py-1 text-xs font-bold text-rose-950 hover:bg-rose-400 disabled:opacity-50"
            >
              ⚔️ Recruter ×{recCount}
            </button>
            <span className="ml-2 text-[10px] text-zinc-500">
              Forge att {forge?.attack_level ?? 0}/20 · def {forge?.defense_level ?? 0}/20
            </span>
            <button
              onClick={() => onForge("attack")}
              disabled={disabled || forgeInProgress}
              className="rounded border border-amber-400/40 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
            >
              ⚒️ Att+
            </button>
            <button
              onClick={() => onForge("defense")}
              disabled={disabled || forgeInProgress}
              className="rounded border border-amber-400/40 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
            >
              ⚒️ Déf+
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div className="rounded border border-white/5 bg-white/[0.03] px-1.5 py-0.5 text-center">
      <span className="text-[9px] text-zinc-500">{k}</span>{" "}
      <span className="text-zinc-200">{v}</span>
    </div>
  );
}
