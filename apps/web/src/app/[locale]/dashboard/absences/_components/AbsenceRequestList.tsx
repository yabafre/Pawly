"use client";

import { useTranslations, useLocale } from "next-intl";
import { useMyAbsences } from "../_hooks/useAbsences";
import { AbsenceStatusBadge } from "./AbsenceStatusBadge";
import { CalendarOff } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import type { AbsenceItem } from "@pawly/types";

interface AbsenceRequestListProps {
  employeeId: string;
}

export function AbsenceRequestList({ employeeId }: AbsenceRequestListProps) {
  const t = useTranslations("dashboard.absences");
  const locale = useLocale();
  const { absences, isPending } = useMyAbsences(employeeId);

  if (isPending) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!absences.length) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">{t("list.title")}</h2>
      <div className="space-y-2">
        {absences.map((absence: AbsenceItem) => {
          const dayCount =
            differenceInCalendarDays(new Date(absence.endDate), new Date(absence.startDate)) + 1;
          return (
            <div key={absence.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <CalendarOff size={16} strokeWidth={1.5} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{t(`types.${absence.type}` as any)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(absence.startDate).toLocaleDateString(locale)} — {new Date(absence.endDate).toLocaleDateString(locale)} · {t("dayCount", { count: dayCount })}
                    </p>
                  </div>
                </div>
                <AbsenceStatusBadge status={absence.status} />
              </div>
              {absence.status === "REJECTED" && absence.rejectionReason && (
                <p className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                  {absence.rejectionReason}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
