"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { AlertCircle, AlertTriangle, Circle } from "lucide-react";
import type { ScheduleViewData, ScheduleHole } from "@pawly/validators";

type HardViolation = ScheduleViewData["violations"]["hard"][number];
type SoftViolation = ScheduleViewData["violations"]["soft"][number];

type Props = {
  violations?: {
    hard: HardViolation[];
    soft: SoftViolation[];
  };
  holes?: ScheduleHole[];
  children: React.ReactNode;
};

const CATEGORY_KEYS: Record<string, string> = {
  STAFFING_MINIMUM: "categoryStaffing",
  SKILL_REQUIREMENT: "categorySkill",
  ROTATION_EQUITY: "categoryEquity",
  CONTRACT_COMPLIANCE: "categoryContract",
};

function groupByCategory<T extends { category: string }>(
  items: T[],
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const arr = groups[item.category] || [];
    arr.push(item);
    groups[item.category] = arr;
  }
  return groups;
}

function groupHolesByDate(holes: ScheduleHole[]): Record<string, ScheduleHole[]> {
  const groups: Record<string, ScheduleHole[]> = {};
  for (const hole of holes) {
    const arr = groups[hole.date] || [];
    arr.push(hole);
    groups[hole.date] = arr;
  }
  return groups;
}

export function HealthBarDetailPopover({
  violations,
  holes,
  children,
}: Props) {
  const t = useTranslations("admin.planningRules.healthBar");
  const [open, setOpen] = useState(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleEnter = useCallback(() => {
    clearTimeout(closeTimeout.current);
    setOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    closeTimeout.current = setTimeout(() => setOpen(false), 200);
  }, []);

  useEffect(() => () => clearTimeout(closeTimeout.current), []);

  const hardByCategory = groupByCategory(violations?.hard ?? []);
  const softByCategory = groupByCategory(violations?.soft ?? []);
  const holesByDate = groupHolesByDate(holes ?? []);

  const hasContent =
    Object.keys(hardByCategory).length > 0 ||
    Object.keys(softByCategory).length > 0 ||
    Object.keys(holesByDate).length > 0;

  if (!hasContent) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-h-80 overflow-y-auto" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        <PopoverHeader>
          <PopoverTitle>{t("detailTitle")}</PopoverTitle>
        </PopoverHeader>

        <div className="mt-3 space-y-3">
          {/* Hard violations grouped by category */}
          {Object.entries(hardByCategory).map(([category, items]) => (
            <div key={`hard-${category}`}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                <AlertCircle className="h-3 w-3" />
                <span>
                  {t(CATEGORY_KEYS[category] ?? category)} ({items.length})
                </span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {items.map((v, i) => (
                  <li key={`${v.ruleId}-${i}`} className="text-xs text-neutral-600 pl-4">
                    {v.message}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Soft violations grouped by category */}
          {Object.entries(softByCategory).map(([category, items]) => (
            <div key={`soft-${category}`}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-600">
                <AlertTriangle className="h-3 w-3" />
                <span>
                  {t(CATEGORY_KEYS[category] ?? category)} ({items.length})
                </span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {items.map((v, i) => (
                  <li key={`${v.ruleId}-${i}`} className="text-xs text-neutral-600 pl-4">
                    {v.message}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Holes grouped by date */}
          {Object.entries(holesByDate).map(([date, dateHoles]) => (
            <div key={`holes-${date}`}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                <Circle className="h-3 w-3" />
                <span>
                  {t("holesOnDate", { count: dateHoles.length, date })}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {dateHoles.map((h, i) => (
                  <li key={`${h.shiftTypeCode}-${i}`} className="text-xs text-neutral-500 pl-4">
                    {h.shiftTypeCode} — {h.reason}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
