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
