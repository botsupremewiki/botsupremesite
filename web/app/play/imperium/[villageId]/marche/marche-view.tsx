"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  IMPERIUM_RESOURCES,
  formatNumber,
  type ImperiumVillageRow,
  type ImperiumResource,
} from "@shared/imperium";

type Order = {
  id: string;
  seller_village_id: string;
  give_kind: ImperiumResource;
  give_amount: number;
  take_kind: ImperiumResource;
  take_amount: number;
  expires_at: string;
  state: string;
};

type Props = {
  village: ImperiumVillageRow;
  initialOrders: Order[];
};

export function MarcheView({ village, initialOrders }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form post order
  const [giveKind, setGiveKind] = useState<ImperiumResource>("wood");
  const [giveAmount, setGiveAmount] = useState(1000);
  const [takeKind, setTakeKind] = useState<ImperiumResource>("clay");
  const [takeAmount, setTakeAmount] = useState(1000);

  async function refresh() {
    const supabase = createClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("imperium_market_orders")
      .select("*")
      .eq("state", "open")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setOrders(data as Order[]);
  }

  async function postOrder() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc(
        "imperium_market_post_order",
        {
          p_village_id: village.id,
          p_give_kind: giveKind,
          p_give_amount: giveAmount,
          p_take_kind: takeKind,
          p_take_amount: takeAmount,
          p_duration_hours: 24,
        },
      );
      if (rpcErr) throw rpcErr;
      await refresh();
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function fulfill(orderId: string) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc(
        "imperium_market_fulfill_order",
        { p_order_id: orderId, p_buyer_village_id: village.id },
      );
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

      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          Poster un ordre
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <ResourceSelector
            label="Donner"
            kind={giveKind}
            amount={giveAmount}
            onKind={setGiveKind}
            onAmount={setGiveAmount}
          />
          <span className="text-zinc-500">↔</span>
          <ResourceSelector
            label="Recevoir"
            kind={takeKind}
            amount={takeAmount}
            onKind={setTakeKind}
            onAmount={setTakeAmount}
          />
          <button
            onClick={postOrder}
            disabled={busy || giveKind === takeKind}
            className="ml-auto rounded bg-amber-500 px-4 py-2 text-xs font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
          >
            Poster
          </button>
        </div>
      </section>

      <section>
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          Ordres ouverts ({orders.length})
        </div>
        {orders.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-500">
            Aucun ordre actuellement.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {orders.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                isMine={o.seller_village_id === village.id}
                onFulfill={() => fulfill(o.id)}
                disabled={busy}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ResourceSelector({
  label,
  kind,
  amount,
  onKind,
  onAmount,
}: {
  label: string;
  kind: ImperiumResource;
  amount: number;
  onKind: (k: ImperiumResource) => void;
  onAmount: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500">{label}</span>
      <select
        value={kind}
        onChange={(e) => onKind(e.target.value as ImperiumResource)}
        className="rounded border border-white/10 bg-black/40 px-2 py-1 text-zinc-100"
      >
        {(Object.keys(IMPERIUM_RESOURCES) as ImperiumResource[]).map((r) => (
          <option key={r} value={r}>
            {IMPERIUM_RESOURCES[r].glyph} {IMPERIUM_RESOURCES[r].name}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={1}
        value={amount}
        onChange={(e) => onAmount(Math.max(1, parseInt(e.target.value) || 1))}
        className="w-24 rounded border border-white/10 bg-black/40 px-2 py-1 text-right text-zinc-100"
      />
    </div>
  );
}

function OrderRow({
  order,
  isMine,
  onFulfill,
  disabled,
}: {
  order: Order;
  isMine: boolean;
  onFulfill: () => void;
  disabled: boolean;
}) {
  const give = IMPERIUM_RESOURCES[order.give_kind];
  const take = IMPERIUM_RESOURCES[order.take_kind];
  return (
    <div
      className={`flex items-center gap-3 rounded border px-3 py-2 text-xs ${
        isMine
          ? "border-amber-400/30 bg-amber-400/5"
          : "border-white/5 bg-white/[0.03]"
      }`}
    >
      <div className={`tabular-nums ${give.accent}`}>
        {give.glyph} {formatNumber(order.give_amount)}
      </div>
      <span className="text-zinc-500">↔</span>
      <div className={`tabular-nums ${take.accent}`}>
        {take.glyph} {formatNumber(order.take_amount)}
      </div>
      <span className="text-[10px] text-zinc-500">
        ratio {(order.take_amount / order.give_amount).toFixed(2)}
      </span>
      <span className="ml-auto text-[10px] text-zinc-500">
        expire{" "}
        {new Date(order.expires_at).toLocaleDateString("fr-FR")}
      </span>
      {!isMine ? (
        <button
          onClick={onFulfill}
          disabled={disabled}
          className="rounded bg-emerald-500/80 px-2 py-1 text-[10px] font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          Acheter
        </button>
      ) : (
        <span className="rounded bg-amber-400/20 px-2 py-1 text-[10px] text-amber-200">
          Mon ordre
        </span>
      )}
    </div>
  );
}
