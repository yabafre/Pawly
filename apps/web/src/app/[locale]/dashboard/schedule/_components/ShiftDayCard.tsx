"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Briefcase, Check } from "lucide-react";
import type { EmployeeShift, EmployeeShiftTypeInfo } from "@pawly/types";
import { isToday, isPast, parseISO } from "date-fns";
import { formatBreakDuration } from "@/lib/utils/format-break-duration";
import { ConfirmationSlider } from "./ConfirmationSlider";

interface ShiftDayCardProps {
  shift: EmployeeShift;
  shiftType?: EmployeeShiftTypeInfo;
  publicationStatus?: string;
  onConfirm: (args: { shiftId: string }) => void;
  isConfirmPending: boolean;
}

export const ShiftDayCard = React.memo(function ShiftDayCard({ shift, shiftType, publicationStatus, onConfirm, isConfirmPending }: ShiftDayCardProps) {
  const t = useTranslations("dashboard.schedule");
  const dateObj = parseISO(shift.date);
  const isActionable = (isPast(dateObj) || isToday(dateObj)) && publicationStatus === "PUBLISHED";

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <Briefcase size={18} strokeWidth={1.5} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{shiftType?.label ?? shift.shiftTypeCode}</p>
          <p className="text-xs text-muted-foreground">
            {shift.startTime} — {shift.endTime}
            {shift.breakMinutes > 0 && ` · ${t("timeline.break", { duration: formatBreakDuration(shift.breakMinutes) })}`}
          </p>
        </div>
        {shift.isConfirmed && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-primary bg-primary/10 shrink-0">
            <Check size={12} strokeWidth={2.5} />
            {t("confirmation.confirmed")}
          </span>
        )}
      </div>

      {isActionable && !shift.isConfirmed && (
        <div className="mt-3 pt-3 border-t">
          <ConfirmationSlider
            isConfirmed={shift.isConfirmed}
            isPending={isConfirmPending}
            onConfirm={() => onConfirm({ shiftId: shift.id })}
          />
        </div>
      )}
    </div>
  );
});
