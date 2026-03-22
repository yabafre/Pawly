import { Skeleton } from "@/components/ui/skeleton";

export function EmployeeListSkeleton() {
  return (
    <>
      {/* Toolbar skeleton */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 flex-1 min-w-[200px] rounded-xl" />
        <Skeleton className="h-10 w-[180px] rounded-xl" />
        <Skeleton className="h-5 w-32 rounded" />
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>

      {/* Card grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-card p-5 space-y-4"
          >
            {/* Avatar + name + actions */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <div className="flex gap-1">
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </div>
            {/* Badges */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
            {/* Email */}
            <Skeleton className="h-3 w-40" />
            {/* Constraints button */}
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </>
  );
}
