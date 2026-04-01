"use client";

import { useTranslations } from "next-intl";
import type { ScheduleShift } from "@pawly/validators";

type Props = {
  shift: ScheduleShift;
};

export function ShiftCell({ shift }: Props) {
  const t = useTranslations("admin.scheduleView.shift");

  return (
    <div className="rounded-lg px-2 py-1.5 mb-1 last:mb-0 text-xs bg-card border border-border shadow-sm">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="font-semibold text-foreground truncate">
          {shift.shiftTypeCode}
        </span>
        {shift.source === "MANUAL" && (
          <span className="text-[9px] font-medium text-muted-foreground italic">
            {t("manual")}
          </span>
        )}
      </div>
      <div className="text-muted-foreground">
        {shift.startTime} - {shift.endTime}
      </div>
    </div>
  );
}
