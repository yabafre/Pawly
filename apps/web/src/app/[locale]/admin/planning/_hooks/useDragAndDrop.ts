"use client";

import { useState, useCallback, useRef } from "react";
import type { DragStartEvent, DragOverEvent, DragEndEvent } from "@dnd-kit/core";
import type { ScheduleShift, MoveValidationResult } from "@pawly/validators";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { preValidateMoveAction } from "../_actions/shift-mutation-actions";

export type DropFeedback = "valid" | "warning" | "blocked" | null;

type DropFeedbackEntry = { feedback: DropFeedback; reasons: string[] };

type DropFeedbackMap = Map<string, DropFeedbackEntry>;

export function useDragAndDrop(
  moveShift: (input: { shiftId: string; targetEmployeeId?: string; targetDate?: string }) => void,
) {
  const [activeShift, setActiveShift] = useState<ScheduleShift | null>(null);
  const [dropFeedbackMap, setDropFeedbackMap] = useState<DropFeedbackMap>(new Map());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidatedKey = useRef<string>("");
  const t = useTranslations("admin.dragDrop");

  const onDragStart = useCallback((event: DragStartEvent) => {
    const shift = event.active.data.current?.shift as ScheduleShift | undefined;
    if (shift) {
      setActiveShift(shift);
    }
  }, []);

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over, active } = event;
      const eventShift = active.data.current?.shift as ScheduleShift | undefined;
      if (!over || !eventShift) return;

      const targetData = over.data.current as { employeeId?: string; date?: string } | undefined;
      if (!targetData?.employeeId || !targetData?.date) return;

      const key = `${targetData.employeeId}|${targetData.date}`;
      // Skip if same cell as shift origin
      if (targetData.employeeId === eventShift.employeeId && targetData.date === eventShift.date) return;
      // Skip if already validated this target
      if (lastValidatedKey.current === key) return;
      lastValidatedKey.current = key;

      // Debounce preValidateMove calls
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(async () => {
        try {
          const [result] = await preValidateMoveAction({
            shiftId: eventShift.id,
            targetEmployeeId: targetData.employeeId!,
            targetDate: targetData.date!,
          });
          if (!result) return;
          const validation = result as MoveValidationResult;
          const feedback: DropFeedback =
            validation.hard.length > 0 ? "blocked" : validation.soft.length > 0 ? "warning" : "valid";
          const reasons: string[] =
            validation.hard.length > 0
              ? validation.hard.map((v) => v.message || v.rule)
              : validation.soft.map((v) => v.message || v.rule);
          setDropFeedbackMap((prev) => {
            const next = new Map(prev);
            next.set(key, { feedback, reasons });
            return next;
          });
        } catch {
          // If validation fails, treat as blocked
          setDropFeedbackMap((prev) => {
            const next = new Map(prev);
            next.set(key, { feedback: "blocked", reasons: [] });
            return next;
          });
        }
      }, 200);
    },
    [],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { over } = event;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      if (over && activeShift) {
        const targetData = over.data.current as { employeeId?: string; date?: string } | undefined;
        if (targetData?.employeeId && targetData?.date) {
          const key = `${targetData.employeeId}|${targetData.date}`;
          const feedbackEntry = dropFeedbackMap.get(key);
          // Only move if not blocked
          if (feedbackEntry?.feedback === "blocked") {
            toast.error(t("dropBlocked"), {
              description: feedbackEntry.reasons[0] || t("moveError"),
            });
          } else {
            const input: { shiftId: string; targetEmployeeId?: string; targetDate?: string } = {
              shiftId: activeShift.id,
            };
            if (targetData.employeeId !== activeShift.employeeId) {
              input.targetEmployeeId = targetData.employeeId;
            }
            if (targetData.date !== activeShift.date) {
              input.targetDate = targetData.date;
            }
            if (input.targetEmployeeId || input.targetDate) {
              moveShift(input);
            }
          }
        }
      }

      // Reset state
      setActiveShift(null);
      setDropFeedbackMap(new Map());
      lastValidatedKey.current = "";
    },
    [activeShift, dropFeedbackMap, moveShift, t],
  );

  const onDragCancel = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setActiveShift(null);
    setDropFeedbackMap(new Map());
    lastValidatedKey.current = "";
  }, []);

  /** Get just the DropFeedback enum for a given cell key, for grid cell consumers. */
  const getDropFeedback = useCallback(
    (key: string): DropFeedback => {
      return dropFeedbackMap.get(key)?.feedback ?? null;
    },
    [dropFeedbackMap],
  );

  return {
    activeShift,
    dropFeedbackMap,
    getDropFeedback,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}
