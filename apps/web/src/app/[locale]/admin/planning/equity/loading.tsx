import { Skeleton } from "@/components/ui/skeleton";

export default function EquityLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="flex gap-3">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
