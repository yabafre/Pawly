import { Skeleton } from "@/components/ui/skeleton";

export default function SchoolDaysLoading() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-7 w-2/3 max-w-64" />
        <Skeleton className="h-4 w-full sm:w-4/5 max-w-96 mt-1" />
      </div>
      <div className="rounded-2xl bg-card border p-5">
        <Skeleton className="h-[280px] sm:h-[340px] w-full rounded-xl" />
      </div>
    </div>
  );
}
