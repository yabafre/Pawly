"use client";

import { useMemo, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StaffGridHeader } from "./StaffGridHeader";
import { StaffGridRow } from "./StaffGridRow";
import { useGridKeyboard } from "../_hooks/useGridKeyboard";
import type {
  ScheduleEmployee,
  ScheduleDayInfo,
  ScheduleShift,
  ScheduleUnavailability,
  ScheduleHole,
} from "@pawly/validators";

type ConflictMap = Map<string, Array<{ message: string; severity: "blocking" | "warning" }>>;

type Props = {
  employees: ScheduleEmployee[];
  days: ScheduleDayInfo[];
  shifts: ScheduleShift[];
  unavailabilities: ScheduleUnavailability[];
  holes: ScheduleHole[];
  conflictMap: ConflictMap;
};

const LITE_VIEW_DAYS = 3;

export function StaffGrid({
  employees,
  days,
  shifts,
  unavailabilities,
  holes,
  conflictMap,
}: Props) {
  const t = useTranslations("admin.scheduleView");

  // Responsive: detect desktop (>= 1024px) vs tablet
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Day offset for 3-day lite view navigation
  const [dayOffset, setDayOffset] = useState(0);

  // Reset dayOffset when days change (week navigation)
  useEffect(() => {
    setDayOffset(0);
  }, [days]);

  // Compute visible days based on viewport
  const maxOffset = Math.max(0, days.length - LITE_VIEW_DAYS);
  const safeDayOffset = Math.min(dayOffset, maxOffset);
  const visibleDays = isDesktop
    ? days
    : days.slice(safeDayOffset, safeDayOffset + LITE_VIEW_DAYS);

  const colCount = visibleDays.length;

  // Build lookup maps for O(1) cell data access
  const shiftIndex = useMemo(() => {
    const map = new Map<string, ScheduleShift[]>();
    for (const s of shifts) {
      const key = `${s.employeeId}|${s.date}`;
      const arr = map.get(key) || [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [shifts]);

  const unavailabilityIndex = useMemo(() => {
    const map = new Map<string, ScheduleUnavailability>();
    for (const u of unavailabilities) {
      map.set(`${u.employeeId}|${u.date}`, u);
    }
    return map;
  }, [unavailabilities]);

  const holeIndex = useMemo(() => {
    const map = new Map<string, ScheduleHole[]>();
    for (const h of holes) {
      const key = h.date;
      const arr = map.get(key) || [];
      arr.push(h);
      map.set(key, arr);
    }
    return map;
  }, [holes]);

  const { gridRef, getCellTabIndex, handleGridKeyDown } = useGridKeyboard({
    rowCount: employees.length,
    colCount,
  });

  return (
    <div
      className="bg-white rounded-3xl border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden"
    >
      {/* Lite view navigation (tablet only) */}
      {!isDesktop && days.length > LITE_VIEW_DAYS && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100 bg-neutral-50">
          <button
            type="button"
            onClick={() => setDayOffset((prev) => Math.max(0, prev - 1))}
            disabled={safeDayOffset === 0}
            className="p-1 rounded-lg hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label={t("responsive.liteView")}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs font-semibold text-neutral-500">
            {t("responsive.liteView")}
          </span>
          <button
            type="button"
            onClick={() => setDayOffset((prev) => Math.min(maxOffset, prev + 1))}
            disabled={safeDayOffset >= maxOffset}
            className="p-1 rounded-lg hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label={t("responsive.liteView")}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      <div
        ref={gridRef}
        role="grid"
        aria-label={t("accessibility.gridLabel")}
        aria-rowcount={employees.length + 1}
        aria-colcount={colCount + 2}
        className="overflow-x-auto"
        onKeyDown={handleGridKeyDown}
      >
        <div
          className={isDesktop ? "min-w-[800px]" : "min-w-0"}
          style={{
            display: "grid",
            gridTemplateColumns: isDesktop
              ? `200px repeat(${colCount}, minmax(120px, 1fr)) 90px`
              : `160px repeat(${colCount}, 1fr) 90px`,
          }}
        >
          <StaffGridHeader days={visibleDays} />
          {employees.map((employee, rowIndex) => (
            <StaffGridRow
              key={employee.id}
              employee={employee}
              days={visibleDays}
              rowIndex={rowIndex}
              shiftIndex={shiftIndex}
              unavailabilityIndex={unavailabilityIndex}
              holeIndex={holeIndex}
              conflictMap={conflictMap}
              getCellTabIndex={getCellTabIndex}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
