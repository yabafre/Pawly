"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

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
          <Skeleton key={i} className="h-32 rounded-2xl" />
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
    { label: t("avgSaturdays"), value: avgSaturdays },
    { label: t("fairnessIndex"), value: `${fairnessScore}%` },
    { label: t("mostLoaded"), value: mostLoaded },
    { label: t("leastLoaded"), value: leastLoaded },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="border-border shadow-none">
          <CardContent className="p-5 flex flex-col items-start justify-between h-full">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
              {card.label}
            </span>
            <div className="text-xl font-extrabold text-foreground">
              {card.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
