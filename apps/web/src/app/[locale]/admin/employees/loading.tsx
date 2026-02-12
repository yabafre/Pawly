import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeListSkeleton } from "./_components/EmployeeListSkeleton";

export default function EmployeesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
      <EmployeeListSkeleton />
    </div>
  );
}
