"use client";

import { CalendarOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { EmployeeUnavailability } from "@pawly/types";

const ABSENCE_TYPE_KEYS: Record<EmployeeUnavailability["type"], string> = {
  VACATION: "vacation",
  SICK: "sick",
  SCHOOL: "school",
  OTHER: "other",
};

interface AbsenceDayCardProps {
  unavailability: EmployeeUnavailability;
}

export function AbsenceDayCard({ unavailability }: AbsenceDayCardProps) {
  const t = useTranslations("dashboard.schedule.absenceTypes");

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <CalendarOff size={18} strokeWidth={1.5} className="text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{t(ABSENCE_TYPE_KEYS[unavailability.type])}</p>
          {unavailability.reason && (
            <p className="text-xs text-muted-foreground truncate">{unavailability.reason}</p>
          )}
        </div>
      </div>
    </div>
  );
}
