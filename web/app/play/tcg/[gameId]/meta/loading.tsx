import { Skeleton, SkeletonGrid } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <main className="flex flex-1 flex-col overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          {/* CombatNav skeleton */}
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-20" />
            ))}
          </div>
          {/* Title + intro */}
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-4 w-96" />
          </div>
          {/* Overview tiles (5) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          {/* Top players section */}
          <div>
            <Skeleton className="h-6 w-64" />
            <div className="mt-3 rounded-xl border border-white/5">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="m-2 h-10" />
              ))}
            </div>
          </div>
          {/* Top cards grid */}
          <div>
            <Skeleton className="h-6 w-72" />
            <div className="mt-3">
              <SkeletonGrid
                count={12}
                cols="grid-cols-3 sm:grid-cols-4"
                height="h-32"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
