"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EmployeesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("employees.errors");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
          <AlertCircle className="h-5 w-5 text-destructive" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-destructive">{t("loadFailed")}</p>
          <p className="mt-1 text-xs text-destructive/70">{t("loadFailedDescription")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          className="shrink-0 rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5"
        >
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          {t("retry")}
        </Button>
      </div>
    </div>
  );
}
