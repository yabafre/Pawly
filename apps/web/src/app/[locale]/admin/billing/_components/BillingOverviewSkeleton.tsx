import { Skeleton } from "@/components/ui/skeleton";

export function BillingOverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Subscription card skeleton */}
      <div className="rounded-2xl bg-white shadow-[0_4px_20px_-4px_rgba(0,149,136,0.15)] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="h-8 w-24 mb-3" />
        <Skeleton className="h-4 w-48" />
        <div className="mt-4">
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
      </div>
      {/* Invoices table skeleton */}
      <div className="rounded-2xl bg-white shadow-[0_4px_20px_-4px_rgba(0,149,136,0.15)] p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-14 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
