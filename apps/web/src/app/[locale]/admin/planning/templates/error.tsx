"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function TemplatesError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("admin.planningTemplates.errors");

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <p className="text-lg font-semibold text-muted-foreground">{t("loadFailed")}</p>
      <p className="text-sm text-muted-foreground">{t("loadFailedDescription")}</p>
      <Button onClick={reset} variant="outline">
        {t("retry")}
      </Button>
    </div>
  );
}
