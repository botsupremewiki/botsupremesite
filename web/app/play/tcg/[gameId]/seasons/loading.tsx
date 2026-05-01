import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <main className="flex flex-1 flex-col overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-20" />
            ))}
          </div>
          {/* Header saison courante */}
          <Skeleton className="h-32" />
          {/* Récompenses tiers */}
          <Skeleton className="h-40" />
          {/* Classement table */}
          <Skeleton className="h-72" />
        </div>
      </main>
    </div>
  );
}
