"use client";

import { Plane, Thermometer, GraduationCap, CalendarOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { EmployeeUnavailability } from "@pawly/types";

const ABSENCE_CONFIG: Record<
  EmployeeUnavailability["type"],
  { icon: typeof Plane; bg: string; text: string; border: string }
> = {
  VACATION: {
    icon: Plane,
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-100",
  },
  SICK: {
    icon: Thermometer,
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-100",
  },
  SCHOOL: {
    icon: GraduationCap,
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-100",
  },
  OTHER: {
    icon: CalendarOff,
    bg: "bg-neutral-50",
    text: "text-neutral-400",
    border: "border-neutral-100",
  },
};

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
  const config = ABSENCE_CONFIG[unavailability.type];
  const Icon = config.icon;

  return (
    <div
      className={`min-h-[44px] rounded-xl border p-3 ${config.bg} ${config.border}`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bg}`}
        >
          <Icon className={`h-4 w-4 ${config.text}`} aria-hidden="true" />
        </div>
        <span className={`text-sm font-semibold ${config.text}`}>
          {t(ABSENCE_TYPE_KEYS[unavailability.type])}
        </span>
      </div>
      {unavailability.reason && (
        <p className="mt-1 text-xs text-neutral-500">{unavailability.reason}</p>
      )}
    </div>
  );
}
