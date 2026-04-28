"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resyncAllDiscordProfiles,
  resyncMyDiscordProfile,
} from "@/app/actions/discord-resync";
import type { BulkResyncSummary } from "@/lib/discord-bot-fetch";

// UI client de la page admin /admin/sync-roles. Deux actions :
//   - "Resync mon profil" : rapide (1 appel Discord), pour tester que le
//     bot token et le guild ID sont bien configurés avant de lancer la
//     sync de masse.
//   - "Resync tout le monde" : itère sur tous les profils avec discord_id.
//     Renvoie un résumé { synced, skipped, errors }.

export function SyncRolesClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selfMessage, setSelfMessage] = useState<string | null>(null);
  const [bulkSummary, setBulkSummary] = useState<BulkResyncSummary | null>(
    null,
  );

  const onResyncSelf = () => {
    setSelfMessage(null);
    startTransition(async () => {
      try {
        const r = await resyncMyDiscordProfile();
        if (r.ok) {
          setSelfMessage(`✅ Pseudo : ${r.username ?? "—"}`);
          router.refresh();
        } else {
          setSelfMessage(`❌ ${r.reason ?? "erreur inconnue"}`);
        }
      } catch (e) {
        // Next.js signale ses redirects/notFound via une "erreur" qu'il
        // faut laisser remonter. Ne pas l'afficher au joueur.
        if (isFrameworkSignal(e)) throw e;
        setSelfMessage(`❌ ${(e as Error).message}`);
      }
    });
  };

  const onResyncAll = () => {
    if (
      !confirm(
        "Resync tous les profils liés à Discord ? Ça peut prendre quelques secondes selon le nombre de joueurs.",
      )
    ) {
      return;
    }
    setBulkSummary(null);
    startTransition(async () => {
      try {
        const summary = await resyncAllDiscordProfiles();
        setBulkSummary(summary);
        router.refresh();
      } catch (e) {
        if (isFrameworkSignal(e)) throw e;
        setBulkSummary({
          total: 0,
          synced: 0,
          skipped: 0,
          errors: [{ profileId: "*", reason: (e as Error).message }],
        });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Mon profil
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Test rapide pour vérifier que le bot peut bien lire tes infos
              Discord.
            </p>
          </div>
          <button
            type="button"
            onClick={onResyncSelf}
            disabled={pending}
            className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-60"
          >
            {pending ? "..." : "Resync mon profil"}
          </button>
        </div>
        {selfMessage && (
          <div className="mt-3 text-sm text-zinc-300">{selfMessage}</div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Tous les profils
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Itère sur chaque joueur lié à Discord et met à jour son pseudo,
              son avatar et ses rôles. Petit délai entre chaque appel pour
              respecter Discord.
            </p>
          </div>
          <button
            type="button"
            onClick={onResyncAll}
            disabled={pending}
            className="rounded-full bg-fuchsia-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-fuchsia-400 disabled:opacity-60"
          >
            {pending ? "Synchronisation..." : "Resync tout le monde"}
          </button>
        </div>
        {bulkSummary && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <SummaryStat
              label="OK"
              value={bulkSummary.synced}
              tone="emerald"
            />
            <SummaryStat
              label="Ignorés"
              value={bulkSummary.skipped}
              tone="amber"
              hint="404 Discord (joueurs ayant quitté le serveur)"
            />
            <SummaryStat
              label="Erreurs"
              value={bulkSummary.errors.length}
              tone="rose"
            />
          </div>
        )}
        {bulkSummary && bulkSummary.errors.length > 0 && (
          <details className="mt-3 rounded-md bg-rose-500/5 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-rose-300">
              Voir les erreurs ({bulkSummary.errors.length})
            </summary>
            <ul className="mt-2 space-y-1 text-rose-200/80">
              {bulkSummary.errors.slice(0, 50).map((e) => (
                <li key={e.profileId} className="font-mono">
                  {e.profileId.slice(0, 8)}… : {e.reason}
                </li>
              ))}
              {bulkSummary.errors.length > 50 && (
                <li className="italic text-rose-200/60">
                  +{bulkSummary.errors.length - 50} autres
                </li>
              )}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

/** Vrai pour les "erreurs" internes Next.js (redirect, notFound) qu'il
 *  faut re-throw pour que le framework finisse la nav. */
function isFrameworkSignal(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const digest = (e as { digest?: unknown }).digest;
  if (typeof digest === "string") {
    return (
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_NOT_FOUND") ||
      digest.startsWith("DYNAMIC_SERVER_USAGE")
    );
  }
  const message = (e as { message?: unknown }).message;
  return typeof message === "string" && message === "NEXT_REDIRECT";
}

function SummaryStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "rose";
  hint?: string;
}) {
  const colorClass =
    tone === "emerald"
      ? "text-emerald-400"
      : tone === "amber"
        ? "text-amber-400"
        : "text-rose-400";
  return (
    <div className="rounded-md border border-white/5 bg-black/20 p-3">
      <div className={`text-2xl font-bold tabular-nums ${colorClass}`}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      {hint && <div className="mt-1 text-[10px] text-zinc-600">{hint}</div>}
    </div>
  );
}
