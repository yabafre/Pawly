"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ShiftTypeRecord } from "@/app/[locale]/admin/settings/_hooks/useClinicShiftTypes";
import type { TemplateSlot, TemplateDay, TemplateData } from "@pawly/types";

type Props = {
  data: TemplateData;
  shiftTypes: ShiftTypeRecord[];
  workDays?: number[];
  compact?: boolean;
};

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function TemplateWeekPreview({ data, shiftTypes, workDays, compact = false }: Props) {
  const t = useTranslations("admin.planningTemplates");

  const shiftTypeMap = new Map(shiftTypes.map((st) => [st.code, st]));

  const getDaySlots = (dayOfWeek: number) => {
    return data.days.find((d) => d.dayOfWeek === dayOfWeek)?.slots ?? [];
  };

  const isNonWorkDay = (dayOfWeek: number) => {
    if (!workDays) return false;
    return !workDays.includes(dayOfWeek);
  };

  return (
    <div className={cn(
      "grid grid-cols-7 rounded-2xl overflow-hidden border border-border",
      compact ? "gap-px bg-border" : "gap-px bg-border",
    )}>
      {DAY_KEYS.map((dayKey, idx) => {
        const dayOfWeek = idx + 1;
        const slots = getDaySlots(dayOfWeek);
        const nonWork = isNonWorkDay(dayOfWeek);
        const hasSlots = slots.length > 0;

        return (
          <div
            key={dayKey}
            className={cn(
              "text-center transition-colors flex flex-col items-center justify-start",
              compact ? "py-2 px-0.5" : "py-3 px-1.5",
              nonWork
                ? "bg-muted/80"
                : hasSlots
                  ? "bg-card"
                  : "bg-card",
            )}
          >
            {/* Day label */}
            <p
              className={cn(
                "font-bold uppercase tracking-wider mb-1.5",
                compact ? "text-[8px]" : "text-[10px]",
                nonWork ? "text-muted-foreground" : hasSlots ? "text-primary" : "text-muted-foreground",
              )}
            >
              {t(`days.${dayKey}`)}
            </p>

            {/* Slot indicators */}
            {slots.length === 0 ? (
              <div className={cn(
                "flex-1 flex items-center justify-center",
                compact ? "min-h-[16px]" : "min-h-[24px]"
              )}>
                <div className={cn(
                  "rounded-full bg-muted",
                  compact ? "w-1 h-1" : "w-1.5 h-1.5"
                )} />
              </div>
            ) : (
              <div className={cn(
                "flex flex-wrap justify-center content-start w-full",
                compact ? "gap-0.5" : "gap-1",
              )}>
                {slots.map((slot, i) => {
                  const st = shiftTypeMap.get(slot.shiftTypeCode);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center justify-center rounded-full transition-transform hover:scale-110",
                        compact ? "h-3.5 w-3.5" : "px-1.5 py-0.5 gap-1",
                      )}
                      style={{
                        backgroundColor: st ? `${st.color}20` : "#e5e5e520",
                      }}
                      title={`${st?.name ?? slot.shiftTypeCode}: ${t("slot.staffCount", { count: slot.requiredStaff })}`}
                    >
                      <div
                        className={cn(
                          "rounded-full shrink-0",
                          compact ? "h-1.5 w-1.5" : "h-2 w-2",
                        )}
                        style={{ backgroundColor: st?.color ?? "#a3a3a3" }}
                      />
                      {!compact && (
                        <span
                          className="text-[9px] font-bold leading-none"
                          style={{ color: st?.color ?? "#737373" }}
                        >
                          {slot.requiredStaff}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
