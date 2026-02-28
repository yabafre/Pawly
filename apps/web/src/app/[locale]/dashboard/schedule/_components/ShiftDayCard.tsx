"use client";

import { useTranslations } from "next-intl";
import { Briefcase, CheckCircle, AlertCircle } from "lucide-react";
import type { EmployeeShift, EmployeeShiftTypeInfo } from "@pawly/types";
import { isToday, isPast, parseISO } from "date-fns";

interface ShiftDayCardProps {
  shift: EmployeeShift;
  shiftType?: EmployeeShiftTypeInfo;
}

export function ShiftDayCard({ shift, shiftType }: ShiftDayCardProps) {
  const t = useTranslations("dashboard.schedule");
  const dateObj = parseISO(shift.date);
  const showConfirmation = isPast(dateObj) || isToday(dateObj);

  const bgColor = shiftType?.color
    ? { backgroundColor: `${shiftType.color}15` }
    : undefined;
  const borderColor = shiftType?.color
    ? { borderColor: `${shiftType.color}30` }
    : undefined;
  const textColor = shiftType?.color
    ? { color: shiftType.color }
    : undefined;

  return (
    <div
      className="min-h-[44px] rounded-xl border bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
      style={{ ...bgColor, ...borderColor }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              backgroundColor: shiftType?.color ? `${shiftType.color}20` : "#f5f5f5",
            }}
          >
            <Briefcase className="h-4 w-4" style={textColor} />
          </div>
          <div>
            <span className="text-sm font-semibold" style={textColor}>
              {shiftType?.label ?? shift.shiftTypeCode}
            </span>
            <div className="text-xs text-neutral-500">
              {shift.startTime} — {shift.endTime}
            </div>
          </div>
        </div>

        {showConfirmation && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              shift.isConfirmed
                ? "bg-emerald-100 text-emerald-700"
                : "bg-orange-100 text-orange-700"
            }`}
          >
            {shift.isConfirmed ? (
              <>
                <CheckCircle className="h-3 w-3" />
                {t("shiftStatus.confirmed")}
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3" />
                {t("shiftStatus.notConfirmed")}
              </>
            )}
          </span>
        )}
      </div>

      {shift.breakMinutes > 0 && (
        <div className="mt-1 text-xs text-neutral-400">
          {t("timeline.break", { minutes: shift.breakMinutes })}
        </div>
      )}
    </div>
  );
}
