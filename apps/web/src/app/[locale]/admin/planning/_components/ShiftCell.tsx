"use client";

import { useTranslations } from "next-intl";
import type { ScheduleShift } from "@pawly/validators";

type Props = {
  shift: ScheduleShift;
};

export function ShiftCell({ shift }: Props) {
  const t = useTranslations("admin.scheduleView.shift");

  return (
    <div
      className="rounded-lg px-2 py-1.5 mb-1 last:mb-0 text-xs border border-neutral-200 bg-white shadow-sm"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="font-bold text-neutral-800 truncate">
          {shift.shiftTypeCode}
        </span>
        <span
          className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
            shift.source === "GENERATED"
              ? "bg-blue-50 text-blue-600"
              : "bg-purple-50 text-purple-600"
          }`}
        >
          {shift.source === "GENERATED" ? t("generated") : t("manual")}
        </span>
      </div>
      <div className="text-neutral-500">
        {shift.startTime} - {shift.endTime}
      </div>
    </div>
  );
}
