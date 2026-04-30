"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Cosmetic = {
  id: string;
  label: string;
  unlocked: boolean;
  color?: string;
};

type CosmeticsResponse = {
  titles: Cosmetic[];
  borders: Cosmetic[];
  current_title: string | null;
  current_border: string | null;
};

export function CosmeticsClient({ data }: { data: CosmeticsResponse }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState<string | null>(data.current_title);
  const [border, setBorder] = useState<string | null>(data.current_border);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setToast(null);
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase indisponible");
      setBusy(false);
      return;
    }
    const { error: rpcErr } = await supabase.rpc("set_my_cosmetics", {
      p_title: title,
      p_border: border,
    });
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setToast("Cosmétiques sauvegardés ✨");
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* ─── Titres ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-5">
        <h2 className="text-lg font-bold text-zinc-100">🏷️ Titres</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Affiché sous ton pseudo dans les profils, classements et
          tournois.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.titles.map((t) => {
            const selected = title === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={!t.unlocked}
                onClick={() => setTitle(t.id)}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  !t.unlocked
                    ? "border-white/5 bg-black/30 text-zinc-600 line-through cursor-not-allowed"
                    : selected
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
                      : "border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.07]"
                }`}
              >
                {t.label}
                {!t.unlocked ? " 🔒" : ""}
                {selected ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Bordures ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-5">
        <h2 className="text-lg font-bold text-zinc-100">🎨 Bordure d&apos;avatar</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Encadre ton avatar dans les profils et UserPill.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-8">
          {data.borders.map((b) => {
            const selected = border === b.id;
            const bg =
              b.color === "rainbow"
                ? "linear-gradient(135deg, #f87171, #fbbf24, #34d399, #60a5fa, #a78bfa)"
                : b.color ?? "#666";
            return (
              <button
                key={b.id}
                type="button"
                disabled={!b.unlocked}
                onClick={() => setBorder(b.id)}
                title={b.label}
                className={`flex flex-col items-center gap-1 transition-opacity ${
                  !b.unlocked ? "opacity-30 cursor-not-allowed" : ""
                }`}
              >
                <div
                  className={`h-12 w-12 rounded-full p-[3px] transition-transform ${
                    selected ? "scale-110 ring-2 ring-amber-300/60" : ""
                  }`}
                  style={{ background: bg }}
                >
                  <div className="h-full w-full rounded-full bg-zinc-900" />
                </div>
                <span className="text-[10px] text-zinc-300">{b.label}</span>
                {selected ? <span className="text-[10px] text-amber-300">✓</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
        >
          {busy ? "…" : "Enregistrer"}
        </button>
        {error ? <span className="text-xs text-rose-300">{error}</span> : null}
        {toast ? <span className="text-xs text-emerald-300">{toast}</span> : null}
      </div>
    </div>
  );
}
