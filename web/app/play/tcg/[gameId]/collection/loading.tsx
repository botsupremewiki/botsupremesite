import { SkeletonGrid, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header skeleton */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      <main className="flex flex-1 flex-col p-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          {/* Title + filters skeletons */}
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-20" />
            ))}
          </div>
          {/* Cards grid skeleton */}
          <SkeletonGrid count={18} />
        </div>
      </main>
    </div>
  );
}
