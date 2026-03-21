"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

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

export function MonthSelector({ selectedMonth, onMonthChange }: MonthSelectorProps) {
  const t = useTranslations("dashboard.schedule.monthSelector");
  const locale = useLocale();
  const months = getMonthRange();
  let currentIndex = months.indexOf(selectedMonth);

  if (currentIndex === -1) {
    const nearest = months[Math.floor(months.length / 2)];
    onMonthChange(nearest);
    currentIndex = Math.floor(months.length / 2);
  }

  const formatMonthLabel = (month: string) => {
    const [year, m] = month.split("-").map(Number);
    const date = new Date(year, m - 1, 1);
    return date.toLocaleDateString(locale, { month: "long", year: "numeric" });
  };

  const canPrev = currentIndex > 0;
  const canNext = currentIndex < months.length - 1;

  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold tracking-tight capitalize" aria-live="polite" aria-atomic="true">
        {formatMonthLabel(selectedMonth)}
      </h2>
      <div className="flex gap-1 border rounded-full p-1 bg-card">
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition disabled:opacity-30"
          disabled={!canPrev}
          onClick={() => canPrev && onMonthChange(months[currentIndex - 1])}
          aria-label={t("previous")}
        >
          <ChevronLeft size={18} strokeWidth={1.5} />
        </button>
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition disabled:opacity-30"
          disabled={!canNext}
          onClick={() => canNext && onMonthChange(months[currentIndex + 1])}
          aria-label={t("next")}
        >
          <ChevronRight size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
