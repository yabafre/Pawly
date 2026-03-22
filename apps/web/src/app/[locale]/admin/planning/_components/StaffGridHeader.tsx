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
        className="sticky left-0 z-10 bg-muted px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-r border-border"
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
            className={`px-2 py-3 text-center border-b border-border ${
              day.isClosed || !day.isWorkDay
                ? "bg-muted text-muted-foreground"
                : "bg-muted text-muted-foreground"
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
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {t("grid.closedDay")}
              </div>
            )}
          </div>
        );
      })}
      {/* Hours summary column header */}
      <div
        role="columnheader"
        className="sticky right-0 z-10 bg-muted px-3 py-3 text-center border-b border-l border-border"
      >
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t("grid.hoursColumn")}
        </div>
      </div>
    </div>
  );
}
