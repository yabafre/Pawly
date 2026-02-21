"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type { EquitySummaryEntry } from "@pawly/validators";

type Props = {
  entry: EquitySummaryEntry;
};

export function EmployeeEquityBadge({ entry }: Props) {
  const t = useTranslations("admin.equity");

  const status = useMemo(() => {
    let aboveCount = 0;
    let belowCount = 0;
    for (const counter of entry.counters) {
      if (counter.count > counter.clinicAverage) aboveCount++;
      if (counter.count < counter.clinicAverage) belowCount++;
    }
    if (aboveCount > 0) return "above" as const;
    if (belowCount > 0) return "below" as const;
    return "average" as const;
  }, [entry.counters]);

  if (entry.counters.length === 0) return null;

  const Icon = status === "above" ? TrendingUp : status === "below" ? TrendingDown : Minus;
  const colorClass =
    status === "above"
      ? "text-orange-500"
      : status === "below"
        ? "text-teal-500"
        : "text-neutral-400";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center ${colorClass}`}
          aria-label={t("badgeLabel")}
        >
          <Icon size={12} strokeWidth={2} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3 text-xs" side="right" align="center">
        <p className="font-semibold text-neutral-900 mb-2">{t("popoverTitle")}</p>
        {entry.counters.map((c) => {
          const threshold = (c as { maxPerPeriod?: number }).maxPerPeriod;
          const displayMax = threshold ?? c.clinicAverage;
          return (
            <div key={c.counterType} className="flex items-center justify-between py-1">
              <span className="text-neutral-600">{t(`counterType.${c.counterType}`)}</span>
              <span className={c.count > displayMax ? "font-bold text-orange-600" : "text-neutral-500"}>
                {c.count} / {displayMax}
              </span>
            </div>
          );
        })}
        <p className="text-neutral-400 mt-1 text-[10px]">{t("popoverHint")}</p>
      </PopoverContent>
    </Popover>
  );
}
