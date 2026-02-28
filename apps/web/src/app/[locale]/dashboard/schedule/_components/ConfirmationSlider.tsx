"use client";

import { useTranslations } from "next-intl";
import { Check, Loader2, ArrowRight } from "lucide-react";

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

  // Confirmed state — green badge, non-interactive
  if (isConfirmed) {
    return (
      <div
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-100 px-4 text-emerald-700"
        role="status"
        aria-live="polite"
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-semibold">{t("confirmed")}</span>
      </div>
    );
  }

  // Loading state — non-interactive, pulse animation
  if (isPending) {
    return (
      <div
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-neutral-100 px-4 motion-safe:animate-pulse"
        role="status"
        aria-live="polite"
        aria-label={t("confirming")}
      >
        <Loader2 className="h-4 w-4 animate-spin text-neutral-500" aria-hidden="true" />
        <span className="text-sm text-neutral-500">{t("confirming")}</span>
      </div>
    );
  }

  // Idle state — orange outline, actionable
  return (
    <button
      type="button"
      role="switch"
      aria-checked={false}
      aria-label={t("slideToConfirm")}
      onClick={onConfirm}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onConfirm();
        }
      }}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-orange-300 bg-orange-50 px-4 text-orange-700 transition-colors hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 motion-safe:active:scale-[0.98]"
    >
      <span className="text-sm font-semibold">{t("slideToConfirm")}</span>
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
