"use client";

import { useTranslations } from "next-intl";
import { getISOWeek } from "date-fns";
import type { EmployeeWeeklySummary } from "@pawly/types";

interface WeeklySummaryCardProps {
  weeklySummary: EmployeeWeeklySummary[];
  contractHours: number;
}

export function WeeklySummaryCard({
  weeklySummary,
  contractHours,
}: WeeklySummaryCardProps) {
  const t = useTranslations("dashboard.schedule.weeklySummary");
  const currentWeek = getISOWeek(new Date());
  const thisWeek = weeklySummary.find((w) => w.weekNumber === currentWeek);

  const totalHours = thisWeek ? Math.round(thisWeek.totalMinutes / 60 * 10) / 10 : 0;
  const percent = contractHours > 0 ? Math.min(Math.round((totalHours / contractHours) * 100), 100) : 0;
  const shiftCount = thisWeek?.shiftCount ?? 0;

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
        <span className="text-sm text-neutral-400">
          {t("shifts", { count: shiftCount })}
        </span>
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
