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

type EmployeeLookup = { id: string; firstName: string; lastName: string };

type Props = {
  violations?: {
    hard: HardViolation[];
    soft: SoftViolation[];
  };
  holes?: ScheduleHole[];
  employees?: EmployeeLookup[];
  children: React.ReactNode;
};

const CATEGORY_KEYS: Record<string, string> = {
  STAFFING_MINIMUM: "categoryStaffing",
  SKILL_REQUIREMENT: "categorySkill",
  ROTATION_EQUITY: "categoryEquity",
  CONTRACT_COMPLIANCE: "categoryContract",
};

/** Translate English terms in API violation messages to the current locale */
function localizeMessage(msg: string, t: ReturnType<typeof useTranslations>): string {
  const dayMap: Record<string, string> = {
    monday: t("days.monday"), tuesday: t("days.tuesday"), wednesday: t("days.wednesday"),
    thursday: t("days.thursday"), friday: t("days.friday"), saturday: t("days.saturday"), sunday: t("days.sunday"),
  };
  const periodMap: Record<string, string> = {
    monthly: t("periods.monthly"), quarterly: t("periods.quarterly"),
    weekly: t("periods.weekly"), period: t("periods.period"),
  };

  let result = msg;
  for (const [en, loc] of Object.entries(dayMap)) {
    result = result.replace(new RegExp(`\\b${en}\\b`, "gi"), loc);
  }
  for (const [en, loc] of Object.entries(periodMap)) {
    result = result.replace(new RegExp(`\\b${en}\\b`, "gi"), loc);
  }
  // Translate common English fragments
  result = result
    .replace(/\bshifts\b/gi, t("terms.shifts"))
    .replace(/\bexceeds maximum of\b/gi, t("terms.exceedsMax"))
    .replace(/\bexceeds maximum\b/gi, t("terms.exceedsMax"))
    .replace(/\bEmployee total\b/gi, t("terms.employeeTotal"))
    .replace(/\bEmployee has\b/gi, t("terms.employeeHas"))
    .replace(/\bper\b/gi, t("terms.per"));
  return result;
}

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
  employees,
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

  const empMap = new Map<string, string>();
  for (const e of employees ?? []) {
    empMap.set(e.id, `${e.firstName} ${e.lastName}`);
  }

  // Deduplicate violations by ruleId + affectedEmployeeId
  function dedup<T extends { ruleId: string; affectedEmployeeId?: string; message: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    return items.filter((v) => {
      const key = `${v.ruleId}|${v.affectedEmployeeId ?? ""}|${v.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const hardByCategory = groupByCategory(dedup(violations?.hard ?? []));
  const softByCategory = groupByCategory(dedup(violations?.soft ?? []));
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
                {items.map((v, i) => {
                  const name = v.affectedEmployeeId ? empMap.get(v.affectedEmployeeId) : undefined;
                  return (
                    <li key={`${v.ruleId}-${i}`} className="text-xs text-muted-foreground pl-4">
                      {name && <strong className="text-foreground">{name}</strong>}{name && " — "}
                      {localizeMessage(v.message, t)}
                    </li>
                  );
                })}
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
                {items.map((v, i) => {
                  const name = v.affectedEmployeeId ? empMap.get(v.affectedEmployeeId) : undefined;
                  return (
                    <li key={`${v.ruleId}-${i}`} className="text-xs text-muted-foreground pl-4">
                      {name && <strong className="text-foreground">{name}</strong>}{name && " — "}
                      {localizeMessage(
                        "messageKey" in v && v.messageKey
                          ? t(v.messageKey as Parameters<typeof t>[0], v.messageParams as Record<string, string>)
                          : v.message,
                        t,
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Holes grouped by date */}
          {Object.entries(holesByDate).map(([date, dateHoles]) => (
            <div key={`holes-${date}`}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Circle className="h-3 w-3" />
                <span>
                  {t("holesOnDate", { count: dateHoles.length, date })}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {dateHoles.map((h, i) => (
                  <li key={`${h.shiftTypeCode}-${i}`} className="text-xs text-muted-foreground pl-4">
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
