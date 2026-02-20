"use client";

import { DragOverlay } from "@dnd-kit/core";
import { ShiftCell } from "./ShiftCell";
import type { ScheduleShift } from "@pawly/validators";

type Props = {
  activeShift: ScheduleShift | null;
};

export function DragGhost({ activeShift }: Props) {
  return (
    <DragOverlay dropAnimation={null}>
      {activeShift ? (
        <div className="opacity-90 shadow-lg rounded-lg pointer-events-none w-[120px]">
          <ShiftCell shift={activeShift} />
        </div>
      ) : null}
    </DragOverlay>
  );
}
