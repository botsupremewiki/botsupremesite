"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
  type EternumClassId,
  type EternumElementId,
  type EternumRarity,
} from "@shared/types";
import {
  ETERNUM_FAMILIERS,
  ETERNUM_FAMILIERS_BY_ID,
  RARITY_ACCENT,
  RARITY_INVOCATION_PRICE,
  RARITY_LABEL,
  familiersOfRarity,
} from "@shared/eternum-familiers";
import { createClient } from "@/lib/supabase/client";
import type { OwnedFamilier } from "./page";

type Tab = "collection" | "team" | "invoke" | "auberge";

const RARITIES: EternumRarity[] = [
  "common",
  "rare",
  "epic",
  "legendary",
];

export function FamiliersClient({
  initialOwned,
  initialGold,
  userId,
}: {
  initialOwned: OwnedFamilier[];
  initialGold: number;
  userId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("collection");
  const [owned, setOwned] = useState<OwnedFamilier[]>(initialOwned);
  const [gold, setGold] = useState<number>(initialGold);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<{
    familier_id: string;
    element_id: string;
    rarity: EternumRarity;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const supabase = useMemo(() => createClient(), []);

  // Filtres collection.
  const [filterClass, setFilterClass] = useState<EternumClassId | null>(null);
  const [filterRarity, setFilterRarity] = useState<EternumRarity | null>(null);
  const [filterElement, setFilterElement] = useState<EternumElementId | null>(
    null,
  );

  const teamMap = useMemo(() => {
    const m = new Map<number, OwnedFamilier>();
    for (const f of owned) {
      if (f.team_slot !== null) m.set(f.team_slot, f);
    }
    return m;
  }, [owned]);

  const filteredCollection = useMemo(() => {
    return owned.filter((o) => {
      const base = ETERNUM_FAMILIERS_BY_ID.get(o.familier_id);
      if (!base) return false;
      if (filterClass && base.classId !== filterClass) return false;
      if (filterRarity && base.rarity !== filterRarity) return false;
      if (filterElement && o.element_id !== filterElement) return false;
      return true;
    });
  }, [owned, filterClass, filterRarity, filterElement]);

  async function invoke(rarity: EternumRarity) {
    if (!supabase) return;
    setError(null);
    setOkMsg(null);
    const pool = familiersOfRarity(rarity).map((f) => f.id);
    const price = RARITY_INVOCATION_PRICE[rarity];
    const { data, error: rpcErr } = await supabase.rpc(
      "eternum_invoke_familier",
      {
        p_rarity: rarity,
        p_familier_pool: pool,
        p_price: price,
      },
    );
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as {
      id: string;
      familier_id: string;
      element_id: string;
      rarity: EternumRarity;
      gold_after: number;
    };
    setRevealing({
      familier_id: r.familier_id,
      element_id: r.element_id,
      rarity: r.rarity,
    });
    setGold(r.gold_after);
    setOwned((prev) => [
      {
        id: r.id,
        familier_id: r.familier_id,
        element_id: r.element_id,
        level: 1,
        xp: 0,
        star: 1,
        team_slot: null,
        in_auberge: false,
        acquired_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    startTransition(() => router.refresh());
  }

  async function setSlot(ownedId: string, slot: number) {
    if (!supabase) return;
    setError(null);
    const { error: rpcErr } = await supabase.rpc("eternum_set_team_slot", {
      p_owned_id: ownedId,
      p_slot: slot,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setOwned((prev) =>
      prev.map((f) => {
        if (f.id === ownedId) return { ...f, team_slot: slot < 0 ? null : slot };
        // Éjecte l'occupant du slot.
        if (slot >= 0 && f.team_slot === slot) return { ...f, team_slot: null };
        return f;
      }),
    );
  }

  async function toggleAuberge(ownedId: string, current: boolean) {
    if (!supabase) return;
    const { error: rpcErr } = await supabase.rpc("eternum_toggle_auberge", {
      p_owned_id: ownedId,
      p_in: !current,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setOwned((prev) =>
      prev.map((f) =>
        f.id === ownedId ? { ...f, in_auberge: !current } : f,
      ),
    );
  }

  async function evolveFamilier(ownedId: string) {
    if (!supabase) return;
    setError(null);
    setOkMsg(null);
    const { data, error: rpcErr } = await supabase.rpc(
      "eternum_evolve_familier",
      { p_owned_id: ownedId },
    );
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as { ok: boolean; error?: string; new_star?: number };
    if (!r.ok) {
      setError(r.error ?? "Évolution échouée.");
      return;
    }
    setOwned((prev) =>
      prev.map((f) =>
        f.id === ownedId ? { ...f, star: r.new_star! } : f,
      ),
    );
    setOkMsg(`✨ Évolué à ⭐${r.new_star}`);
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 overflow-hidden">
      {/* Header gold + tabs */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <div className="rounded-md border border-white/10 bg-black/40 px-3 py-1.5">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              OS
            </span>{" "}
            <span className="font-bold tabular-nums text-amber-300">
              {gold.toLocaleString("fr-FR")}
            </span>
          </div>
          <div className="rounded-md border border-white/10 bg-black/40 px-3 py-1.5">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Collection
            </span>{" "}
            <span className="font-bold tabular-nums text-zinc-100">
              {owned.length} / {ETERNUM_FAMILIERS.length * 6}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 pb-2">
        <TabBtn active={tab === "collection"} onClick={() => setTab("collection")}>
          📚 Collection ({owned.length})
        </TabBtn>
        <TabBtn active={tab === "team"} onClick={() => setTab("team")}>
          ⚔️ Équipe ({teamMap.size}/5)
        </TabBtn>
        <TabBtn active={tab === "invoke"} onClick={() => setTab("invoke")}>
          🎰 Invocation
        </TabBtn>
        <TabBtn active={tab === "auberge"} onClick={() => setTab("auberge")}>
          🍺 Auberge ({owned.filter((f) => f.in_auberge).length}/5)
        </TabBtn>
      </div>

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

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === "collection" && (
          <CollectionView
            owned={filteredCollection}
            allOwned={owned}
            filterClass={filterClass}
            setFilterClass={setFilterClass}
            filterRarity={filterRarity}
            setFilterRarity={setFilterRarity}
            filterElement={filterElement}
            setFilterElement={setFilterElement}
            onSetSlot={setSlot}
            onToggleAuberge={toggleAuberge}
            onEvolve={evolveFamilier}
          />
        )}
        {tab === "team" && (
          <TeamView teamMap={teamMap} owned={owned} onSetSlot={setSlot} />
        )}
        {tab === "invoke" && (
          <InvokeView gold={gold} onInvoke={invoke} isPending={isPending} />
        )}
        {tab === "auberge" && (
          <AubergeView
            owned={owned.filter((f) => f.in_auberge)}
            onToggleAuberge={toggleAuberge}
          />
        )}
      </div>

      {revealing && (
        <RevealOverlay
          familier_id={revealing.familier_id}
          element_id={revealing.element_id}
          rarity={revealing.rarity}
          onClose={() => setRevealing(null)}
        />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-violet-400/60 bg-violet-400/10 text-violet-100"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Collection ───────────────────────────────────────────────────────

function CollectionView({
  owned,
  allOwned,
  filterClass,
  setFilterClass,
  filterRarity,
  setFilterRarity,
  filterElement,
  setFilterElement,
  onSetSlot,
  onToggleAuberge,
  onEvolve,
}: {
  owned: OwnedFamilier[];
  allOwned: OwnedFamilier[];
  filterClass: EternumClassId | null;
  setFilterClass: (c: EternumClassId | null) => void;
  filterRarity: EternumRarity | null;
  setFilterRarity: (r: EternumRarity | null) => void;
  filterElement: EternumElementId | null;
  setFilterElement: (e: EternumElementId | null) => void;
  onSetSlot: (id: string, slot: number) => void;
  onToggleAuberge: (id: string, current: boolean) => void;
  onEvolve: (id: string) => void;
}) {
  void allOwned;
  return (
    <div className="flex flex-col gap-3">
      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterClass ?? ""}
          onChange={(e) =>
            setFilterClass((e.target.value as EternumClassId) || null)
          }
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-200"
        >
          <option value="">Toutes classes</option>
          {Object.values(ETERNUM_CLASSES).map((c) => (
            <option key={c.id} value={c.id}>
              {c.glyph} {c.name}
            </option>
          ))}
        </select>
        <select
          value={filterRarity ?? ""}
          onChange={(e) =>
            setFilterRarity((e.target.value as EternumRarity) || null)
          }
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-200"
        >
          <option value="">Toutes raretés</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {RARITY_LABEL[r]}
            </option>
          ))}
          <option value="prismatic">Prismatique</option>
        </select>
        <select
          value={filterElement ?? ""}
          onChange={(e) =>
            setFilterElement((e.target.value as EternumElementId) || null)
          }
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-200"
        >
          <option value="">Tous éléments</option>
          {Object.values(ETERNUM_ELEMENTS).map((el) => (
            <option key={el.id} value={el.id}>
              {el.glyph} {el.name}
            </option>
          ))}
        </select>
      </div>

      {owned.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
          Aucun familier (encore). Va dans 🎰 Invocation pour en obtenir.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {owned.map((o) => (
            <FamilierCard
              key={o.id}
              owned={o}
              onSetSlot={onSetSlot}
              onToggleAuberge={onToggleAuberge}
              onEvolve={onEvolve}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FamilierCard({
  owned,
  onSetSlot,
  onToggleAuberge,
  onEvolve,
}: {
  owned: OwnedFamilier;
  onSetSlot: (id: string, slot: number) => void;
  onToggleAuberge: (id: string, current: boolean) => void;
  onEvolve: (id: string) => void;
}) {
  const base = ETERNUM_FAMILIERS_BY_ID.get(owned.familier_id);
  if (!base) return null;
  const elt = ETERNUM_ELEMENTS[owned.element_id as EternumElementId];
  const rarityCls = RARITY_ACCENT[base.rarity];
  return (
    <div className={`flex flex-col gap-1 rounded-xl border bg-black/40 p-3 ${rarityCls}`}>
      <div className="flex items-start justify-between text-[10px]">
        <span className="font-semibold">{base.name}</span>
        <span className={elt.accent}>{elt.glyph}</span>
      </div>
      <div className="flex items-center justify-center text-4xl">{base.glyph}</div>
      <div className="text-[10px] text-zinc-400">
        Niv {owned.level} · ⭐{owned.star}
      </div>
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">
        {RARITY_LABEL[base.rarity]} · {ETERNUM_CLASSES[base.classId].name}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {owned.team_slot !== null ? (
          <button
            onClick={() => onSetSlot(owned.id, -1)}
            className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] text-rose-200 hover:bg-rose-500/40"
          >
            Retirer slot {owned.team_slot + 1}
          </button>
        ) : (
          <select
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onSetSlot(owned.id, v);
            }}
            defaultValue=""
            className="rounded bg-white/5 px-1 py-0.5 text-[9px] text-zinc-300"
          >
            <option value="">→ Équipe</option>
            {[0, 1, 2, 3, 4].map((s) => (
              <option key={s} value={s}>
                Slot {s + 1}
              </option>
            ))}
          </select>
        )}
        {owned.team_slot === null && (
          <button
            onClick={() => onToggleAuberge(owned.id, owned.in_auberge)}
            className={`rounded px-1.5 py-0.5 text-[9px] ${
              owned.in_auberge
                ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/40"
                : "bg-white/5 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {owned.in_auberge ? "🍺 Sortir" : "🍺 Auberge"}
          </button>
        )}
        {owned.star < 6 && (
          <button
            onClick={() => onEvolve(owned.id)}
            className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[9px] text-fuchsia-200 hover:bg-fuchsia-500/40"
            title={`Évolution requiert des shards (${
              base.rarity === "common" ? 5 : base.rarity === "rare" ? 10 : base.rarity === "epic" ? 20 : base.rarity === "legendary" ? 50 : 100
            } shard-${base.rarity})`}
          >
            ✨ +1⭐
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Équipe ─────────────────────────────────────────────────────────────

function TeamView({
  teamMap,
  owned,
  onSetSlot,
}: {
  teamMap: Map<number, OwnedFamilier>;
  owned: OwnedFamilier[];
  onSetSlot: (id: string, slot: number) => void;
}) {
  void owned;
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-zinc-400">
        Équipe active : 5 familiers max. Utilisés en idle, donjons, World
        Boss, PvP. Pas en raids (héros only).
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((slot) => {
          const f = teamMap.get(slot);
          if (!f) {
            return (
              <div
                key={slot}
                className="flex aspect-[3/4] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-4 text-xs text-zinc-500"
              >
                Slot {slot + 1}
                <div className="mt-1 text-[10px]">
                  Vide — équipe depuis Collection
                </div>
              </div>
            );
          }
          const base = ETERNUM_FAMILIERS_BY_ID.get(f.familier_id);
          const elt = ETERNUM_ELEMENTS[f.element_id as EternumElementId];
          if (!base) return null;
          return (
            <div
              key={slot}
              className={`flex flex-col gap-1 rounded-xl border p-3 ${RARITY_ACCENT[base.rarity]} bg-black/40`}
            >
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold">Slot {slot + 1}</span>
                <span className={elt.accent}>{elt.glyph}</span>
              </div>
              <div className="text-center text-5xl">{base.glyph}</div>
              <div className="text-center text-xs font-semibold">
                {base.name}
              </div>
              <div className="text-center text-[10px] text-zinc-400">
                Niv {f.level} · {RARITY_LABEL[base.rarity]}
              </div>
              <button
                onClick={() => onSetSlot(f.id, -1)}
                className="mt-1 rounded bg-rose-500/20 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-500/40"
              >
                Retirer
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Invocation ─────────────────────────────────────────────────────────

function InvokeView({
  gold,
  onInvoke,
  isPending,
}: {
  gold: number;
  onInvoke: (r: EternumRarity) => void;
  isPending: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-zinc-400">
        Invoque un familier d&apos;une rareté donnée. Élément aléatoire à
        l&apos;invocation : 24% chacun pour les 4 base, 2% chacun pour
        Lumière/Ombre. Le familier prismatique nécessite une pierre
        prismatique (Phase 10).
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {RARITIES.map((r) => {
          const price = RARITY_INVOCATION_PRICE[r];
          const canAfford = gold >= price;
          return (
            <div
              key={r}
              className={`flex flex-col gap-2 rounded-xl border bg-black/40 p-4 ${RARITY_ACCENT[r]}`}
            >
              <div className="text-center text-3xl">🎰</div>
              <div className="text-center text-base font-bold">
                {RARITY_LABEL[r]}
              </div>
              <div className="text-center text-[10px] text-zinc-400">
                Pool : {familiersOfRarity(r).length} familiers de base × 6
                éléments
              </div>
              <div className="text-center text-sm font-bold tabular-nums text-amber-300">
                {price.toLocaleString("fr-FR")} OS
              </div>
              <button
                onClick={() => onInvoke(r)}
                disabled={!canAfford || isPending}
                className="rounded-md bg-amber-500 px-3 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-40"
              >
                Invoquer
              </button>
            </div>
          );
        })}
        <div className="flex flex-col items-center gap-2 rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/[0.04] p-4 opacity-70">
          <div className="text-center text-3xl">💎</div>
          <div className="text-center text-base font-bold text-fuchsia-200">
            Prismatique
          </div>
          <div className="text-center text-[10px] text-zinc-400">
            Disponible via pierres prismatiques (P10) — drop end-game
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Auberge ────────────────────────────────────────────────────────────

function AubergeView({
  owned,
  onToggleAuberge,
}: {
  owned: OwnedFamilier[];
  onToggleAuberge: (id: string, current: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-zinc-400">
        Familiers à l&apos;auberge : gagnent 1 XP / minute en passive.
        Maximum 5 simultanés. Les sortir applique l&apos;XP accumulée.
      </div>
      {owned.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
          Aucun familier à l&apos;auberge. Mets-en depuis Collection.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {owned.map((f) => {
            const base = ETERNUM_FAMILIERS_BY_ID.get(f.familier_id);
            if (!base) return null;
            return (
              <div
                key={f.id}
                className={`flex flex-col gap-2 rounded-xl border p-3 ${RARITY_ACCENT[base.rarity]} bg-black/40`}
              >
                <div className="text-center text-4xl">{base.glyph}</div>
                <div className="text-center text-xs font-semibold">
                  {base.name}
                </div>
                <button
                  onClick={() => onToggleAuberge(f.id, true)}
                  className="rounded bg-rose-500/20 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-500/40"
                >
                  🍺 Sortir
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Reveal overlay ────────────────────────────────────────────────────

function RevealOverlay({
  familier_id,
  element_id,
  rarity,
  onClose,
}: {
  familier_id: string;
  element_id: string;
  rarity: EternumRarity;
  onClose: () => void;
}) {
  const base = ETERNUM_FAMILIERS_BY_ID.get(familier_id);
  if (!base) return null;
  const elt = ETERNUM_ELEMENTS[element_id as EternumElementId];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className={`flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border-2 p-6 ${RARITY_ACCENT[rarity]} bg-zinc-950`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] uppercase tracking-widest text-zinc-400">
          Invocation réussie !
        </div>
        <div className="text-7xl">{base.glyph}</div>
        <div className="text-2xl font-bold">{base.name}</div>
        <div className="flex items-center gap-2 text-sm">
          <span>{RARITY_LABEL[rarity]}</span>
          <span className="text-zinc-500">·</span>
          <span className={elt.accent}>
            {elt.glyph} {elt.name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="mt-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400"
        >
          Ajouter à ma collection
        </button>
      </div>
    </div>
  );
}
