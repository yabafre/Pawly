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

const TYPE_ICONS: Record<string, LucideIcon> = {
  PAID_LEAVE: Plane,
  SICK_LEAVE: Thermometer,
  TRAINING: GraduationCap,
  CHILD_SICK: Baby,
  OTHER: HelpCircle,
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-orange-100 text-orange-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

interface AbsencePendingListProps {
  absences: any[];
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
          <div key={i} className="h-24 rounded-2xl bg-neutral-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!absences.length) {
    return (
      <div className="text-center py-12 text-neutral-400">
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
        {absences.map((absence: any) => {
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
              className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-neutral-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-900">
                      {absence.employee?.firstName} {absence.employee?.lastName}
                      {absence.employee?.jobType && (
                        <span className="text-neutral-400 font-normal ml-1">
                          ({absence.employee.jobType})
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {t(`types.${absence.type}` as any)} ·{" "}
                      {t("list.from")}{" "}
                      {new Date(absence.startDate).toLocaleDateString(locale)}{" "}
                      {t("list.to")}{" "}
                      {new Date(absence.endDate).toLocaleDateString(locale)}{" "}
                      · {t("list.dayCount", { count: dayCount })}
                    </p>
                    {absence.reason && (
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {t("list.reason")}: {absence.reason}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                      STATUS_STYLES[absence.status] ?? "bg-neutral-100 text-neutral-600"
                    )}
                  >
                    {t(`status.${absence.status}` as any)}
                  </span>
                  {isPendingStatus && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(absence.id)}
                        disabled={isReviewing}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Check size={14} className="mr-1" />
                        {t("actions.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectTarget(absence.id)}
                        disabled={isReviewing}
                        className="rounded-xl border-rose-300 text-rose-600 hover:bg-rose-50"
                      >
                        <X size={14} className="mr-1" />
                        {t("actions.reject")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {absence.status === "REJECTED" && absence.rejectionReason && (
                <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3">
                  <p className="text-xs font-semibold text-rose-600">
                    {t("list.rejectionReason")}
                  </p>
                  <p className="text-sm text-rose-700 mt-1">
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
