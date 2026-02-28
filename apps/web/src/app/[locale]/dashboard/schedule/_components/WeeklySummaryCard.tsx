"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import type { EmployeeWeeklySummary, EmployeeShift } from "@pawly/types";

interface WeeklySummaryCardProps {
  weeklySummary: EmployeeWeeklySummary[];
  contractHours: number;
  shifts?: EmployeeShift[];
}

export function WeeklySummaryCard({
  weeklySummary,
  contractHours,
  shifts = [],
}: WeeklySummaryCardProps) {
  const t = useTranslations("dashboard.schedule.weeklySummary");
  const today = useMemo(() => new Date(), []);
  const currentWeek = getISOWeek(today);
  const currentWeekYear = getISOWeekYear(today);
  const thisWeek = weeklySummary.find((w) => w.weekNumber === currentWeek);

  const totalHours = thisWeek ? Math.round(thisWeek.totalMinutes / 60 * 10) / 10 : 0;
  const percent = contractHours > 0 ? Math.min(Math.round((totalHours / contractHours) * 100), 100) : 0;
  const shiftCount = thisWeek?.shiftCount ?? 0;

  // Compute confirmed/total ratio for current week shifts (year-aware, H4 fix)
  const weekShifts = useMemo(
    () =>
      shifts.filter((s) => {
        const d = parseISO(s.date);
        return getISOWeek(d) === currentWeek && getISOWeekYear(d) === currentWeekYear;
      }),
    [shifts, currentWeek, currentWeekYear],
  );
  const confirmedCount = weekShifts.filter((s) => s.isConfirmed).length;
  const weekTotal = weekShifts.length;

  return (
    <div className="rounded-xl bg-neutral-900 p-4 text-white shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">
          {t("title")}
        </span>
        <span className="text-xs text-neutral-400">
          {t("target", { target: contractHours })}
        </span>
      </div>

      <div className="mb-3 flex items-end justify-between">
        <span className="text-2xl font-bold">
          {t("hours", { hours: totalHours })}
        </span>
        <div className="text-right">
          <span className="block text-sm text-neutral-400">
            {t("shifts", { count: shiftCount })}
          </span>
          {weekTotal > 0 && (
            <span className="block text-xs text-emerald-400">
              {t("confirmedRatio", { confirmed: confirmedCount, total: weekTotal })}
            </span>
          )}
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-neutral-700">
        <div
          className="h-full rounded-full bg-emerald-400 transition-all duration-500"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("progress", { percent })}
        />
      </div>
    </div>
  );
}
