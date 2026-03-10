"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { useMySchedule, useMyShiftTypes } from "../_hooks/useMySchedule";
import { MonthSelector } from "./MonthSelector";
import { PublicationBadge } from "./PublicationBadge";
import { WeeklySummaryCard } from "./WeeklySummaryCard";
import { ScheduleTimeline } from "./ScheduleTimeline";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import type { EmployeeScheduleData, EmployeeShiftTypeInfo } from "@pawly/types";

export function SchedulePageClient() {
  const t = useTranslations("dashboard.schedule");
  const [selectedMonth, setSelectedMonth] = useState(
    () => format(new Date(), "yyyy-MM"),
  );

  const { data: rawScheduleData, isPending, isError, refetch } = useMySchedule(selectedMonth);
  const { data: rawShiftTypes } = useMyShiftTypes();
  const scheduleData = rawScheduleData as EmployeeScheduleData | undefined;
  const shiftTypes = rawShiftTypes as EmployeeShiftTypeInfo[] | undefined;

  const allShiftTypes = (shiftTypes ?? scheduleData?.shiftTypes ?? []) as EmployeeShiftTypeInfo[];
  const shiftTypeMap = useMemo(
    () => new Map<string, EmployeeShiftTypeInfo>(
      allShiftTypes.map((st) => [st.code, st]),
    ),
    [allShiftTypes],
  );

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full rounded-xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <AlertCircle className="h-10 w-10 text-rose-400" />
        <p className="text-sm text-neutral-600">{t("errors.loadFailed")}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );
  }

  const hasContent =
    scheduleData &&
    (scheduleData.shifts.length > 0 ||
      scheduleData.unavailabilities.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">
          {t("title")}
        </h1>
        {scheduleData && (
          <PublicationBadge
            status={scheduleData.publicationStatus.status}
            publishedAt={scheduleData.publicationStatus.publishedAt}
          />
        )}
      </div>

      <MonthSelector
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
      />

      {scheduleData && (
        <WeeklySummaryCard
          weeklySummary={scheduleData.weeklySummary}
          contractHours={scheduleData.employee.contractHours}
          shifts={scheduleData.shifts}
        />
      )}

      {hasContent ? (
        <ScheduleTimeline
          shifts={scheduleData.shifts}
          unavailabilities={scheduleData.unavailabilities}
          shiftTypeMap={shiftTypeMap}
          month={selectedMonth}
          publicationStatus={scheduleData.publicationStatus.status}
        />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
