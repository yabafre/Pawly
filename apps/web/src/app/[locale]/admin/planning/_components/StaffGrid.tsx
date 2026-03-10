"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { KeyboardCoordinateGetter } from "@dnd-kit/core";
import { StaffGridHeader } from "./StaffGridHeader";
import { StaffGridRow } from "./StaffGridRow";
import { DragGhost } from "./DragGhost";
import { useGridKeyboard } from "../_hooks/useGridKeyboard";
import { useDragAndDrop } from "../_hooks/useDragAndDrop";
import type {
  ScheduleEmployee,
  ScheduleDayInfo,
  ScheduleShift,
  ScheduleUnavailability,
  ScheduleHole,
  EquitySummaryEntry,
} from "@pawly/validators";

type ConflictMap = Map<string, Array<{ message: string; severity: "blocking" | "warning" }>>;

type Props = {
  employees: ScheduleEmployee[];
  days: ScheduleDayInfo[];
  shifts: ScheduleShift[];
  unavailabilities: ScheduleUnavailability[];
  holes: ScheduleHole[];
  conflictMap: ConflictMap;
  equitySummary?: EquitySummaryEntry[];
  moveShift: (input: { shiftId: string; targetEmployeeId?: string; targetDate?: string }) => void;
  onHoleClick?: (hole: ScheduleHole, employeeId: string) => void;
};

const LITE_VIEW_DAYS = 3;

const gridCoordinateGetter: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context: { droppableRects, droppableContainers } },
) => {
  const { code } = event;

  // Find current cell by coordinates
  const currentContainer = [...droppableContainers.values()].find(
    (container) => {
      const rect = droppableRects.get(container.id);
      if (!rect) return false;
      return (
        currentCoordinates.x >= rect.left &&
        currentCoordinates.x <= rect.right &&
        currentCoordinates.y >= rect.top &&
        currentCoordinates.y <= rect.bottom
      );
    },
  );

  if (!currentContainer?.node?.current) return undefined;
  const currentNode = currentContainer.node.current;
  const currentRow = parseInt(currentNode.getAttribute("data-row") || "0");
  const currentCol = parseInt(currentNode.getAttribute("data-col") || "0");

  let targetRow = currentRow;
  let targetCol = currentCol;

  switch (code) {
    case "ArrowRight":
      targetCol += 1;
      break;
    case "ArrowLeft":
      targetCol -= 1;
      break;
    case "ArrowDown":
      targetRow += 1;
      break;
    case "ArrowUp":
      targetRow -= 1;
      break;
    default:
      return undefined;
  }

  // Find the target container by data-row/data-col
  const targetContainer = [...droppableContainers.values()].find(
    (container) => {
      const node = container.node?.current;
      if (!node) return false;
      return (
        parseInt(node.getAttribute("data-row") || "-1") === targetRow &&
        parseInt(node.getAttribute("data-col") || "-1") === targetCol
      );
    },
  );

  if (!targetContainer) return undefined;
  const rect = droppableRects.get(targetContainer.id);
  if (!rect) return undefined;

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

export function StaffGrid({
  employees,
  days,
  shifts,
  unavailabilities,
  holes,
  conflictMap,
  equitySummary,
  moveShift,
  onHoleClick,
}: Props) {
  const t = useTranslations("admin.scheduleView");
  const tA11y = useTranslations("admin.dragDrop.accessibility");

  // DnD sensors
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: gridCoordinateGetter,
  });
  const sensors = useSensors(pointerSensor, keyboardSensor);

  // DnD state
  const {
    activeShift,
    getDropFeedback,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  } = useDragAndDrop(moveShift);

  // Accessibility announcements for DndContext
  const announcements = {
    onDragStart({ active }: { active: { id: string | number } }) {
      return tA11y("dragHandle");
    },
    onDragOver({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
      if (over) {
        return tA11y("dropTarget", { employee: "", date: "" });
      }
      return "";
    },
    onDragEnd({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
      if (over) {
        return tA11y("shiftMoved", { employee: "", date: "" });
      }
      return "";
    },
    onDragCancel() {
      return "";
    },
  };

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

  // Reset dayOffset when days change (week navigation) — derived state, no useEffect
  const prevDaysRef = useRef(days);
  if (prevDaysRef.current !== days) {
    prevDaysRef.current = days;
    if (dayOffset !== 0) {
      setDayOffset(0);
    }
  }

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
    const map = new Map<string, ScheduleUnavailability[]>();
    for (const u of unavailabilities) {
      const key = `${u.employeeId}|${u.date}`;
      const arr = map.get(key) || [];
      arr.push(u);
      map.set(key, arr);
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

  const equitySummaryMap = useMemo(() => {
    const map = new Map<string, EquitySummaryEntry>();
    if (!equitySummary) return map;
    for (const entry of equitySummary) {
      map.set(entry.employeeId, entry);
    }
    return map;
  }, [equitySummary]);

  const { gridRef, getCellTabIndex, handleGridKeyDown } = useGridKeyboard({
    rowCount: employees.length,
    colCount,
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
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
              aria-label={t("responsive.previousDays")}
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
              aria-label={t("responsive.nextDays")}
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
                equitySummaryEntry={equitySummaryMap.get(employee.id)}
                getCellTabIndex={getCellTabIndex}
                isDragging={!!activeShift}
                getDropFeedback={getDropFeedback}
                onHoleClick={onHoleClick}
              />
            ))}
          </div>
        </div>
      </div>

      <DragGhost activeShift={activeShift} />
    </DndContext>
  );
}
