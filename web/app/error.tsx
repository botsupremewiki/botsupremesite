"use client";

/**
 * Page d'erreur globale (équivalent /500). Affichée par Next.js quand
 * un server component lève une exception non capturée. "use client"
 * obligatoire pour avoir le bouton "Réessayer".
 *
 * Le `error.digest` est l'ID Sentry / Vercel logs — utile à donner au
 * support pour qu'on retrouve la stack côté server.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log côté console pour debug local. En prod c'est déjà dans Sentry
    // via instrumentation.ts.
    console.error("[error.tsx]", error);
  }, [error]);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(244,63,94,0.06),transparent_60%)] p-8 text-center">
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-rose-400/40 bg-rose-400/10">
        <AlertTriangle size={48} className="text-rose-300" aria-hidden="true" />
      </div>
      <div className="text-6xl font-black tracking-tight text-zinc-100 sm:text-7xl">
        Oups…
      </div>
      <h1 className="mt-3 max-w-md text-xl font-semibold text-zinc-200">
        Une erreur inattendue s&apos;est produite.
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
        On a noté l&apos;incident dans nos logs. Tu peux réessayer
        l&apos;action ou retourner à l&apos;accueil.
      </p>
      {error.digest ? (
        <div className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-mono text-zinc-500">
          ID erreur : <span className="text-zinc-300">{error.digest}</span>
        </div>
      ) : null}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md border border-amber-400/50 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-400/20"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Réessayer
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/10"
        >
          <Home size={14} aria-hidden="true" />
          Accueil
        </Link>
      </div>
    </div>
  );
}
