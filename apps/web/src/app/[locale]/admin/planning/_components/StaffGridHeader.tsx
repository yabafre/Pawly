"use client";

import { useTranslations, useLocale } from "next-intl";
import type { ScheduleDayInfo } from "@pawly/validators";

type Props = {
  days: ScheduleDayInfo[];
};

export function StaffGridHeader({ days }: Props) {
  const t = useTranslations("admin.scheduleView");
  const locale = useLocale();

  return (
    <div role="row" className="contents">
      {/* Employee column header */}
      <div
        role="columnheader"
        className="sticky left-0 z-10 bg-neutral-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-neutral-400 border-b border-r border-neutral-100"
      >
        {t("grid.employeeColumn")}
      </div>
      {/* Day column headers */}
      {days.map((day) => {
        const date = new Date(`${day.date}T00:00:00`);
        const dayName = date.toLocaleDateString(locale, { weekday: "short" });
        const dayNum = date.toLocaleDateString(locale, { day: "numeric" });

        return (
          <div
            key={day.date}
            role="columnheader"
            className={`px-2 py-3 text-center border-b border-neutral-100 ${
              day.isClosed || !day.isWorkDay
                ? "bg-neutral-100 text-neutral-400"
                : "bg-neutral-50 text-neutral-600"
            }`}
          >
            <div className="text-xs font-bold uppercase">{dayName}</div>
            <div className="text-sm font-semibold">{dayNum}</div>
            {day.isSpecialDay && day.specialDayLabel && (
              <div className="text-[10px] text-teal-600 truncate mt-0.5">
                {day.specialDayLabel}
              </div>
            )}
            {day.isClosed && (
              <div className="text-[10px] text-neutral-400 mt-0.5">
                {t("grid.closedDay")}
              </div>
            )}
          </div>
        );
      })}
      {/* Hours summary column header */}
      <div
        role="columnheader"
        className="sticky right-0 z-10 bg-neutral-50 px-3 py-3 text-center border-b border-l border-neutral-100"
      >
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
          {t("grid.hoursColumn")}
        </div>
      </div>
    </div>
  );
}
