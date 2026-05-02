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
          <div className="flex items-end justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-9 w-40" />
          </div>
          <Skeleton className="h-4 w-96" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
