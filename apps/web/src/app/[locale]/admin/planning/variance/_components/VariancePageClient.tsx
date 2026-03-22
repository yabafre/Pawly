"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useAdminVarianceEvents,
  useVarianceStats,
  usePendingVarianceCount,
  useExportVarianceCsv,
} from "../_hooks/useAdminVariance";
import { useEmployees } from "@/app/[locale]/admin/employees/_hooks/useEmployees";
import { VarianceStatsPanel } from "./VarianceStatsPanel";
import { VarianceStatusFilter } from "./VarianceStatusFilter";
import { VarianceEventList } from "./VarianceEventList";
import type { VarianceEventItem } from "./VarianceEventList";

export function VariancePageClient() {
  const t = useTranslations("admin.variance");

  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  );
  const [employeeId, setEmployeeId] = useState<string | undefined>(undefined);

  const { events, isPending: isEventsLoading } = useAdminVarianceEvents({
    status: statusFilter,
    employeeId,
    month,
  });
  const { stats, isPending: isStatsLoading } = useVarianceStats(month);
  const { count: pendingCount } = usePendingVarianceCount();
  const { exportCsv, isPending: isExporting } = useExportVarianceCsv();
  const { employees } = useEmployees({});

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMonth(e.target.value);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              {t("title")}
            </h1>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="rounded-full">
                {t("pendingBadge", { count: pendingCount })}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={employeeId ?? ""}
            onChange={(e) => setEmployeeId(e.target.value || undefined)}
            aria-label={t("list.employee")}
            className="h-9 rounded-xl border border-border px-3 text-sm bg-card"
          >
            <option value="">{t("list.allEmployees")}</option>
            {(employees as { id: string; firstName: string; lastName: string }[]).map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.lastName} {emp.firstName}
              </option>
            ))}
          </select>
          <input
            type="month"
            value={month}
            onChange={handleMonthChange}
            aria-label={t("monthSelector.label")}
            className="h-9 rounded-xl border border-border px-3 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => exportCsv(month, employeeId)}
            disabled={isExporting}
          >
            <Download size={14} className="mr-1.5" />
            {t("actions.exportCsv")}
          </Button>
        </div>
      </div>

      <VarianceStatsPanel stats={stats} isPending={isStatsLoading} />

      <VarianceStatusFilter selected={statusFilter} onSelect={setStatusFilter} />

      <VarianceEventList
        events={events as VarianceEventItem[]}
        isPending={isEventsLoading}
      />
    </div>
  );
}
