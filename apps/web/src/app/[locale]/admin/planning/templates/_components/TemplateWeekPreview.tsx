"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ShiftTypeRecord } from "@/app/[locale]/admin/settings/_hooks/useClinicShiftTypes";

type TemplateSlot = {
  shiftTypeCode: string;
  requiredStaff: number;
  requiredJobTypes?: string[];
};

type TemplateDay = {
  dayOfWeek: number;
  slots: TemplateSlot[];
};

type TemplateData = {
  days: TemplateDay[];
};

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
      "grid grid-cols-7 rounded-xl overflow-hidden border border-neutral-100",
      compact ? "gap-px bg-neutral-100" : "gap-px bg-neutral-100",
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
              "text-center transition-colors",
              compact ? "py-2 px-1" : "py-3 px-1.5",
              nonWork
                ? "bg-neutral-50/80"
                : hasSlots
                  ? "bg-white"
                  : "bg-white",
            )}
          >
            {/* Day label */}
            <p
              className={cn(
                "font-bold uppercase tracking-wider mb-1.5",
                compact ? "text-[8px]" : "text-[10px]",
                nonWork ? "text-neutral-300" : hasSlots ? "text-[#009588]" : "text-neutral-400",
              )}
            >
              {t(`days.${dayKey}`)}
            </p>

            {/* Slot indicators */}
            {slots.length === 0 ? (
              <p className={cn(
                "text-neutral-300",
                compact ? "text-[8px]" : "text-[9px]",
              )}>
                {compact ? "—" : t("preview.noSlots")}
              </p>
            ) : (
              <div className={cn(
                "flex flex-wrap justify-center",
                compact ? "gap-0.5" : "gap-1",
              )}>
                {slots.map((slot, i) => {
                  const st = shiftTypeMap.get(slot.shiftTypeCode);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center justify-center gap-0.5 rounded-full",
                        compact ? "h-4 w-4" : "px-1.5 py-0.5",
                      )}
                      style={{
                        backgroundColor: st ? `${st.color}18` : "#e5e5e518",
                      }}
                      title={`${st?.name ?? slot.shiftTypeCode}: ${t("slot.staffCount", { count: slot.requiredStaff })}`}
                    >
                      <div
                        className={cn(
                          "rounded-full",
                          compact ? "h-1.5 w-1.5" : "h-2 w-2",
                        )}
                        style={{ backgroundColor: st?.color ?? "#a3a3a3" }}
                      />
                      {!compact && (
                        <span
                          className="text-[9px] font-bold"
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

            {/* Non-work day label */}
            {nonWork && !compact && (
              <p className="mt-1 text-[7px] font-medium uppercase tracking-wider text-neutral-300">
                {t("nonWorkDay")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
