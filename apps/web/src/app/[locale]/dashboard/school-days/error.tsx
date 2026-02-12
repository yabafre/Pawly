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
    <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-100 text-center">
      <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
      <h2 className="text-lg font-bold text-neutral-900 mb-2">
        {t("errors.loadFailed")}
      </h2>
      <p className="text-sm text-neutral-500 mb-4">{error.message}</p>
      <Button
        onClick={reset}
        className="bg-neutral-900 hover:bg-neutral-800 text-white rounded-2xl font-bold"
      >
        {t("errors.retry")}
      </Button>
    </div>
  );
}
