"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import type { DropFeedback } from "../_hooks/useDragAndDrop";

const feedbackStyles: Record<string, string> = {
  valid: "ring-2 ring-emerald-400 bg-emerald-50/50",
  warning: "ring-2 ring-orange-400 bg-orange-50/50",
  blocked: "ring-2 ring-rose-400 bg-rose-50/50 animate-shake",
};

type Props = {
  employeeId: string;
  date: string;
  children: ReactNode;
  isDragging: boolean;
  dropFeedback: DropFeedback;
  className?: string;
  tabIndex?: number;
  rowIndex?: number;
  colIndex?: number;
};

export function DroppableGridCell({
  employeeId,
  date,
  children,
  isDragging,
  dropFeedback,
  className = "",
  tabIndex,
  rowIndex,
  colIndex,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${employeeId}|${date}`,
    data: { employeeId, date },
  });

  const feedbackClass = isDragging && isOver && dropFeedback
    ? feedbackStyles[dropFeedback] || ""
    : "";

  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      tabIndex={tabIndex}
      data-row={rowIndex}
      data-col={colIndex}
      className={`border-b border-border p-1 relative outline-none focus:ring-2 focus:ring-teal-500 focus:ring-inset ${feedbackClass} ${className}`}
    >
      {children}
    </div>
  );
}
