"use client";

import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VarianceError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("admin.variance.errors");

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="w-12 h-12 text-rose-400 mb-4" />
      <h2 className="text-lg font-semibold text-neutral-900 mb-1">
        {t("loadFailed")}
      </h2>
      <p className="text-sm text-neutral-500 mb-6">
        {t("loadFailedDescription")}
      </p>
      <Button onClick={reset} className="rounded-xl">
        {t("retry")}
      </Button>
    </div>
  );
}
