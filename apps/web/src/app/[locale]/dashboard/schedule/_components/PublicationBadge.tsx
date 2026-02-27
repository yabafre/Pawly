"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

interface PublicationBadgeProps {
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
}

export function PublicationBadge({ status, publishedAt }: PublicationBadgeProps) {
  const t = useTranslations("dashboard.schedule.publicationStatus");
  const locale = useLocale();

  if (status === "PUBLISHED") {
    const formattedDate = publishedAt
      ? new Date(publishedAt).toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
        })
      : null;

    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
        {formattedDate
          ? t("publishedAt", { date: formattedDate })
          : t("published")}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
        {t("draft")}
      </span>
      <span className="text-[10px] text-amber-600">{t("draftNotice")}</span>
    </div>
  );
}
