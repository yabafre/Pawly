"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
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

export function StaffGrid({
  employees,
  days,
  shifts,
  unavailabilities,
  holes,
  conflictMap,
}: Props) {
  const t = useTranslations("admin.scheduleView");

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

  const colCount = days.length;

  const { gridRef, getCellTabIndex, handleGridKeyDown } = useGridKeyboard({
    rowCount: employees.length,
    colCount,
  });

  return (
    <div
      className="bg-white rounded-3xl border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden"
    >
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
          className="min-w-[800px]"
          style={{
            display: "grid",
            gridTemplateColumns: `200px repeat(${colCount}, minmax(120px, 1fr)) 90px`,
          }}
        >
          <StaffGridHeader days={days} />
          {employees.map((employee, rowIndex) => (
            <StaffGridRow
              key={employee.id}
              employee={employee}
              days={days}
              rowIndex={rowIndex}
              shiftIndex={shiftIndex}
              unavailabilityIndex={unavailabilityIndex}
              unavailabilities={unavailabilities}
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
