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
      ? new Date(publishedAt).toLocaleDateString(locale, { day: "numeric", month: "short" })
      : null;

    return (
      <span className="text-xs text-muted-foreground font-medium">
        {formattedDate ? t("publishedAt", { date: formattedDate }) : t("published")}
      </span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground font-medium">
      {t("draft")}
    </span>
  );
}
