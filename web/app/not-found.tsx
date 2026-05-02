import Link from "next/link";
import { Compass, Home, HelpCircle } from "lucide-react";

export const metadata = {
  title: "404 — Page introuvable | Site Ultime",
};

/**
 * 404 globale : sert pour toute route inconnue ou pour les notFound()
 * appelés depuis les pages (ex tournament invalide, carte invalide).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.06),transparent_60%)] p-8 text-center">
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10">
        <Compass size={48} className="text-amber-300" aria-hidden="true" />
      </div>
      <div className="text-7xl font-black tracking-tight text-zinc-100 sm:text-8xl">
        404
      </div>
      <h1 className="mt-3 max-w-md text-xl font-semibold text-zinc-200">
        Cette page s&apos;est perdue dans la plaza.
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
        L&apos;URL que tu as suivie n&apos;existe pas ou a été déplacée.
        Reviens à l&apos;accueil ou utilise la palette de commandes
        (Cmd+K) pour naviguer.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md border border-amber-400/50 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-400/20"
        >
          <Home size={14} aria-hidden="true" />
          Accueil
        </Link>
        <Link
          href="/play"
          className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/10"
        >
          🏛️ Plaza
        </Link>
        <Link
          href="/help"
          className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/10"
        >
          <HelpCircle size={14} aria-hidden="true" />
          Aide
        </Link>
      </div>
    </div>
  );
}
