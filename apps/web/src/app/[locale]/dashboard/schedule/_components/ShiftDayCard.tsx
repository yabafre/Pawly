"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Briefcase } from "lucide-react";
import type { EmployeeShift, EmployeeShiftTypeInfo } from "@pawly/types";
import { isToday, isPast, parseISO } from "date-fns";
import { ConfirmationSlider } from "./ConfirmationSlider";
import { useConfirmShift } from "../_hooks/useConfirmShift";

interface ShiftDayCardProps {
  shift: EmployeeShift;
  shiftType?: EmployeeShiftTypeInfo;
  publicationStatus?: string;
  month?: string;
}

export const ShiftDayCard = React.memo(function ShiftDayCard({ shift, shiftType, publicationStatus, month }: ShiftDayCardProps) {
  const t = useTranslations("dashboard.schedule");
  const { confirmShift, isPending } = useConfirmShift(month);
  const dateObj = parseISO(shift.date);
  const isActionable = (isPast(dateObj) || isToday(dateObj)) && publicationStatus === "PUBLISHED";

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
      </div>

      {isActionable && (
        <div className="mt-2">
          <ConfirmationSlider
            isConfirmed={shift.isConfirmed}
            isPending={isPending}
            onConfirm={() => confirmShift({ shiftId: shift.id })}
          />
        </div>
      )}

      {shift.breakMinutes > 0 && (
        <div className="mt-1 text-xs text-neutral-400">
          {t("timeline.break", { minutes: shift.breakMinutes })}
        </div>
      )}
    </div>
  );
});
