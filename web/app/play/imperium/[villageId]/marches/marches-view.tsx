"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatDuration,
  formatNumber,
  type ImperiumMarchRow,
  type ImperiumReportRow,
} from "@shared/imperium";

type Props = {
  villageId: string;
  initialMarches: ImperiumMarchRow[];
  initialReports: ImperiumReportRow[];
};

export function MarchesView({
  villageId,
  initialMarches,
  initialReports,
}: Props) {
  const [marches, setMarches] = useState(initialMarches);
  const [reports, setReports] = useState(initialReports);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Refresh régulier
  useEffect(() => {
    const t = setInterval(async () => {
      const supabase = createClient();
      if (!supabase) return;
      const { data: m } = await supabase
        .from("imperium_marches")
        .select("*")
        .eq("from_village_id", villageId)
        .in("state", ["outbound", "returning"])
        .order("arrives_at");
      if (m) setMarches(m as ImperiumMarchRow[]);
    }, 5000);
    return () => clearInterval(t);
  }, [villageId]);

  async function cancel(marchId: string) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc("imperium_cancel_march", {
        p_march_id: marchId,
      });
      if (rpcErr) throw rpcErr;
      const { data: m } = await supabase
        .from("imperium_marches")
        .select("*")
        .eq("from_village_id", villageId)
        .in("state", ["outbound", "returning"]);
      if (m) setMarches(m as ImperiumMarchRow[]);
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

      <section>
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          Marches en cours
        </div>
        {marches.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-500">
            Aucune marche active.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {marches.map((m) => (
              <MarchRow key={m.id} march={m} onCancel={cancel} disabled={busy} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          Rapports récents
        </div>
        {reports.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-500">
            Aucun rapport.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {reports.map((r) => (
              <ReportRow key={r.id} report={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MarchRow({
  march,
  onCancel,
  disabled,
}: {
  march: ImperiumMarchRow;
  onCancel: (id: string) => void;
  disabled: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  void tick;
  const isReturning = march.state === "returning";
  const targetTime = isReturning ? march.returns_at : march.arrives_at;
  const remaining = targetTime
    ? Math.max(
        0,
        Math.floor((new Date(targetTime).getTime() - Date.now()) / 1000),
      )
    : 0;
  const totalUnits = Object.values(march.units).reduce(
    (a, b) => a + (b as number),
    0,
  );

  const canCancel =
    march.state === "outbound" &&
    new Date(march.created_at).getTime() > Date.now() - 60_000;

  return (
    <div className="flex items-center gap-3 rounded-md border border-white/10 bg-black/40 p-3 text-xs">
      <span className="text-lg">
        {kindGlyph(march.kind)}
      </span>
      <div className="flex-1">
        <div className="text-zinc-100">
          {march.kind} → ({march.to_x}, {march.to_y}) ·{" "}
          {totalUnits} unités · {isReturning ? "retour" : "aller"}
        </div>
        <div className="tabular-nums text-zinc-400">
          {formatDuration(remaining)} restant
        </div>
        {march.loot && (
          <div className="text-[10px] text-emerald-300">
            Butin : 🪵 {formatNumber(march.loot.wood ?? 0)} · 🧱{" "}
            {formatNumber(march.loot.clay ?? 0)} · ⛓️{" "}
            {formatNumber(march.loot.iron ?? 0)} · 🌾{" "}
            {formatNumber(march.loot.wheat ?? 0)}
          </div>
        )}
      </div>
      {canCancel && (
        <button
          onClick={() => onCancel(march.id)}
          disabled={disabled}
          className="rounded border border-white/10 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/5 disabled:opacity-50"
        >
          Annuler
        </button>
      )}
    </div>
  );
}

function ReportRow({ report }: { report: ImperiumReportRow }) {
  const data = report.data as Record<string, unknown>;
  const combat = data.combat as Record<string, unknown> | undefined;
  const loot = data.loot as Record<string, number> | undefined;
  const targetX = data.target_x as number | undefined;
  const targetY = data.target_y as number | undefined;

  return (
    <details className="rounded-md border border-white/10 bg-black/40 p-3 text-xs">
      <summary className="cursor-pointer">
        <span className="text-lg">{kindGlyph(report.kind)}</span>{" "}
        <span className="text-zinc-100">{report.kind}</span>{" "}
        {targetX !== undefined && (
          <span className="text-zinc-500">
            ({targetX}, {targetY})
          </span>
        )}
        <span className="ml-2 text-[10px] text-zinc-500">
          {new Date(report.created_at).toLocaleString("fr-FR")}
        </span>
      </summary>
      <div className="mt-2 space-y-1 pl-2 text-[11px] text-zinc-300">
        {combat && (
          <div>
            <span className="text-zinc-500">Ratio</span> :{" "}
            <span className="tabular-nums">{String(combat.ratio)}</span> ·{" "}
            <span className="text-zinc-500">Pertes att</span>{" "}
            {Math.round(((combat.att_loss_pct as number) || 0) * 100)}% ·{" "}
            <span className="text-zinc-500">Pertes def</span>{" "}
            {Math.round(((combat.def_loss_pct as number) || 0) * 100)}%
          </div>
        )}
        {loot && (
          <div className="text-emerald-300">
            Butin : 🪵 {formatNumber(loot.wood ?? 0)} · 🧱{" "}
            {formatNumber(loot.clay ?? 0)} · ⛓️ {formatNumber(loot.iron ?? 0)}{" "}
            · 🌾 {formatNumber(loot.wheat ?? 0)}
          </div>
        )}
        <pre className="overflow-x-auto whitespace-pre-wrap text-[10px] text-zinc-500">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </details>
  );
}

function kindGlyph(kind: string): string {
  switch (kind) {
    case "raid":
      return "💰";
    case "attack":
      return "⚔";
    case "support":
      return "🛡";
    case "spy":
      return "🕵";
    case "conquest":
      return "👑";
    case "defense":
      return "🏰";
    default:
      return "🚶";
  }
}
