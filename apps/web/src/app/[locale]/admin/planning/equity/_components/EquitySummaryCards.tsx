"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

type EquityCounter = {
  id: string;
  counterType: string;
  count: number;
  employeeId: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    jobType: string;
  };
};

type Props = {
  counters: EquityCounter[];
  isPending: boolean;
};

export function EquitySummaryCards({ counters, isPending }: Props) {
  const t = useTranslations("admin.equityCounters.summary");

  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-3xl" />
        ))}
      </div>
    );
  }

  const saturdayCounters = counters.filter(
    (c) => c.counterType === "SATURDAY_WORKED",
  );
  const employeeSaturdayTotals = new Map<string, { name: string; total: number }>();
  for (const c of saturdayCounters) {
    const existing = employeeSaturdayTotals.get(c.employeeId);
    if (existing) {
      existing.total += c.count;
    } else {
      employeeSaturdayTotals.set(c.employeeId, {
        name: `${c.employee.firstName} ${c.employee.lastName}`,
        total: c.count,
      });
    }
  }

  const entries = Array.from(employeeSaturdayTotals.values());
  const avgSaturdays =
    entries.length > 0
      ? (entries.reduce((sum, e) => sum + e.total, 0) / entries.length).toFixed(1)
      : "0";

  const sorted = [...entries].sort((a, b) => b.total - a.total);
  const mostLoaded = sorted[0]?.name ?? t("noEmployees");
  const leastLoaded = sorted[sorted.length - 1]?.name ?? t("noEmployees");

  const max = sorted[0]?.total ?? 0;
  const min = sorted[sorted.length - 1]?.total ?? 0;
  const fairnessIndex =
    max === 0 ? 100 : Math.round(((max - min) / max) * 100);
  const fairnessScore = 100 - fairnessIndex;

  const cards = [
    {
      label: t("avgSaturdays"),
      value: avgSaturdays,
      accent: "bg-orange-500/10 text-orange-600",
    },
    {
      label: t("fairnessIndex"),
      value: `${fairnessScore}%`,
      accent: fairnessScore >= 80
        ? "bg-emerald-500/10 text-emerald-600"
        : fairnessScore >= 50
          ? "bg-amber-500/10 text-amber-600"
          : "bg-rose-500/10 text-rose-600",
    },
    {
      label: t("mostLoaded"),
      value: mostLoaded,
      accent: "bg-rose-500/10 text-rose-600",
    },
    {
      label: t("leastLoaded"),
      value: leastLoaded,
      accent: "bg-[#009588]/10 text-[#009588]",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-3xl border border-neutral-100 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            {card.label}
          </div>
          <div
            className={`mt-2 truncate text-xl font-extrabold ${card.accent}`}
          >
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
