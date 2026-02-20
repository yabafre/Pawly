"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { CalendarX } from "lucide-react";
import { StaffGrid } from "./StaffGrid";
import { WeekNavigator } from "./WeekNavigator";
import { useScheduleView } from "../_hooks/useScheduleView";
import type { ScheduleViewData } from "@pawly/validators";

type Props = {
  month: string;
};

export function ScheduleViewWrapper({ month }: Props) {
  const t = useTranslations("admin.scheduleView");
  const {
    scheduleData,
    isLoading,
    currentWeekData,
    weeks,
    weekOffset,
    goToWeek,
  } = useScheduleView(month);

  // Build conflict map from violations for cell-level lookup
  const conflictMap = useMemo(() => {
    const map = new Map<
      string,
      Array<{ message: string; severity: "blocking" | "warning" }>
    >();
    if (!scheduleData?.violations) return map;

    for (const v of scheduleData.violations.hard) {
      if (v.affectedEmployeeId && v.affectedDate) {
        const key = `${v.affectedEmployeeId}|${v.affectedDate}`;
        const arr = map.get(key) || [];
        arr.push({ message: v.message, severity: "blocking" });
        map.set(key, arr);
      }
    }

    for (const v of scheduleData.violations.soft) {
      if (v.affectedEmployeeId && v.affectedDate) {
        const key = `${v.affectedEmployeeId}|${v.affectedDate}`;
        const arr = map.get(key) || [];
        arr.push({ message: v.message, severity: "warning" });
        map.set(key, arr);
      }
    }

    return map;
  }, [scheduleData?.violations]);

  // Loading state
  if (isLoading) {
    return <ScheduleViewSkeleton />;
  }

  // Empty state: no data or no shifts
  if (!scheduleData || !currentWeekData) {
    return (
      <div className="bg-white rounded-3xl border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-12 text-center">
        <CalendarX size={48} className="mx-auto text-neutral-300 mb-4" />
        <h3 className="text-lg font-bold text-neutral-900 mb-2">
          {t("emptyState.title")}
        </h3>
        <p className="text-sm text-neutral-500">
          {t("emptyState.description")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: title + week navigator */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">
            {t("title")}
          </h2>
          <p className="text-sm text-neutral-500">{t("subtitle")}</p>
        </div>
        <WeekNavigator
          weeks={weeks}
          currentWeekIndex={weekOffset}
          onWeekChange={goToWeek}
        />
      </div>

      {/* Staff Grid */}
      <StaffGrid
        employees={scheduleData.employees}
        days={currentWeekData.days}
        shifts={currentWeekData.shifts}
        unavailabilities={currentWeekData.unavailabilities}
        holes={currentWeekData.holes}
        conflictMap={conflictMap}
      />
    </div>
  );
}

function ScheduleViewSkeleton() {
  return (
    <div className="bg-white rounded-3xl border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="p-6 space-y-4 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 bg-neutral-100 rounded" />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-8 bg-neutral-100 rounded-lg" />
            ))}
          </div>
        </div>
        {/* Grid skeleton */}
        {[1, 2, 3, 4].map((row) => (
          <div key={row} className="flex gap-2">
            <div className="h-14 w-[200px] bg-neutral-100 rounded shrink-0" />
            {[1, 2, 3, 4, 5, 6, 7].map((col) => (
              <div key={col} className="h-14 flex-1 bg-neutral-50 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
