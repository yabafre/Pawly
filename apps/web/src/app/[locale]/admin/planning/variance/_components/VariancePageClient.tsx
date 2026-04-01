"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [page, setPage] = useState(0);

  const { events, total, isPending: isEventsLoading } = useAdminVarianceEvents({
    status: statusFilter,
    employeeId,
    month,
    page,
  });
  const { stats, isPending: isStatsLoading } = useVarianceStats({
    month,
    status: statusFilter,
    employeeId,
  });
  const { count: pendingCount } = usePendingVarianceCount();
  const { exportCsv, isPending: isExporting } = useExportVarianceCsv();
  const { employees } = useEmployees({});

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
          <Select
            value={employeeId ?? "__all__"}
            onValueChange={(v) => { setEmployeeId(v === "__all__" ? undefined : v); setPage(0); }}
          >
            <SelectTrigger className="h-9 w-[200px] rounded-xl" aria-label={t("list.employee")}>
              <SelectValue placeholder={t("list.allEmployees")} />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4} align="start" className="z-[100]">
              <SelectItem value="__all__">{t("list.allEmployees")}</SelectItem>
              {(employees as { id: string; firstName: string; lastName: string }[]).map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.lastName} {emp.firstName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="month"
            value={month}
            onChange={(e) => { setMonth(e.target.value); setPage(0); }}
            aria-label={t("monthSelector.label")}
            className="h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground"
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

      <VarianceStatusFilter selected={statusFilter} onSelect={(s) => { setStatusFilter(s); setPage(0); }} />

      <VarianceEventList
        events={events as VarianceEventItem[]}
        total={total}
        page={page}
        onPageChange={setPage}
        isPending={isEventsLoading}
      />
    </div>
  );
}
