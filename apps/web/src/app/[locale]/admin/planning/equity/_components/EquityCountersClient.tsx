"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useEquityCounters, useQuarterlySummary, useEquityThresholds } from "../_hooks/useEquityCounters";
import { EquityPeriodSelector } from "./EquityPeriodSelector";
import { EquityCountersTable } from "./EquityCountersTable";
import { EquitySummaryCards } from "./EquitySummaryCards";
import { EquityDistributionChart } from "./EquityDistributionChart";

export function EquityCountersClient() {
  const now = new Date();
  const [view, setView] = useState<"monthly" | "quarterly">("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));

  const t = useTranslations("admin.equityCounters");

  const months = view === "monthly" ? [month] : getQuarterMonths(quarter);

  const {
    counters,
    isPending,
    isFetching,
    recalculate,
    isRecalculating,
  } = useEquityCounters(year, months);

  const { summary: quarterlySummary, isPending: isQuarterlyPending } =
    useQuarterlySummary(year, quarter);

  const { thresholds } = useEquityThresholds();

  const handleRecalculate = () => {
    if (view === "quarterly") {
      for (const m of getQuarterMonths(quarter)) {
        recalculate({ year, month: m });
      }
    } else {
      recalculate({ year, month });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <EquityPeriodSelector
          view={view}
          onViewChange={setView}
          year={year}
          onYearChange={setYear}
          month={month}
          onMonthChange={setMonth}
          quarter={quarter}
          onQuarterChange={setQuarter}
        />

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 rounded-full border border-neutral-200 text-xs font-bold text-neutral-600 hover:bg-neutral-50"
              disabled={isRecalculating}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRecalculating ? "animate-spin" : ""}`}
              />
              {isRecalculating
                ? t("actions.recalculating")
                : t("actions.recalculate")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirm.recalculateTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("confirm.recalculateMessage")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("confirm.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleRecalculate}>
                {t("confirm.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <EquitySummaryCards counters={counters} isPending={isPending} />

      <EquityCountersTable
        counters={counters}
        isPending={isPending || isFetching}
        thresholds={thresholds}
      />

      {view === "quarterly" && !isQuarterlyPending && quarterlySummary.length > 0 && (
        <div className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-neutral-400">
            {t("quarterly.title")}
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {quarterlySummary.map((row: { employeeId: string; counterType: string; _sum: { count: number | null } }) => (
              <div
                key={`${row.employeeId}-${row.counterType}`}
                className="rounded-xl border border-neutral-50 bg-neutral-50/50 px-3 py-2 text-center"
              >
                <div className="text-lg font-bold text-neutral-800">
                  {row._sum.count ?? 0}
                </div>
                <div className="text-[10px] text-neutral-400">
                  {t(`counterTypes.${row.counterType}`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isPending && counters.length > 0 && (
        <EquityDistributionChart counters={counters} />
      )}
    </div>
  );
}

function getQuarterMonths(quarter: number): number[] {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}
