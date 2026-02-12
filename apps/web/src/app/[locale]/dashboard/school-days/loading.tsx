import { Skeleton } from "@/components/ui/skeleton";

export default function SchoolDaysLoading() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <Skeleton className="h-7 sm:h-8 w-2/3 max-w-64" />
        <Skeleton className="h-4 w-full sm:w-4/5 max-w-96 mt-1" />
      </div>
      <div className="rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-6 shadow-sm border border-neutral-100">
        <Skeleton className="h-[280px] sm:h-[340px] w-full rounded-xl sm:rounded-2xl" />
      </div>
    </div>
  );
}
