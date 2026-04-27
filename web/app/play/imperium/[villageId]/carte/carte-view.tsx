"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatNumber,
  imperiumDistance,
  type ImperiumVillageRow,
  type ImperiumMapCellRow,
  type ImperiumUnitRow,
} from "@shared/imperium";
import {
  imperiumUnitsByFaction,
  type ImperiumUnitMeta,
} from "@shared/imperium-units";

type Props = {
  village: ImperiumVillageRow;
  initialCells: ImperiumMapCellRow[];
  units: ImperiumUnitRow[];
};

const RADIUS = 8;

export function CarteView({ village, initialCells, units }: Props) {
  const [center, setCenter] = useState({ x: village.x, y: village.y });
  const [cells, setCells] = useState(initialCells);
  const [selected, setSelected] = useState<ImperiumMapCellRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cellMap = useMemo(() => {
    const m = new Map<string, ImperiumMapCellRow>();
    for (const c of cells) m.set(`${c.x},${c.y}`, c);
    return m;
  }, [cells]);

  async function moveCenter(dx: number, dy: number) {
    const newX = Math.max(-50, Math.min(50, center.x + dx));
    const newY = Math.max(-50, Math.min(50, center.y + dy));
    setCenter({ x: newX, y: newY });
    const supabase = createClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("imperium_map")
      .select("*")
      .gte("x", newX - RADIUS)
      .lte("x", newX + RADIUS)
      .gte("y", newY - RADIUS)
      .lte("y", newY + RADIUS);
    if (data) setCells(data as ImperiumMapCellRow[]);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-400">
          Centre carte : ({center.x}, {center.y}) · Village ({village.x}, {village.y})
        </div>
        <div className="flex gap-1 text-[10px]">
          <button
            onClick={() => moveCenter(0, -RADIUS)}
            className="rounded border border-white/10 px-2 py-1 text-zinc-300 hover:bg-white/5"
          >
            ↑
          </button>
          <button
            onClick={() => moveCenter(-RADIUS, 0)}
            className="rounded border border-white/10 px-2 py-1 text-zinc-300 hover:bg-white/5"
          >
            ←
          </button>
          <button
            onClick={() => setCenter({ x: village.x, y: village.y })}
            className="rounded border border-white/10 px-2 py-1 text-zinc-300 hover:bg-white/5"
          >
            ⌖
          </button>
          <button
            onClick={() => moveCenter(RADIUS, 0)}
            className="rounded border border-white/10 px-2 py-1 text-zinc-300 hover:bg-white/5"
          >
            →
          </button>
          <button
            onClick={() => moveCenter(0, RADIUS)}
            className="rounded border border-white/10 px-2 py-1 text-zinc-300 hover:bg-white/5"
          >
            ↓
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[1fr_320px] gap-4 max-md:grid-cols-1">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40 p-2">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `repeat(${RADIUS * 2 + 1}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: (RADIUS * 2 + 1) ** 2 }, (_, i) => {
              const dx = (i % (RADIUS * 2 + 1)) - RADIUS;
              const dy = Math.floor(i / (RADIUS * 2 + 1)) - RADIUS;
              const x = center.x + dx;
              const y = center.y + dy;
              const cell = cellMap.get(`${x},${y}`) ?? {
                x,
                y,
                kind: "empty" as const,
                village_id: null,
                data: null,
              };
              const isMe = village.x === x && village.y === y;
              const isCenter = x === 0 && y === 0;
              const distFromVillage = imperiumDistance(
                village.x,
                village.y,
                x,
                y,
              );
              const visible = distFromVillage <= 7;
              return (
                <button
                  key={i}
                  onClick={() => setSelected(cell)}
                  className={`relative aspect-square min-w-0 text-[10px] tabular-nums transition-colors ${
                    isMe
                      ? "bg-amber-500/40 text-amber-100 ring-1 ring-amber-300"
                      : cellSkin(cell.kind, visible)
                  } ${selected?.x === x && selected?.y === y ? "ring-1 ring-white" : ""}`}
                  title={`(${x}, ${y}) ${cell.kind}`}
                >
                  {cellGlyph(cell.kind, isMe, isCenter)}
                </button>
              );
            })}
          </div>
        </div>

        <CellInfoPanel
          village={village}
          cell={selected}
          units={units}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
        />
      </div>
    </div>
  );
}

function cellSkin(kind: string, visible: boolean): string {
  if (!visible) {
    return "bg-zinc-900/60 text-zinc-700 hover:bg-zinc-800";
  }
  switch (kind) {
    case "player_village":
      return "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30";
    case "barbarian":
      return "bg-orange-500/20 text-orange-200 hover:bg-orange-500/30";
    case "oasis":
      return "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30";
    case "wonder":
      return "bg-fuchsia-500/30 text-fuchsia-200 hover:bg-fuchsia-500/40 ring-1 ring-fuchsia-400/30";
    default:
      return "bg-white/[0.02] text-zinc-600 hover:bg-white/[0.05]";
  }
}

function cellGlyph(kind: string, isMe: boolean, isCenter: boolean): string {
  if (isMe) return "🏰";
  if (isCenter) return "⭐";
  switch (kind) {
    case "player_village":
      return "🛖";
    case "barbarian":
      return "⚔";
    case "oasis":
      return "🌳";
    case "wonder":
      return "✨";
    default:
      return "·";
  }
}

function CellInfoPanel({
  village,
  cell,
  units,
  busy,
  setBusy,
  setError,
}: {
  village: ImperiumVillageRow;
  cell: ImperiumMapCellRow | null;
  units: ImperiumUnitRow[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (s: string | null) => void;
}) {
  const factionUnits = imperiumUnitsByFaction(village.faction);
  const [marchKind, setMarchKind] = useState<
    "raid" | "attack" | "support" | "spy" | "conquest"
  >("raid");
  const [composition, setComposition] = useState<Record<string, number>>({});

  if (!cell) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-400">
        Clique sur une case pour voir ses infos.
      </div>
    );
  }

  const dist = imperiumDistance(village.x, village.y, cell.x, cell.y);
  const isMine = cell.kind === "player_village" && cell.village_id === village.id;

  async function send() {
    if (dist === 0) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      // Filtre les unités à 0
      const filtered: Record<string, number> = {};
      for (const [k, v] of Object.entries(composition)) {
        if (v > 0) filtered[k] = v;
      }
      if (Object.keys(filtered).length === 0)
        throw new Error("Aucune unité sélectionnée");
      if (!cell) throw new Error("Cellule introuvable");
      const { error: rpcErr } = await supabase.rpc("imperium_send_march", {
        p_village_id: village.id,
        p_to_x: cell.x,
        p_to_y: cell.y,
        p_kind: marchKind,
        p_units: filtered,
        p_target_building: null,
      });
      if (rpcErr) throw rpcErr;
      setComposition({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/40 p-4 text-sm">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-400">
          Case ({cell.x}, {cell.y}) · dist {dist}
        </div>
        <div className="mt-1 text-zinc-100">
          {cellTitle(cell.kind, isMine)}
        </div>
      </div>

      {cell.kind === "wonder" && (
        <Link
          href={`/play/imperium/merveille/${cell.x}/${cell.y}`}
          className="rounded bg-fuchsia-500 px-3 py-2 text-xs font-bold text-fuchsia-950 hover:bg-fuchsia-400 text-center"
        >
          ✨ Voir détails de la merveille
        </Link>
      )}

      {cell.kind === "player_village" && !isMine && cell.village_id && (
        <ProfileLink villageId={cell.village_id} />
      )}

      {!isMine && cell.kind !== "empty" && dist > 0 && (
        <>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-400">
              Type de marche
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {(
                ["raid", "attack", "support", "spy", "conquest"] as const
              ).map((k) => (
                <button
                  key={k}
                  onClick={() => setMarchKind(k)}
                  className={`rounded border px-2 py-1 ${
                    marchKind === k
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                      : "border-white/10 text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-400">
              Composition
            </div>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {factionUnits.map((u) => (
                <UnitPicker
                  key={u.kind}
                  unit={u}
                  available={
                    units.find((uu) => uu.unit_kind === u.kind)?.count ?? 0
                  }
                  value={composition[u.kind] ?? 0}
                  onChange={(n) =>
                    setComposition((c) => ({ ...c, [u.kind]: n }))
                  }
                />
              ))}
            </div>
          </div>

          <button
            onClick={send}
            disabled={busy}
            className="rounded bg-rose-500 px-3 py-2 text-sm font-bold text-rose-950 hover:bg-rose-400 disabled:opacity-50"
          >
            {busy ? "Envoi…" : "🚶 Envoyer la marche"}
          </button>
        </>
      )}
    </div>
  );
}

function UnitPicker({
  unit,
  available,
  value,
  onChange,
}: {
  unit: ImperiumUnitMeta;
  available: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded border border-white/5 bg-white/[0.03] px-2 py-1 text-xs">
      <span>{unit.glyph}</span>
      <span className="flex-1 truncate text-zinc-200">{unit.name}</span>
      <span className="text-[10px] text-zinc-500">/ {formatNumber(available)}</span>
      <input
        type="number"
        min={0}
        max={available}
        value={value}
        onChange={(e) =>
          onChange(
            Math.max(0, Math.min(available, parseInt(e.target.value) || 0)),
          )
        }
        className="w-16 rounded border border-white/10 bg-black/40 px-1 py-0.5 text-right text-zinc-100 outline-none"
      />
    </div>
  );
}

function ProfileLink({ villageId }: { villageId: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const supabase = createClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("imperium_villages")
      .select("user_id")
      .eq("id", villageId)
      .maybeSingle();
    if (data?.user_id) {
      window.location.href = `/play/imperium/joueur/${data.user_id}`;
    }
    setBusy(false);
  }
  return (
    <button
      onClick={go}
      disabled={busy}
      className="rounded border border-zinc-400/40 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-50"
    >
      👤 Voir profil joueur
    </button>
  );
}

function cellTitle(kind: string, isMine: boolean): string {
  if (isMine) return "🏰 Mon village";
  switch (kind) {
    case "player_village":
      return "🛖 Village joueur";
    case "barbarian":
      return "⚔ Ferme barbare (NPC)";
    case "oasis":
      return "🌳 Oasis";
    case "wonder":
      return "✨ Merveille (endgame)";
    default:
      return "Terrain vide";
  }
}
