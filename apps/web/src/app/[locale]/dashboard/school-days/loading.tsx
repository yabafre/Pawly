import { Skeleton } from "@/components/ui/skeleton";

export default function SchoolDaysLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 mt-1" />
      </div>
      <div className="rounded-3xl bg-white p-6 shadow-sm border border-neutral-100">
        <Skeleton className="h-[340px] w-full rounded-2xl" />
      </div>
    </div>
  );
}
