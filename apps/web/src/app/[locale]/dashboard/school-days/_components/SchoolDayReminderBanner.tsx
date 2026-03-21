"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

interface SchoolDayReminderBannerProps {
    month: string;
}

export function SchoolDayReminderBanner({ month }: SchoolDayReminderBannerProps) {
    const t = useTranslations("dashboard.schoolDays.reminder");

    return (
        <div className="rounded-2xl border bg-card p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
                <p className="font-semibold text-sm">{t("title")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {t("message", { month })}
                </p>
            </div>
        </div>
    );
}
