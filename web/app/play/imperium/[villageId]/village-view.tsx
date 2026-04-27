"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  IMPERIUM_RESOURCES,
  IMPERIUM_FACTIONS,
  imperiumFieldRate,
  imperiumStorageCap,
  imperiumHideoutCap,
  imperiumSkipCost,
  formatNumber,
  formatDuration,
  type ImperiumVillageRow,
  type ImperiumBuildingRow,
  type ImperiumQueueRow,
  type ImperiumUnitRow,
} from "@shared/imperium";
import {
  IMPERIUM_BUILDINGS,
  IMPERIUM_CENTER_BUILDINGS,
  FIELD_SLOTS,
  type ImperiumBuildingKind,
} from "@shared/imperium-buildings";

type Props = {
  initialVillage: ImperiumVillageRow;
  initialBuildings: ImperiumBuildingRow[];
  initialQueue: ImperiumQueueRow[];
  initialUnits: ImperiumUnitRow[];
};

export function VillageView({
  initialVillage,
  initialBuildings,
  initialQueue,
  initialUnits,
}: Props) {
  const router = useRouter();
  const [village, setVillage] = useState(initialVillage);
  const [buildings, setBuildings] = useState(initialBuildings);
  const [queue, setQueue] = useState(initialQueue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  // Tick UI toutes les secondes pour rafraîchir les compteurs
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Calcul live des ressources (approximation côté client)
  const liveRes = useMemo(() => {
    const lastTick = new Date(village.last_tick).getTime();
    const elapsedH = (Date.now() - lastTick) / 3600_000;
    const fieldLevel = (kind: ImperiumBuildingKind) =>
      buildings.find((b) => b.kind === kind)?.level ?? 0;
    const woodRate = imperiumFieldRate(fieldLevel("wood_field"));
    const clayRate = imperiumFieldRate(fieldLevel("clay_field"));
    const ironRate = imperiumFieldRate(fieldLevel("iron_field"));
    const wheatRate = imperiumFieldRate(fieldLevel("wheat_field"));
    const whCap =
      Math.max(
        800,
        buildings
          .filter((b) => b.kind === "warehouse")
          .reduce((a, b) => a + imperiumStorageCap(b.level), 0),
      );
    const grCap =
      Math.max(
        800,
        buildings
          .filter((b) => b.kind === "granary")
          .reduce((a, b) => a + imperiumStorageCap(b.level), 0),
      );
    const wood = Math.min(whCap, village.wood + woodRate * elapsedH);
    const clay = Math.min(whCap, village.clay + clayRate * elapsedH);
    const iron = Math.min(whCap, village.iron + ironRate * elapsedH);
    const wheat = Math.min(grCap, village.wheat + wheatRate * elapsedH);
    return { wood, clay, iron, wheat, whCap, grCap, woodRate, clayRate, ironRate, wheatRate };
  }, [village, buildings, tick]);

  async function refresh() {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.rpc("imperium_tick", { p_village_id: village.id });
    const { data: v } = await supabase
      .from("imperium_villages")
      .select("*")
      .eq("id", village.id)
      .maybeSingle();
    const { data: b } = await supabase
      .from("imperium_buildings")
      .select("*")
      .eq("village_id", village.id)
      .order("slot");
    const { data: q } = await supabase
      .from("imperium_construction_queue")
      .select("*")
      .eq("village_id", village.id);
    if (v) setVillage(v as ImperiumVillageRow);
    if (b) setBuildings(b as ImperiumBuildingRow[]);
    if (q) setQueue(q as ImperiumQueueRow[]);
  }

  async function upgrade(slot: number, kind: ImperiumBuildingKind) {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc(
        "imperium_upgrade_building",
        { p_village_id: village.id, p_slot: slot, p_kind: kind },
      );
      if (rpcErr) throw rpcErr;
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(msg);
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
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc("imperium_skip_timer", {
        p_queue_id: qId,
      });
      if (rpcErr) throw rpcErr;
      await refresh();
      router.refresh(); // pour mettre à jour le solde OS dans le UserPill
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function cancelQueue(qId: string) {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc(
        "imperium_cancel_construction",
        { p_queue_id: qId },
      );
      if (rpcErr) throw rpcErr;
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const factionData = IMPERIUM_FACTIONS[village.faction];
  const buildingsBySlot = new Map<number, ImperiumBuildingRow>(
    buildings.map((b) => [b.slot, b]),
  );
  const buildingQueue = queue.filter((q) => q.kind === "building");
  const isBuilding = buildingQueue.length > 0;

  // Total unités stockées
  const unitsTotal = initialUnits.reduce((a, u) => a + u.count, 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      {/* Bandeau ressources */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <ResTile
          glyph="🪵"
          label="Bois"
          value={liveRes.wood}
          cap={liveRes.whCap}
          rate={liveRes.woodRate}
        />
        <ResTile
          glyph="🧱"
          label="Argile"
          value={liveRes.clay}
          cap={liveRes.whCap}
          rate={liveRes.clayRate}
        />
        <ResTile
          glyph="⛓️"
          label="Fer"
          value={liveRes.iron}
          cap={liveRes.whCap}
          rate={liveRes.ironRate}
        />
        <ResTile
          glyph="🌾"
          label="Blé"
          value={liveRes.wheat}
          cap={liveRes.grCap}
          rate={liveRes.wheatRate}
        />
        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">
            Faction
          </div>
          <div className={`mt-0.5 text-sm font-semibold ${factionData.accent}`}>
            {factionData.glyph} {factionData.name}
          </div>
          <div className="text-[10px] text-zinc-500">
            {unitsTotal} unités · bouclier {village.shield_until && new Date(village.shield_until) > new Date() ? "actif" : "—"}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* File de construction */}
      {buildingQueue.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-black/40 p-4">
          <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
            File de construction
          </div>
          <div className="flex flex-col gap-2">
            {buildingQueue.map((q) => (
              <QueueRow
                key={q.id}
                q={q}
                onSkip={(cost) => skipQueue(q.id, cost)}
                onCancel={() => cancelQueue(q.id)}
                disabled={busy}
              />
            ))}
          </div>
        </section>
      )}

      {/* Champs périphériques */}
      <section>
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          Champs périphériques
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([-1, -2, -3, -4] as const).map((slot) => {
            const fieldKind = FIELD_SLOTS[slot];
            const b = buildingsBySlot.get(slot);
            const lvl = b?.level ?? 0;
            const meta = IMPERIUM_BUILDINGS[fieldKind];
            const inQueue = buildingQueue.find((q) => q.target_slot === slot);
            return (
              <BuildingTile
                key={slot}
                title={meta.name}
                glyph={meta.glyph}
                level={lvl}
                description={meta.description}
                onUpgrade={() => upgrade(slot, fieldKind)}
                disabled={busy || isBuilding}
                inQueue={!!inQueue}
                queueLevel={inQueue?.target_level}
              />
            );
          })}
        </div>
      </section>

      {/* Centre 4×4 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-widest text-zinc-400">
            Centre du village
          </div>
          <div className="text-[10px] text-zinc-500">
            {buildings.filter((b) => b.slot >= 0).length} / 16 emplacements
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 16 }, (_, slot) => {
            const b = buildingsBySlot.get(slot);
            const inQueue = buildingQueue.find((q) => q.target_slot === slot);
            if (b) {
              const meta = IMPERIUM_BUILDINGS[b.kind as ImperiumBuildingKind];
              if (!meta) return <EmptySlot key={slot} slot={slot} />;
              return (
                <BuildingTile
                  key={slot}
                  title={meta.name}
                  glyph={meta.glyph}
                  level={b.level}
                  description={meta.description}
                  onUpgrade={() =>
                    upgrade(slot, b.kind as ImperiumBuildingKind)
                  }
                  disabled={busy || isBuilding}
                  inQueue={!!inQueue}
                  queueLevel={inQueue?.target_level}
                />
              );
            }
            // Slot vide → choix du bâtiment à construire
            return (
              <NewSlot
                key={slot}
                slot={slot}
                onPick={(kind) => upgrade(slot, kind)}
                disabled={busy || isBuilding}
                inQueue={!!inQueue}
                inQueueLevel={inQueue?.target_level}
                inQueueKind={inQueue?.target_kind as ImperiumBuildingKind | undefined}
                existing={buildings.map((b) => b.kind as ImperiumBuildingKind)}
              />
            );
          })}
        </div>
      </section>

      {/* Caché — info compacte */}
      {(() => {
        const hideout = buildings.find((b) => b.kind === "hideout");
        if (!hideout) return null;
        return (
          <section className="rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-400">
            🕳️ Caché niveau {hideout.level} — {imperiumHideoutCap(hideout.level)} ressources
            de chaque type protégées du loot.
          </section>
        );
      })()}

      <RenameVillagePanel
        villageId={village.id}
        currentName={village.name}
        onRenamed={refresh}
      />
    </div>
  );
}

function RenameVillagePanel({
  villageId,
  currentName,
  onRenamed,
}: {
  villageId: string;
  currentName: string;
  onRenamed: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rename() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc("imperium_rename_village", {
        p_village_id: villageId,
        p_new_name: newName.trim(),
      });
      if (rpcErr) throw rpcErr;
      setOpen(false);
      await onRenamed();
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <section className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Paramètres du village</span>
          <button
            onClick={() => setOpen(true)}
            className="rounded border border-amber-400/40 px-3 py-1 text-amber-200 hover:bg-amber-400/10"
          >
            ✏️ Renommer (5 000 OS)
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-amber-400/40 bg-black/40 p-4 text-xs">
      <div className="mb-2 text-zinc-400">Renommer le village (coût 5 000 OS)</div>
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={30}
          className="flex-1 rounded border border-white/10 bg-black/40 px-3 py-2 text-zinc-100 outline-none focus:border-amber-400/50"
        />
        <button
          onClick={rename}
          disabled={busy || !newName.trim() || newName === currentName}
          className="rounded bg-amber-500 px-3 py-2 font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "…" : "Confirmer"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setNewName(currentName);
            setError(null);
          }}
          className="rounded border border-white/10 px-3 py-2 text-zinc-300 hover:bg-white/5"
        >
          Annuler
        </button>
      </div>
      {error && (
        <div className="mt-2 text-rose-300">{error}</div>
      )}
    </section>
  );
}

function ResTile({
  glyph,
  label,
  value,
  cap,
  rate,
}: {
  glyph: string;
  label: string;
  value: number;
  cap: number;
  rate: number;
}) {
  const pct = Math.min(1, value / cap);
  const danger = pct > 0.95;
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-lg">{glyph}</span>
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          {label}
        </span>
      </div>
      <div
        className={`mt-1 text-base font-semibold tabular-nums ${
          danger ? "text-rose-300" : "text-zinc-100"
        }`}
      >
        {formatNumber(value)}
        <span className="ml-1 text-[10px] text-zinc-500">/ {formatNumber(cap)}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded bg-white/5">
        <div
          className={`h-full ${danger ? "bg-rose-500/70" : "bg-emerald-500/60"}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] tabular-nums text-zinc-500">
        +{formatNumber(rate)}/h
      </div>
    </div>
  );
}

function BuildingTile({
  title,
  glyph,
  level,
  description,
  onUpgrade,
  disabled,
  inQueue,
  queueLevel,
}: {
  title: string;
  glyph: string;
  level: number;
  description: string;
  onUpgrade: () => void;
  disabled: boolean;
  inQueue: boolean;
  queueLevel?: number;
}) {
  return (
    <button
      onClick={onUpgrade}
      disabled={disabled || inQueue}
      className="group flex flex-col gap-1 rounded-xl border border-white/10 bg-black/40 p-3 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-50"
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl">{glyph}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] tabular-nums text-zinc-300">
          niv {level}
        </span>
      </div>
      <div className="text-sm font-semibold text-zinc-100">{title}</div>
      <div className="text-[10px] leading-tight text-zinc-500">
        {inQueue ? `→ niveau ${queueLevel} en cours` : description}
      </div>
      {!inQueue && (
        <div className="mt-1 text-[10px] uppercase tracking-widest text-amber-300/70 group-hover:text-amber-300">
          Upgrade →
        </div>
      )}
    </button>
  );
}

function EmptySlot({ slot }: { slot: number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-[10px] text-zinc-600">
      Slot {slot}
    </div>
  );
}

function NewSlot({
  slot,
  onPick,
  disabled,
  inQueue,
  inQueueLevel,
  inQueueKind,
  existing,
}: {
  slot: number;
  onPick: (kind: ImperiumBuildingKind) => void;
  disabled: boolean;
  inQueue: boolean;
  inQueueLevel?: number;
  inQueueKind?: ImperiumBuildingKind;
  existing: ImperiumBuildingKind[];
}) {
  const [open, setOpen] = useState(false);

  if (inQueue && inQueueKind) {
    const meta = IMPERIUM_BUILDINGS[inQueueKind];
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-3 text-left">
        <div className="flex items-center justify-between">
          <span className="text-2xl">{meta.glyph}</span>
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] text-amber-200">
            niv {inQueueLevel}
          </span>
        </div>
        <div className="text-sm font-semibold text-zinc-100">{meta.name}</div>
        <div className="text-[10px] text-amber-300/80">construction…</div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300 disabled:opacity-50"
      >
        <span className="text-2xl">+</span>
        <span className="text-[10px] uppercase tracking-widest">Construire</span>
      </button>
    );
  }

  // Liste des bâtiments constructibles (centre uniquement)
  const buildable = IMPERIUM_CENTER_BUILDINGS.filter((k) => {
    if (k === "town_hall") return false; // un seul, déjà placé au spawn
    if (k === "wonder") return false; // P8 endgame, hors construction libre
    const stack = IMPERIUM_BUILDINGS[k].stackable ?? 1;
    const count = existing.filter((kk) => kk === k).length;
    return count < stack;
  });

  return (
    <div className="rounded-xl border border-white/10 bg-black/60 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-400">
        <span>Choisir un bâtiment</span>
        <button
          onClick={() => setOpen(false)}
          className="text-zinc-500 hover:text-zinc-300"
        >
          ×
        </button>
      </div>
      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {buildable.map((kind) => {
          const meta = IMPERIUM_BUILDINGS[kind];
          return (
            <button
              key={kind}
              onClick={() => {
                setOpen(false);
                onPick(kind);
              }}
              className="flex items-center gap-2 rounded border border-white/5 bg-white/[0.03] p-2 text-left text-xs hover:bg-white/[0.06]"
            >
              <span className="text-base">{meta.glyph}</span>
              <div className="flex-1 truncate">
                <div className="text-zinc-100">{meta.name}</div>
                <div className="truncate text-[9px] text-zinc-500">
                  {meta.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QueueRow({
  q,
  onSkip,
  onCancel,
  disabled,
}: {
  q: ImperiumQueueRow;
  onSkip: (cost: number) => void;
  onCancel: () => void;
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
    Math.floor((new Date(q.finishes_at).getTime() - Date.now()) / 1000),
  );
  const skipPrice = imperiumSkipCost(remaining);
  const meta =
    IMPERIUM_BUILDINGS[q.target_kind as ImperiumBuildingKind] ?? null;
  return (
    <div className="flex items-center gap-3 rounded-md border border-white/5 bg-white/[0.03] p-2 text-xs">
      <span className="text-lg">{meta?.glyph ?? "🛠️"}</span>
      <div className="flex-1">
        <div className="text-zinc-100">
          {meta?.name ?? q.target_kind} → niv {q.target_level}
        </div>
        <div className="text-[10px] tabular-nums text-zinc-400">
          {formatDuration(remaining)} restant
        </div>
      </div>
      {skipPrice !== null && (
        <button
          onClick={() => onSkip(skipPrice)}
          disabled={disabled}
          className="rounded bg-amber-500/80 px-2 py-1 text-[10px] font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
        >
          Skip {formatNumber(skipPrice)} OS
        </button>
      )}
      <button
        onClick={onCancel}
        disabled={disabled}
        className="rounded border border-white/10 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/5 disabled:opacity-50"
      >
        Annuler
      </button>
    </div>
  );
}
