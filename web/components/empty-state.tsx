/**
 * EmptyState : composant standardisé pour les "rien ici" avec icône
 * grosse, titre, description, et CTA optionnel. Beaucoup plus engageant
 * qu'un simple "Aucun X" en gris.
 *
 * Usage :
 *   <EmptyState
 *     icon="📜"
 *     title="Aucun match"
 *     description="Joue ton premier PvP pour voir ton historique."
 *     cta={{ label: "Lancer un match", href: "/play/tcg/pokemon/battle/pvp" }}
 *   />
 */

import Link from "next/link";

export function EmptyState({
  icon,
  title,
  description,
  cta,
  variant = "neutral",
}: {
  icon: string;
  title: string;
  description?: string;
  cta?: { label: string; href: string } | { label: string; onClick: () => void };
  variant?: "neutral" | "amber" | "rose" | "emerald";
}) {
  const variants = {
    neutral: "border-white/10 bg-black/30",
    amber: "border-amber-400/30 bg-amber-400/[0.03]",
    rose: "border-rose-400/30 bg-rose-400/[0.03]",
    emerald: "border-emerald-400/30 bg-emerald-400/[0.03]",
  };
  return (
    <div
      className={`rounded-xl border-2 border-dashed p-10 text-center ${variants[variant]}`}
      role="status"
    >
      <div className="text-5xl" aria-hidden="true">
        {icon}
      </div>
      <h3 className="mt-3 text-lg font-bold text-zinc-100">{title}</h3>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">
          {description}
        </p>
      ) : null}
      {cta ? (
        "href" in cta ? (
          <Link
            href={cta.href}
            className="mt-4 inline-flex items-center gap-1 rounded-md border border-amber-400/50 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {cta.label} →
          </Link>
        ) : (
          <button
            type="button"
            onClick={cta.onClick}
            className="mt-4 inline-flex items-center gap-1 rounded-md border border-amber-400/50 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {cta.label}
          </button>
        )
      ) : null}
    </div>
  );
}
