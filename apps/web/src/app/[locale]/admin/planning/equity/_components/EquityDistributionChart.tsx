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

// Monochrome palette: primary teal + neutral grays for contrast
const COUNTER_FILLS: Record<string, string> = {
  SATURDAY_WORKED: "hsl(174, 100%, 29%)",    // primary teal
  WEEKEND_TOTAL: "hsl(174, 50%, 50%)",       // lighter teal
  HOLIDAY_WORKED: "hsl(220, 10%, 50%)",      // neutral gray
  OVERTIME_HOURS: "hsl(220, 10%, 72%)",      // light gray
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
    <Card className="border-border shadow-none overflow-visible">
      <CardHeader>
        <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {t("chart.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-visible">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "16px",
                border: "1px solid hsl(var(--border))",
                backgroundColor: "hsl(var(--card))",
                fontSize: "12px",
                padding: "12px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
              cursor={{ fill: "rgba(0,0,0,0.03)" }}
              wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
              allowEscapeViewBox={{ x: true, y: false }}
              position={{ y: -10 }}
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
