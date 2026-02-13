"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import type { CounterThreshold } from "../_hooks/useEquityCounters";

type CounterRow = {
  employeeId: string;
  employeeName: string;
  jobType: string;
  SATURDAY_WORKED: number;
  WEEKEND_TOTAL: number;
  HOLIDAY_WORKED: number;
  OVERTIME_HOURS: number;
};

type EquityCounter = {
  id: string;
  counterType: string;
  count: number;
  year: number;
  month: number;
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
  thresholds: CounterThreshold[];
};

const COUNTER_TYPES = [
  "SATURDAY_WORKED",
  "WEEKEND_TOTAL",
  "HOLIDAY_WORKED",
  "OVERTIME_HOURS",
] as const;

function aggregateByEmployee(counters: EquityCounter[]): CounterRow[] {
  const map = new Map<string, CounterRow>();

  for (const c of counters) {
    if (!map.has(c.employeeId)) {
      map.set(c.employeeId, {
        employeeId: c.employeeId,
        employeeName: `${c.employee.firstName} ${c.employee.lastName}`,
        jobType: c.employee.jobType,
        SATURDAY_WORKED: 0,
        WEEKEND_TOTAL: 0,
        HOLIDAY_WORKED: 0,
        OVERTIME_HOURS: 0,
      });
    }
    const row = map.get(c.employeeId)!;
    if (c.counterType in row) {
      row[c.counterType as keyof Omit<CounterRow, "employeeId" | "employeeName" | "jobType">] += c.count;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName),
  );
}

function getThresholdColor(current: number, max: number | undefined): string {
  if (max === undefined || max <= 0) {
    return current > 0
      ? "bg-neutral-100 text-neutral-700 border-neutral-200"
      : "border-neutral-100 bg-neutral-50 text-neutral-300";
  }
  const ratio = current / max;
  if (ratio >= 1) return "bg-rose-50 text-rose-700 border-rose-200";
  if (ratio >= 0.75) return "bg-amber-50 text-amber-700 border-amber-200";
  if (current > 0) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "border-neutral-100 bg-neutral-50 text-neutral-300";
}

function formatCounterValue(ct: string, value: number): string {
  if (ct === "OVERTIME_HOURS") {
    const hours = value / 60;
    return hours === 0 ? "0" : `${hours.toFixed(1)}h`;
  }
  return String(value);
}

export function EquityCountersTable({ counters, isPending, thresholds }: Props) {
  const t = useTranslations("admin.equityCounters");
  const rows = aggregateByEmployee(counters);

  const thresholdMap = new Map<string, number>();
  for (const th of thresholds) {
    thresholdMap.set(th.counterType, th.max);
  }

  if (isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center border-dashed border-neutral-200 bg-neutral-50/50 py-16 text-center shadow-none">
        <p className="text-sm font-bold text-neutral-500">{t("table.noData")}</p>
        <p className="mt-1 text-xs text-neutral-400">{t("table.noDataDescription")}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-neutral-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
      <Table>
        <TableHeader>
          <TableRow className="border-neutral-100 bg-neutral-50/60 hover:bg-neutral-50/60">
            <TableHead className="pl-6 h-12 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              {t("table.employee")}
            </TableHead>
            <TableHead className="h-12 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              {t("table.jobType")}
            </TableHead>
            {COUNTER_TYPES.map((ct) => (
              <TableHead
                key={ct}
                className="h-12 text-center text-[10px] font-bold uppercase tracking-widest text-neutral-400"
              >
                {t(`counterTypes.${ct}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.employeeId} className="border-neutral-50 hover:bg-neutral-50/50 transition-colors">
              <TableCell className="pl-6 py-4 font-bold text-sm text-neutral-900">
                {row.employeeName}
              </TableCell>
              <TableCell className="py-4">
                <Badge variant="outline" className="text-[10px] border-neutral-200 text-neutral-500 font-medium">
                  {row.jobType}
                </Badge>
              </TableCell>
              {COUNTER_TYPES.map((ct) => {
                const value = row[ct];
                const max = thresholdMap.get(ct);
                const colorClass = getThresholdColor(value, max);
                const display = formatCounterValue(ct, value);
                const label = max !== undefined ? `${display}/${max}` : display;

                return (
                  <TableCell key={ct} className="text-center py-4">
                    <span
                      className={`inline-flex min-w-[3rem] items-center justify-center rounded-full border px-2.5 py-1 text-xs font-bold transition-all ${colorClass}`}
                    >
                      {label}
                    </span>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
