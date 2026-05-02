import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <main className="flex flex-1 flex-col overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-20" />
            ))}
          </div>
          <Skeleton className="h-8 w-40" />
          {/* Tabs En attente / Acceptés / Envoyés */}
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
          </div>
          {/* Trade rows */}
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
