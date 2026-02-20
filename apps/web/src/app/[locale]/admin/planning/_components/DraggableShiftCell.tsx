"use client";

import { useDraggable } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShiftCell } from "./ShiftCell";
import type { ScheduleShift } from "@pawly/validators";

type Props = {
  shift: ScheduleShift;
};

export function DraggableShiftCell({ shift }: Props) {
  const t = useTranslations("admin.dragDrop.accessibility");
  const { attributes, listeners, setNodeRef, isDragging } =
    useDraggable({
      id: shift.id,
      data: { shift },
    });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative group",
        isDragging ? "opacity-30 cursor-grabbing" : "cursor-grab",
      )}
      aria-label={t("dragHandle")}
      {...listeners}
      {...attributes}
    >
      <div className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-60 transition-opacity">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>
      <ShiftCell shift={shift} />
    </div>
  );
}
