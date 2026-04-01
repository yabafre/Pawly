import { Skeleton } from "@/components/ui/skeleton";
import { SettingsSkeleton } from "./_components/SettingsSkeleton";

export default function SettingsLoading() {
  return (
    <div className="relative space-y-6 animate-in fade-in duration-700">
      {/* Header skeleton */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="space-y-3">
          <Skeleton className="h-7 w-40 rounded-full" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </section>

      <SettingsSkeleton />
    </div>
  );
}
