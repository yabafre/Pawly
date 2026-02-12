import { Skeleton } from "@/components/ui/skeleton";
import { BillingOverviewSkeleton } from "./_components/BillingOverviewSkeleton";

export default function BillingLoading() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="mb-8">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <BillingOverviewSkeleton />
    </div>
  );
}
