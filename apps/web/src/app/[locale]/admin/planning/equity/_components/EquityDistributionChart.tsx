"use client";

import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
};

const COUNTER_FILLS: Record<string, string> = {
  SATURDAY_WORKED: "#f97316",
  WEEKEND_TOTAL: "#3b82f6",
  HOLIDAY_WORKED: "#f43f5e",
  OVERTIME_HOURS: "#f59e0b",
};

export function EquityDistributionChart({ counters }: Props) {
  const t = useTranslations("admin.equityCounters");

  const employeeMap = new Map<
    string,
    { name: string; SATURDAY_WORKED: number; WEEKEND_TOTAL: number; HOLIDAY_WORKED: number; OVERTIME_HOURS: number }
  >();

  for (const c of counters) {
    if (!employeeMap.has(c.employeeId)) {
      employeeMap.set(c.employeeId, {
        name: `${c.employee.firstName} ${c.employee.lastName.charAt(0)}.`,
        SATURDAY_WORKED: 0,
        WEEKEND_TOTAL: 0,
        HOLIDAY_WORKED: 0,
        OVERTIME_HOURS: 0,
      });
    }
    const entry = employeeMap.get(c.employeeId)!;
    const key = c.counterType as keyof typeof COUNTER_FILLS;
    if (key in entry) {
      (entry as Record<string, number | string>)[key] =
        ((entry as Record<string, number | string>)[key] as number) + c.count;
    }
  }

  const data = Array.from(employeeMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  if (data.length === 0) return null;

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {t("chart.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "#737373" }}
              tickLine={false}
              axisLine={{ stroke: "#e5e5e5" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#737373" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "16px",
                border: "1px solid #e5e5e5",
                boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                fontSize: "12px",
                padding: "12px",
              }}
              cursor={{ fill: "#f5f5f5" }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", paddingTop: "20px" }}
              iconType="circle"
            />
            {(Object.keys(COUNTER_FILLS) as Array<keyof typeof COUNTER_FILLS>).map(
              (ct) => (
                <Bar
                  key={ct}
                  dataKey={ct}
                  name={t(`counterTypes.${ct}`)}
                  fill={COUNTER_FILLS[ct]}
                  radius={[4, 4, 4, 4]}
                  maxBarSize={32}
                />
              ),
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
