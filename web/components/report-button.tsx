"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const REASONS: { id: string; label: string; description: string }[] = [
  {
    id: "cheat",
    label: "🛡️ Triche",
    description: "Comportement suspect, hack, exploit",
  },
  {
    id: "toxic",
    label: "💢 Toxique",
    description: "Insultes, menaces, harcèlement",
  },
  {
    id: "spam",
    label: "📢 Spam",
    description: "Pub, flood, contenu indésirable",
  },
  {
    id: "other",
    label: "⚠️ Autre",
    description: "Tout autre problème",
  },
];

export function ReportButton({
  targetId,
  targetUsername,
  contextKind,
  contextId,
}: {
  targetId: string;
  targetUsername: string;
  contextKind?: string;
  contextId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase indisponible");
      setBusy(false);
      return;
    }
    const { error: rpcErr } = await supabase.rpc("create_user_report", {
      p_target_id: targetId,
      p_reason: reason,
      p_context_kind: contextKind ?? null,
      p_context_id: contextId ?? null,
      p_comment: comment.trim() || null,
    });
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setDone(true);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Signaler ${targetUsername}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/30 bg-rose-400/5 px-2.5 py-1 text-[11px] text-rose-200 transition-colors hover:bg-rose-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
        title="Signaler un comportement"
      >
        <Flag size={12} aria-hidden="true" />
        Signaler
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !busy && setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="report-dialog-title" className="text-lg font-bold text-zinc-100">
          Signaler {targetUsername}
        </h3>
        {done ? (
          <div className="mt-4 rounded-md border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm text-emerald-200">
            ✅ Signalement envoyé. Merci de contribuer à un site sain.
            <div className="mt-3 text-right">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-xs text-zinc-400">
              Choisis une raison. Les signalements sont revus manuellement
              par un admin (max 5 par jour).
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  className={`rounded-md border p-2 text-left text-sm transition-colors ${
                    reason === r.id
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
                      : "border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="font-bold">{r.label}</div>
                  <div className="text-[11px] text-zinc-400">
                    {r.description}
                  </div>
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Détails (optionnel)…"
              className="mt-3 w-full rounded-md border border-white/10 bg-black/30 p-2 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-amber-300/40"
            />
            {error ? (
              <div className="mt-2 text-xs text-rose-300">{error}</div>
            ) : null}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/10"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!reason || busy}
                onClick={submit}
                className="rounded-md border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-400/20 disabled:opacity-50"
              >
                {busy ? "…" : "Envoyer"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
