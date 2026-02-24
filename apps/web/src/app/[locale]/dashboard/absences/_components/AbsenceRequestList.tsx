"use client";

import { useTranslations, useLocale } from "next-intl";
import { useMyAbsences } from "../_hooks/useAbsences";
import { AbsenceStatusBadge } from "./AbsenceStatusBadge";
import {
  Plane,
  Thermometer,
  GraduationCap,
  Baby,
  HelpCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";

const TYPE_ICONS: Record<string, LucideIcon> = {
  PAID_LEAVE: Plane,
  SICK_LEAVE: Thermometer,
  TRAINING: GraduationCap,
  CHILD_SICK: Baby,
  OTHER: HelpCircle,
};

interface AbsenceRequestListProps {
  employeeId: string;
}

export function AbsenceRequestList({ employeeId }: AbsenceRequestListProps) {
  const t = useTranslations("dashboard.absences");
  const locale = useLocale();
  const { absences, isPending } = useMyAbsences(employeeId);

  if (isPending) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-neutral-100 animate-pulse"
          />
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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-neutral-900">{t("list.title")}</h2>
      <div className="space-y-3">
        {absences.map((absence: any) => {
          const Icon = TYPE_ICONS[absence.type] ?? HelpCircle;
          const dayCount =
            differenceInCalendarDays(
              new Date(absence.endDate),
              new Date(absence.startDate)
            ) + 1;
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
                      {t(`types.${absence.type}` as any)}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {t("list.from")}{" "}
                      {new Date(absence.startDate).toLocaleDateString(locale)}{" "}
                      {t("list.to")}{" "}
                      {new Date(absence.endDate).toLocaleDateString(locale)}{" "}
                      · {t("dayCount", { count: dayCount })}
                    </p>
                  </div>
                </div>
                <AbsenceStatusBadge status={absence.status} />
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
    </div>
  );
}
