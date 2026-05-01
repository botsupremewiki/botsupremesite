/**
 * Composant Skeleton : placeholder animé pour les loading states.
 *
 * Variants :
 *  - <SkeletonText /> : ligne de texte (ratio width = 80%)
 *  - <SkeletonCard /> : carte rectangulaire (boosters, cartes Pokémon, etc.)
 *  - <SkeletonRow /> : ligne d'un tableau (history, leaderboard)
 *  - <SkeletonAvatar /> : avatar circulaire
 *  - <Skeleton className="..." /> : raw block stylable
 *
 * L'animation pulse est désactivée si prefers-reduced-motion (CSS global).
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-white/5 ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({
  width = "80%",
  className = "",
}: {
  width?: string;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse h-3 rounded bg-white/5 ${className}`}
      style={{ width }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({
  height = "h-32",
  className = "",
}: {
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-lg border border-white/5 bg-white/[0.03] ${height} ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonAvatar({ size = "h-12 w-12" }: { size?: string }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-white/5 ${size}`}
      aria-hidden="true"
    />
  );
}

/** Grille générique de N skeletons cards. Utilisée pour la collection,
 * les boosters, les decks. */
export function SkeletonGrid({
  count = 12,
  cols = "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
  height = "h-44",
}: {
  count?: number;
  cols?: string;
  height?: string;
}) {
  return (
    <div className={`grid gap-3 ${cols}`} aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} height={height} />
      ))}
    </div>
  );
}
