"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

interface SchoolDayReminderBannerProps {
    month: string;
}

export function SchoolDayReminderBanner({ month }: SchoolDayReminderBannerProps) {
    const t = useTranslations("dashboard.schoolDays.reminder");

    return (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
                <p className="font-bold text-amber-800 text-sm">{t("title")}</p>
                <p className="text-amber-700 text-sm mt-0.5">
                    {t("message", { month })}
                </p>
            </div>
        </div>
    );
}
