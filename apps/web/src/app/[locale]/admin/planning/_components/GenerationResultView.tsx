"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  BarChart3,
} from "lucide-react";
import type { GenerationResult } from "@pawly/validators";

type Props = {
  result: GenerationResult;
};

export function GenerationResultView({ result }: Props) {
  const t = useTranslations("admin.planningGeneration");

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label={t("stats.totalSlots")}
          value={result.stats.totalSlots}
          icon={<BarChart3 size={16} className="text-neutral-400" />}
        />
        <StatCard
          label={t("stats.filledSlots")}
          value={result.stats.filledSlots}
          icon={<CheckCircle2 size={16} className="text-emerald-500" />}
        />
        <StatCard
          label={t("stats.holes")}
          value={result.stats.holeCount}
          icon={<AlertTriangle size={16} className="text-amber-500" />}
        />
        <StatCard
          label={t("stats.hardViolations")}
          value={result.stats.hardViolationCount}
          icon={<XCircle size={16} className="text-red-500" />}
        />
        <StatCard
          label={t("stats.softWarnings")}
          value={result.stats.softWarningCount}
          icon={<AlertTriangle size={16} className="text-orange-400" />}
        />
      </div>

      {/* Holes */}
      {result.holes.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-600 mb-3">
            {t("result.holesTitle")} ({result.holes.length})
          </h3>
          <div className="space-y-2">
            {result.holes.map((hole) => (
              <div
                key={`hole-${hole.date}-${hole.shiftTypeCode}`}
                className="flex items-center justify-between rounded-xl bg-amber-50/50 px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <span className="font-medium text-neutral-800">
                    {hole.date} &mdash; {hole.shiftTypeCode}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {hole.assignedStaff}/{hole.requiredStaff}
                  </Badge>
                  <span className="text-xs text-neutral-500">
                    {hole.reason}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hard violations */}
      {result.violations.hard.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-red-600 mb-3">
            {t("result.hardViolationsTitle")} (
            {result.violations.hard.length})
          </h3>
          <div className="space-y-2">
            {result.violations.hard.map((v) => (
              <div
                key={`hard-${v.ruleId}-${v.affectedDate ?? ''}`}
                className="flex items-start gap-3 rounded-xl bg-red-50/50 px-4 py-2.5 text-sm"
              >
                <XCircle size={14} className="text-red-500 mt-0.5" />
                <div>
                  <span className="font-medium text-neutral-800">
                    {v.ruleName}
                  </span>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {v.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Soft violations */}
      {result.violations.soft.length > 0 && (
        <div className="bg-white rounded-2xl border border-orange-100 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-orange-500 mb-3">
            {t("result.softWarningsTitle")} (
            {result.violations.soft.length})
          </h3>
          <div className="space-y-2">
            {result.violations.soft.map((v) => (
              <div
                key={`soft-${v.ruleId}-${v.affectedDate ?? ''}-${v.affectedEmployeeId ?? ''}`}
                className="flex items-start gap-3 rounded-xl bg-orange-50/50 px-4 py-2.5 text-sm"
              >
                <AlertTriangle
                  size={14}
                  className="text-orange-400 mt-0.5"
                />
                <div>
                  <span className="font-medium text-neutral-800">
                    {v.ruleName}
                  </span>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {v.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success state */}
      {result.holes.length === 0 &&
        result.violations.hard.length === 0 &&
        result.violations.soft.length === 0 && (
          <div className="bg-emerald-50/50 rounded-2xl border border-emerald-100 p-6 text-center">
            <CheckCircle2
              size={32}
              className="text-emerald-500 mx-auto mb-2"
            />
            <p className="font-bold text-emerald-700">
              {t("result.allGood")}
            </p>
          </div>
        )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          {label}
        </span>
      </div>
      <div className="text-2xl font-extrabold text-neutral-900">{value}</div>
    </div>
  );
}
