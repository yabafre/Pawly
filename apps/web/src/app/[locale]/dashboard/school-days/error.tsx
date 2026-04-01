"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

export default function SchoolDaysError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("dashboard.schoolDays");

  return (
    <div className="rounded-2xl bg-card border p-6 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
      <h2 className="text-base font-semibold mb-2">
        {t("errors.loadFailed")}
      </h2>
      <p className="text-xs text-muted-foreground mb-4">{error.message}</p>
      <Button onClick={reset} variant="outline">
        {t("errors.retry")}
      </Button>
    </div>
  );
}
