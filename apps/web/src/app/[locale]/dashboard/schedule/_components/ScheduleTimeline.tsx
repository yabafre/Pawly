"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { format, parseISO, isToday } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import type { EmployeeShift, EmployeeUnavailability, EmployeeShiftTypeInfo } from "@pawly/types";
import { ShiftDayCard } from "./ShiftDayCard";
import { AbsenceDayCard } from "./AbsenceDayCard";
import { useConfirmShift } from "../_hooks/useConfirmShift";

interface ScheduleTimelineProps {
  shifts: EmployeeShift[];
  unavailabilities: EmployeeUnavailability[];
  shiftTypeMap: Map<string, EmployeeShiftTypeInfo>;
  month: string;
  publicationStatus?: string;
}

interface DayEntry {
  date: string;
  shifts: EmployeeShift[];
  unavailabilities: EmployeeUnavailability[];
}

export function ScheduleTimeline({
  shifts,
  unavailabilities,
  shiftTypeMap,
  month,
  publicationStatus,
}: ScheduleTimelineProps) {
  const t = useTranslations("dashboard.schedule.timeline");
  const locale = useLocale();
  const dateFnsLocale = locale === "fr" ? fr : enUS;
  const { confirmShift, isPending: isConfirmPending } = useConfirmShift(month);

  const dayMap = new Map<string, DayEntry>();

  for (const shift of shifts) {
    if (!dayMap.has(shift.date)) {
      dayMap.set(shift.date, { date: shift.date, shifts: [], unavailabilities: [] });
    }
    dayMap.get(shift.date)!.shifts.push(shift);
  }

  for (const ua of unavailabilities) {
    if (!dayMap.has(ua.date)) {
      dayMap.set(ua.date, { date: ua.date, shifts: [], unavailabilities: [] });
    }
    dayMap.get(ua.date)!.unavailabilities.push(ua);
  }

  const sortedDays = Array.from(dayMap.values()).sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  return (
    <div className="space-y-5" role="list" aria-label={t("scheduleList")}>
      {sortedDays.map((day) => {
        const dateObj = parseISO(day.date);
        const isTodayDate = isToday(dateObj);
        const dayLabel = format(dateObj, "EEEE d MMMM", { locale: dateFnsLocale });

        return (
          <div key={day.date} role="listitem">
            <div className="mb-2 flex items-center gap-2">
              {isTodayDate && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              )}
              <span
                className={`text-xs font-semibold uppercase tracking-wide ${
                  isTodayDate ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {isTodayDate ? `${t("today")} — ` : ""}
                {dayLabel}
              </span>
            </div>

            <div className="space-y-2">
              {day.unavailabilities.map((ua, i) => (
                <AbsenceDayCard key={`ua-${day.date}-${i}`} unavailability={ua} />
              ))}
              {day.shifts.map((shift) => (
                <ShiftDayCard
                  key={shift.id}
                  shift={shift}
                  shiftType={shiftTypeMap.get(shift.shiftTypeCode)}
                  publicationStatus={publicationStatus}
                  onConfirm={confirmShift}
                  isConfirmPending={isConfirmPending}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
