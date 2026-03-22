"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ScheduleHole, ScheduleEmployee, ScheduleShift, ScheduleUnavailability } from "@pawly/validators";

type Props = {
  open: boolean;
  onClose: () => void;
  hole: ScheduleHole | null;
  employees: ScheduleEmployee[];
  unavailabilityIndex?: Map<string, ScheduleUnavailability[]>;
  shiftIndex?: Map<string, ScheduleShift[]>;
  onAssign: (input: {
    employeeId: string;
    date: string;
    shiftTypeCode: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
  }) => void;
};

type EmployeeStatus = {
  employeeId: string;
  status: "loading" | "eligible" | "blocked" | "warning";
  reasons: string[];
};

export function AssignShiftModal({
  open,
  onClose,
  hole,
  employees,
  unavailabilityIndex,
  shiftIndex,
  onAssign,
}: Props) {
  const t = useTranslations("admin.dragDrop.assignModal");
  const [statuses, setStatuses] = useState<Map<string, EmployeeStatus>>(new Map());

  // Compute eligibility using client-side data (unavailabilities + existing shifts)
  useEffect(() => {
    if (!hole || !open) {
      setStatuses(new Map());
      return;
    }

    const resolved = new Map<string, EmployeeStatus>();

    for (const emp of employees) {
      const key = `${emp.id}|${hole.date}`;
      const unavails = unavailabilityIndex?.get(key) || [];
      const existingShifts = shiftIndex?.get(key) || [];

      if (unavails.length > 0) {
        const reason = unavails[0].type; // VACATION, SICK, SCHOOL, etc.
        resolved.set(emp.id, { employeeId: emp.id, status: "blocked", reasons: [reason] });
      } else if (existingShifts.some((s) => s.shiftTypeCode === hole.shiftTypeCode)) {
        resolved.set(emp.id, { employeeId: emp.id, status: "blocked", reasons: ["Overlap"] });
      } else if (existingShifts.length > 0) {
        resolved.set(emp.id, { employeeId: emp.id, status: "warning", reasons: ["Has other shift"] });
      } else {
        resolved.set(emp.id, { employeeId: emp.id, status: "eligible", reasons: [] });
      }
    }

    setStatuses(resolved);
  }, [employees, hole, open, unavailabilityIndex, shiftIndex]);

  if (!hole) return null;

  const handleAssign = (employeeId: string) => {
    // Use shift type's standard times from the hole context
    // The backend will resolve startTime/endTime from the ClinicShiftType
    onAssign({
      employeeId,
      date: hole.date,
      shiftTypeCode: hole.shiftTypeCode,
      startTime: "08:00", // Will be overridden by backend from ClinicShiftType
      endTime: "18:00",   // Will be overridden by backend from ClinicShiftType
      breakMinutes: 0,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          <div className="text-sm text-muted-foreground">
            {t("date", { date: hole.date })}
          </div>
          <div className="text-sm text-muted-foreground">
            {t("shiftType", {
              shiftType: hole.shiftTypeCode,
              start: "–",
              end: "–",
            })}
          </div>
        </div>

        <div className="mt-4 max-h-[300px] overflow-y-auto space-y-1">
          {employees.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("noEligible")}
            </p>
          )}
          {employees.map((emp) => {
            const empStatus = statuses.get(emp.id);
            const isBlocked = empStatus?.status === "blocked";
            const isLoading = empStatus?.status === "loading";

            return (
              <button
                key={emp.id}
                type="button"
                disabled={isBlocked || isLoading}
                onClick={() => handleAssign(emp.id)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                  isBlocked
                    ? "opacity-50 cursor-not-allowed bg-muted"
                    : "hover:bg-muted cursor-pointer"
                }`}
              >
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {emp.firstName} {emp.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground">{emp.jobType}</div>
                  {isBlocked && empStatus?.reasons.length > 0 && (
                    <div className="text-xs text-rose-500 mt-0.5">
                      {empStatus.reasons.join(", ")}
                    </div>
                  )}
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isLoading
                      ? "bg-muted text-muted-foreground"
                      : isBlocked
                        ? "bg-rose-100 text-rose-600"
                        : empStatus?.status === "warning"
                          ? "bg-orange-100 text-orange-600"
                          : "bg-emerald-100 text-emerald-600"
                  }`}
                >
                  {isLoading
                    ? "..."
                    : isBlocked
                      ? t("blocked")
                      : empStatus?.status === "warning"
                        ? t("warning")
                        : t("eligible")}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
