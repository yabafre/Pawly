"use client";

import { useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmationSliderProps {
  isConfirmed: boolean;
  isPending: boolean;
  onConfirm: () => void;
}

export function ConfirmationSlider({
  isConfirmed,
  isPending,
  onConfirm,
}: ConfirmationSliderProps) {
  const t = useTranslations("dashboard.schedule.confirmation");

  if (isConfirmed) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-primary font-medium" role="status" aria-live="polite">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        {t("confirmed")}
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {t("confirming")}
      </div>
    );
  }

  return (
    <Button
      type="button"
      onClick={onConfirm}
      className="w-full"
      aria-label={t("slideToConfirm")}
    >
      {t("slideToConfirm")}
    </Button>
  );
}
