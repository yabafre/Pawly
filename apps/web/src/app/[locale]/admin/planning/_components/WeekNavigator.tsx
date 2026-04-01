"use client";

import { useTranslations, useLocale } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScheduleDayInfo } from "@pawly/validators";

type Props = {
  weeks: ScheduleDayInfo[][];
  currentWeekIndex: number;
  onWeekChange: (index: number) => void;
};

export function WeekNavigator({ weeks, currentWeekIndex, onWeekChange }: Props) {
  const t = useTranslations("admin.scheduleView.weekNavigator");
  const locale = useLocale();

  if (weeks.length <= 1) return null;

  const currentWeek = weeks[currentWeekIndex];
  const firstDay = currentWeek?.[0];
  const weekLabel = firstDay
    ? t("weekOf", {
        date: new Date(`${firstDay.date}T00:00:00`).toLocaleDateString(locale, {
          month: "short",
          day: "numeric",
        }),
      })
    : `${t("label")} ${currentWeekIndex + 1}`;

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onWeekChange(currentWeekIndex - 1)}
        disabled={currentWeekIndex === 0}
        aria-label={t("previous")}
        className="h-8 w-8 p-0"
      >
        <ChevronLeft size={16} />
      </Button>

      <div className="flex items-center gap-1.5">
        {weeks.map((week, i) => (
          <button
            key={i}
            onClick={() => onWeekChange(i)}
            className={`h-8 min-w-[32px] px-2.5 rounded-lg text-xs font-semibold transition-colors ${
              i === currentWeekIndex
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted"
            }`}
            aria-label={`${t("label")} ${i + 1}`}
            aria-current={i === currentWeekIndex ? "true" : undefined}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onWeekChange(currentWeekIndex + 1)}
        disabled={currentWeekIndex === weeks.length - 1}
        aria-label={t("next")}
        className="h-8 w-8 p-0"
      >
        <ChevronRight size={16} />
      </Button>

      <span className="text-sm text-muted-foreground ml-2">{weekLabel}</span>
    </div>
  );
}
