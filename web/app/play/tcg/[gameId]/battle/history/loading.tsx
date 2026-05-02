import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-28" />
      </div>
      <main className="flex flex-1 flex-col overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-20" />
            ))}
          </div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
          {/* Filters bar */}
          <Skeleton className="h-24" />
          {/* Match list */}
          <div className="flex flex-col gap-2">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
