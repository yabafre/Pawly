"use client";

import { useTranslations, useLocale } from "next-intl";
import { useReviewAbsence } from "../_hooks/useAdminAbsences";
import { AbsenceRejectDialog } from "./AbsenceRejectDialog";
import { cn } from "@/lib/utils";
import {
  Plane,
  Thermometer,
  GraduationCap,
  Baby,
  HelpCircle,
  Check,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { differenceInCalendarDays } from "date-fns";
import { useState } from "react";
import type { AbsenceItem } from "@pawly/types";

const TYPE_ICONS: Record<string, LucideIcon> = {
  PAID_LEAVE: Plane,
  SICK_LEAVE: Thermometer,
  TRAINING: GraduationCap,
  CHILD_SICK: Baby,
  OTHER: HelpCircle,
};

interface AbsencePendingListProps {
  absences: AbsenceItem[];
  isPending: boolean;
}

export function AbsencePendingList({ absences, isPending: isLoading }: AbsencePendingListProps) {
  const t = useTranslations("admin.absences");
  const locale = useLocale();
  const { approve, reject, isPending: isReviewing } = useReviewAbsence();
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!absences.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">{t("list.empty")}</p>
      </div>
    );
  }

  const handleApprove = (absenceId: string) => {
    approve(absenceId);
  };

  const handleRejectConfirm = (reason: string) => {
    if (!rejectTarget) return;
    reject(rejectTarget, reason);
    setRejectTarget(null);
  };

  return (
    <>
      <div className="space-y-3">
        {absences.map((absence) => {
          const Icon = TYPE_ICONS[absence.type] ?? HelpCircle;
          const dayCount =
            differenceInCalendarDays(
              new Date(absence.endDate),
              new Date(absence.startDate)
            ) + 1;
          const isPendingStatus = absence.status === "PENDING";
          return (
            <div
              key={absence.id}
              className="bg-card rounded-2xl border border-border p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {absence.employee?.firstName} {absence.employee?.lastName}
                      {absence.employee?.jobType && (
                        <span className="text-muted-foreground font-normal ml-1">
                          ({absence.employee.jobType})
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t(`types.${absence.type}` as any)} ·{" "}
                      {t("list.from")}{" "}
                      {new Date(absence.startDate).toLocaleDateString(locale)}{" "}
                      {t("list.to")}{" "}
                      {new Date(absence.endDate).toLocaleDateString(locale)}{" "}
                      · {t("list.dayCount", { count: dayCount })}
                    </p>
                    {absence.reason && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("list.reason")}: {absence.reason}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-muted text-muted-foreground border border-border"
                  >
                    {t(`status.${absence.status}` as any)}
                  </span>
                  {isPendingStatus && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(absence.id)}
                        disabled={isReviewing}
                        className="rounded-xl"
                      >
                        <Check size={14} className="mr-1" />
                        {t("actions.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectTarget(absence.id)}
                        disabled={isReviewing}
                        className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/5"
                      >
                        <X size={14} className="mr-1" />
                        {t("actions.reject")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {absence.status === "REJECTED" && absence.rejectionReason && (
                <div className="mt-3 rounded-xl bg-muted border border-border p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {t("list.rejectionReason")}
                  </p>
                  <p className="text-sm text-foreground mt-1">
                    {absence.rejectionReason}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <AbsenceRejectDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
      />
    </>
  );
}
