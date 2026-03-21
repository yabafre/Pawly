"use client";

import { useTranslations } from "next-intl";

interface AbsenceStatusBadgeProps {
  status: string;
}

export function AbsenceStatusBadge({ status }: AbsenceStatusBadgeProps) {
  const t = useTranslations("dashboard.absences.status");

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border text-muted-foreground">
      {status === "PENDING" && <span className="w-1.5 h-1.5 rounded-full bg-foreground mr-1.5" />}
      {t(status as any)}
    </span>
  );
}
