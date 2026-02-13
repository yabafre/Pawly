"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EquityError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("admin.equityCounters.errors");

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="flex items-center gap-4 rounded-2xl border border-red-100 bg-red-50/60 p-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
          <AlertCircle className="h-5 w-5 text-red-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-700">{t("loadFailed")}</p>
          <p className="mt-1 text-xs text-red-500">{t("loadFailedDescription")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          className="shrink-0 rounded-xl border-red-200 text-red-700 hover:bg-red-50"
        >
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          {t("retry")}
        </Button>
      </div>
    </div>
  );
}
