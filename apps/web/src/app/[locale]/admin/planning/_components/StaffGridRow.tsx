"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  SCHOOL_DAY_MINUTES,
  type ScheduleEmployee,
  type ScheduleDayInfo,
  type ScheduleShift,
  type ScheduleUnavailability,
  type ScheduleHole,
} from "@pawly/validators";
import { ShiftCell } from "./ShiftCell";
import { HoleCell } from "./HoleCell";
import { AbsenceCell } from "./AbsenceCell";
import { ClosedDayColumn } from "./ClosedDayColumn";
import { ConflictIndicator } from "./ConflictIndicator";
import { WarningBadge } from "./WarningBadge";

const JOB_TYPE_STYLES: Record<string, string> = {
  VET: "bg-neutral-100 text-neutral-500",
  ASV: "bg-neutral-100 text-neutral-500",
  APPRENTICE: "bg-neutral-100 text-neutral-500",
};

type ConflictEntry = { message: string; severity: "blocking" | "warning" };

type Props = {
  employee: ScheduleEmployee;
  days: ScheduleDayInfo[];
  rowIndex: number;
  shiftIndex: Map<string, ScheduleShift[]>;
  unavailabilityIndex: Map<string, ScheduleUnavailability[]>;
  holeIndex: Map<string, ScheduleHole[]>;
  conflictMap: Map<string, ConflictEntry[]>;
  getCellTabIndex: (row: number, col: number) => number;
};

function getEmployeeColorFallback(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 70%)`;
}

export function StaffGridRow({
  employee,
  days,
  rowIndex,
  shiftIndex,
  unavailabilityIndex,
  holeIndex,
  conflictMap,
  getCellTabIndex,
}: Props) {
  const t = useTranslations("admin.scheduleView");
  const color = employee.color || getEmployeeColorFallback(employee.id);
  const badgeClass = JOB_TYPE_STYLES[employee.jobType] || "bg-neutral-100 text-neutral-600";

  // Compute gross presence hours, break hours, and school hours
  const { grossHours, breakHours, schoolHours } = useMemo(() => {
    let grossMinutes = 0;
    let breakMinutesTotal = 0;
    let schoolMinutes = 0;
    for (const day of days) {
      const key = `${employee.id}|${day.date}`;
      const dayShifts = shiftIndex.get(key) || [];
      for (const shift of dayShifts) {
        const [startH, startM] = shift.startTime.split(":").map(Number);
        const [endH, endM] = shift.endTime.split(":").map(Number);
        const startTotal = startH * 60 + startM;
        const endTotal = endH * 60 + endM;
        grossMinutes += endTotal >= startTotal ? endTotal - startTotal : 1440 - startTotal + endTotal;
        breakMinutesTotal += shift.breakMinutes || 0;
      }
      // Count school days as 7h toward weekly total
      const dayUnavailabilities = unavailabilityIndex.get(`${employee.id}|${day.date}`) || [];
      const hasSchool = dayUnavailabilities.some((u) => u.type === "SCHOOL");
      if (hasSchool) schoolMinutes += SCHOOL_DAY_MINUTES;
    }
    return {
      grossHours: Math.round((grossMinutes / 60) * 10) / 10,
      breakHours: Math.round((breakMinutesTotal / 60) * 10) / 10,
      schoolHours: Math.round((schoolMinutes / 60) * 10) / 10,
    };
  }, [employee.id, days, shiftIndex, unavailabilityIndex]);

  const weeklyHours = grossHours + schoolHours;
  const workDayCount = days.filter((d) => d.isWorkDay && !d.isClosed).length;
  const proratedContract = employee.contractHours > 0 ? (employee.contractHours / 5) * workDayCount : 0;
  const hoursRatio = proratedContract > 0 ? weeklyHours / proratedContract : 0;

  return (
    <div role="row" className="contents">
      {/* Employee name cell */}
      <div
        role="rowheader"
        className="sticky left-0 z-10 bg-white px-4 py-3 border-b border-r border-neutral-100 flex items-center gap-2"
      >
        <div
          className="w-0.5 h-6 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-900 truncate">
            {employee.firstName} {employee.lastName.charAt(0)}.
          </div>
          <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeClass}`}>
            {employee.jobType}
          </span>
        </div>
      </div>

      {/* Day cells */}
      {days.map((day, colIndex) => {
        const cellKey = `${employee.id}|${day.date}`;
        const dayShifts = shiftIndex.get(cellKey) || [];
        const cellUnavailabilities = unavailabilityIndex.get(cellKey) || [];
        const unavailability = cellUnavailabilities[0];
        const dayHoles = holeIndex.get(day.date) || [];
        const conflicts = conflictMap.get(cellKey) || [];

        const hardConflicts = conflicts.filter((c) => c.severity === "blocking");
        const softConflicts = conflicts.filter((c) => c.severity === "warning");

        const tabIndex = getCellTabIndex(rowIndex, colIndex);

        // Closed or non-work day
        if (day.isClosed || !day.isWorkDay) {
          return (
            <ClosedDayColumn
              key={day.date}
              date={day.date}
              isClosed={day.isClosed}
              rowIndex={rowIndex}
              colIndex={colIndex}
              tabIndex={tabIndex}
            />
          );
        }

        // Unavailability
        if (unavailability) {
          return (
            <div
              key={day.date}
              role="gridcell"
              tabIndex={tabIndex}
              data-row={rowIndex}
              data-col={colIndex}
              className="border-b border-neutral-100 p-1 relative outline-none focus:ring-2 focus:ring-teal-500 focus:ring-inset"
            >
              <AbsenceCell type={unavailability.type} reason={unavailability.reason} />
            </div>
          );
        }

        // Shift(s) + possible holes + conflict overlay
        return (
          <div
            key={day.date}
            role="gridcell"
            tabIndex={tabIndex}
            data-row={rowIndex}
            data-col={colIndex}
            className={`border-b border-neutral-100 p-1 relative outline-none focus:ring-2 focus:ring-teal-500 focus:ring-inset ${
              hardConflicts.length > 0 ? "bg-[#F97316]/10 ring-2 ring-[#F97316] ring-inset" : ""
            }`}
          >
            {dayShifts.map((shift) => (
              <ShiftCell key={shift.id} shift={shift} />
            ))}
            {dayShifts.length === 0 && dayHoles.length > 0 && (
              <HoleCell holes={dayHoles} />
            )}
            {dayShifts.length === 0 && dayHoles.length === 0 && (
              <div className="h-full min-h-[48px]" />
            )}
            {hardConflicts.length > 0 && (
              <ConflictIndicator conflicts={hardConflicts} />
            )}
            {softConflicts.length > 0 && (
              <WarningBadge warnings={softConflicts} />
            )}
          </div>
        );
      })}

      {/* Weekly hours summary cell */}
      <div
        role="gridcell"
        className="sticky right-0 z-10 bg-white border-b border-l border-neutral-100 px-3 py-3 flex items-center justify-center"
      >
        <div
          className={`text-sm font-bold text-center ${
            hoursRatio > 1
              ? "text-red-600"
              : weeklyHours === 0
                ? "text-neutral-300"
                : "text-neutral-700"
          }`}
          title={
            hoursRatio > 1
              ? t("grid.hoursOver")
              : hoursRatio >= 0.8
                ? t("grid.hoursOk")
                : t("grid.hoursUnder")
          }
        >
          <div>{grossHours}h</div>
          {schoolHours > 0 && (
            <div className="text-[10px] font-normal text-neutral-400">
              +{schoolHours}h {t("grid.school")}
            </div>
          )}
          {breakHours > 0 && (
            <div className="text-[10px] font-normal text-neutral-300">
              -{breakHours}h {t("grid.break")}
            </div>
          )}
          <div className="text-[10px] font-normal text-neutral-400">
            / {Math.round(proratedContract * 10) / 10}h
          </div>
        </div>
      </div>
    </div>
  );
}
