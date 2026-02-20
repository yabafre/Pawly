"use client";

import { useTranslations } from "next-intl";
import type { ScheduleShift } from "@pawly/validators";

type Props = {
  shift: ScheduleShift;
};

export function ShiftCell({ shift }: Props) {
  const t = useTranslations("admin.scheduleView.shift");

  return (
    <div className="rounded-lg px-2 py-1.5 mb-1 last:mb-0 text-xs bg-white border border-neutral-200 shadow-sm">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="font-semibold text-neutral-800 truncate">
          {shift.shiftTypeCode}
        </span>
        {shift.source === "MANUAL" && (
          <span className="text-[9px] font-medium text-neutral-400 italic">
            {t("manual")}
          </span>
        )}
      </div>
      <div className="text-neutral-400">
        {shift.startTime} - {shift.endTime}
      </div>
    </div>
  );
}
