"use client";

import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { ScheduleHole } from "@pawly/validators";

type Props = {
  holes: ScheduleHole[];
  onHoleClick?: (hole: ScheduleHole) => void;
};

export function HoleCell({ holes, onHoleClick }: Props) {
  const t = useTranslations("admin.scheduleView.hole");

  return (
    <div className="h-full min-h-[48px] flex flex-col items-center justify-center gap-1">
      {holes.map((hole, i) => (
        <div
          key={`${hole.date}-${hole.shiftTypeCode}-${i}`}
          role="button"
          tabIndex={0}
          aria-label={t("tooltip", {
            shiftType: hole.shiftTypeCode,
            assigned: hole.assignedStaff,
            required: hole.requiredStaff,
          })}
          className="w-full rounded-lg border-2 border-dashed border-border px-2 py-1.5 flex items-center justify-center gap-1.5 cursor-pointer hover:border-border hover:bg-muted transition-colors"
          title={t("tooltip", {
            shiftType: hole.shiftTypeCode,
            assigned: hole.assignedStaff,
            required: hole.requiredStaff,
          })}
          onClick={() => onHoleClick?.(hole)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onHoleClick?.(hole);
            }
          }}
        >
          <Plus size={14} className="text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground truncate">
            {hole.shiftTypeCode}
          </span>
        </div>
      ))}
    </div>
  );
}
