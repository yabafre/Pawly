"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";

type Props = {
  view: "monthly" | "quarterly";
  onViewChange: (view: "monthly" | "quarterly") => void;
  year: number;
  onYearChange: (year: number) => void;
  month: number;
  onMonthChange: (month: number) => void;
  quarter: number;
  onQuarterChange: (quarter: number) => void;
};

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const QUARTERS = [1, 2, 3, 4];

const MONTH_LABELS: Record<number, string> = {
  1: "Jan",
  2: "Feb",
  3: "Mar",
  4: "Apr",
  5: "May",
  6: "Jun",
  7: "Jul",
  8: "Aug",
  9: "Sep",
  10: "Oct",
  11: "Nov",
  12: "Dec",
};

export function EquityPeriodSelector({
  view,
  onViewChange,
  year,
  onYearChange,
  month,
  onMonthChange,
  quarter,
  onQuarterChange,
}: Props) {
  const t = useTranslations("admin.equityCounters.period");
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 3 }, (_, i) => currentYear - i);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-full border border-neutral-200 bg-neutral-50 p-0.5">
        <button
          onClick={() => onViewChange("monthly")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
            view === "monthly"
              ? "bg-neutral-900 text-white shadow-sm"
              : "text-neutral-500 hover:text-neutral-900"
          }`}
        >
          {t("monthly")}
        </button>
        <button
          onClick={() => onViewChange("quarterly")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
            view === "quarterly"
              ? "bg-neutral-900 text-white shadow-sm"
              : "text-neutral-500 hover:text-neutral-900"
          }`}
        >
          {t("quarterly")}
        </button>
      </div>

      <Select value={String(year)} onValueChange={(v) => onYearChange(Number(v))}>
        <SelectTrigger className="h-8 rounded-full border-neutral-200 bg-white text-xs font-bold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {view === "monthly" ? (
        <Select value={String(month)} onValueChange={(v) => onMonthChange(Number(v))}>
          <SelectTrigger className="h-8 rounded-full border-neutral-200 bg-white text-xs font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {MONTH_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Select value={String(quarter)} onValueChange={(v) => onQuarterChange(Number(v))}>
          <SelectTrigger className="h-8 rounded-full border-neutral-200 bg-white text-xs font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUARTERS.map((q) => (
              <SelectItem key={q} value={String(q)}>
                Q{q}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
