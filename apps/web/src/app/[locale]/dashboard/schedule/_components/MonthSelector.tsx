"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";

interface MonthSelectorProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}

function getMonthRange(): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return months;
}

export function MonthSelector({
  selectedMonth,
  onMonthChange,
}: MonthSelectorProps) {
  const t = useTranslations("dashboard.schedule.monthSelector");
  const locale = useLocale();
  const months = getMonthRange();
  let currentIndex = months.indexOf(selectedMonth);

  // Guard: if selectedMonth is outside the valid range (e.g., stale cache),
  // clamp to the nearest boundary
  if (currentIndex === -1) {
    const nearest = months[Math.floor(months.length / 2)];
    onMonthChange(nearest);
    currentIndex = Math.floor(months.length / 2);
  }

  const formatMonthLabel = (month: string) => {
    const [year, m] = month.split("-").map(Number);
    const date = new Date(year, m - 1, 1);
    return date.toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  };

  const canPrev = currentIndex > 0;
  const canNext = currentIndex < months.length - 1;

  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full"
        disabled={!canPrev}
        onClick={() => canPrev && onMonthChange(months[currentIndex - 1])}
        aria-label={t("previous")}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <span
        className="min-w-[140px] text-center text-base font-semibold capitalize text-neutral-900"
        aria-live="polite"
        aria-atomic="true"
      >
        {formatMonthLabel(selectedMonth)}
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full"
        disabled={!canNext}
        onClick={() => canNext && onMonthChange(months[currentIndex + 1])}
        aria-label={t("next")}
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}
