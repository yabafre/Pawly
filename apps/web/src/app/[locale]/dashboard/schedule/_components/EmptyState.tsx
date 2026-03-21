"use client";

import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";

export function EmptyState() {
  const t = useTranslations("dashboard.schedule.timeline");

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <CalendarDays className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{t("noShifts")}</p>
    </div>
  );
}
