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

const EMPTY_SHIFTS: EmployeeShift[] = [];

export function WeeklySummaryCard({
  weeklySummary,
  contractHours,
  shifts = EMPTY_SHIFTS,
}: WeeklySummaryCardProps) {
  const t = useTranslations("dashboard.schedule.weeklySummary");
  const today = useMemo(() => new Date(), []);
  const currentWeek = getISOWeek(today);
  const currentWeekYear = getISOWeekYear(today);
  const thisWeek = weeklySummary.find((w) => w.weekNumber === currentWeek);

  const totalHours = thisWeek ? Math.round(thisWeek.totalMinutes / 60 * 10) / 10 : 0;
  const percent = contractHours > 0 ? Math.min(Math.round((totalHours / contractHours) * 100), 100) : 0;
  const shiftCount = thisWeek?.shiftCount ?? 0;

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
    <div className="rounded-2xl bg-card border p-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {t("title")}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("target", { target: contractHours })}
        </span>
      </div>

      <div className="mb-3 flex items-end justify-between">
        <span className="text-2xl font-bold">
          {t("hours", { hours: totalHours })}
        </span>
        <div className="text-right">
          <span className="block text-sm text-muted-foreground">
            {t("shifts", { count: shiftCount })}
          </span>
          {weekTotal > 0 && (
            <span className="block text-xs text-primary">
              {t("confirmedRatio", { confirmed: confirmedCount, total: weekTotal })}
            </span>
          )}
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
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
