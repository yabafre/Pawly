"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-orange-100 text-orange-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

interface AbsenceStatusBadgeProps {
  status: string;
}

export function AbsenceStatusBadge({ status }: AbsenceStatusBadgeProps) {
  const t = useTranslations("dashboard.absences.status");

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
        STATUS_STYLES[status] ?? "bg-neutral-100 text-neutral-600"
      )}
    >
      {t(status as any)}
    </span>
  );
}
