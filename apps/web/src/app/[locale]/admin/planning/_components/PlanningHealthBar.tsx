"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  hardViolationCount: number;
  softViolationCount: number;
  totalShifts: number;
  onPublish?: () => void;
};

export function PlanningHealthBar({
  hardViolationCount,
  softViolationCount,
  totalShifts,
  onPublish,
}: Props) {
  const t = useTranslations("admin.planningRules.healthBar");

  const totalViolations = hardViolationCount + softViolationCount;
  const readyPercent =
    totalShifts > 0
      ? Math.round(((totalShifts - totalViolations) / totalShifts) * 100)
      : hardViolationCount === 0 && softViolationCount === 0
        ? 100
        : 0;

  const clampedPercent = Math.max(0, Math.min(100, readyPercent));

  const hardWidth =
    totalShifts > 0
      ? Math.round((hardViolationCount / totalShifts) * 100)
      : hardViolationCount > 0
        ? 50
        : 0;

  const softWidth =
    totalShifts > 0
      ? Math.round((softViolationCount / totalShifts) * 100)
      : softViolationCount > 0
        ? 30
        : 0;

  const healthyWidth = Math.max(0, 100 - hardWidth - softWidth);

  const hasHardConflicts = hardViolationCount > 0;
  const hasSoftWarnings = softViolationCount > 0;
  const isHealthy = !hasHardConflicts && !hasSoftWarnings;

  return (
    <section className="group relative overflow-hidden rounded-3xl border border-neutral-100 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] md:p-6">
      {/* Glow hover */}
      <div className="pointer-events-none absolute -left-16 -top-16 h-[200px] w-[200px] rounded-full bg-[#009588] opacity-0 blur-[60px] transition-opacity duration-700 group-hover:opacity-[0.06]" />

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {hasHardConflicts ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-100">
                <AlertCircle className="h-4 w-4 text-rose-600" strokeWidth={1.5} />
              </div>
            ) : hasSoftWarnings ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-orange-200 bg-orange-100">
                <AlertTriangle className="h-4 w-4 text-orange-600" strokeWidth={1.5} />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100">
                <CheckCircle2 className="h-4 w-4 text-[#009588]" strokeWidth={1.5} />
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-neutral-900">
                {t("title")}
              </p>
              <p className="text-xs text-neutral-500">
                {isHealthy
                  ? t("healthy")
                  : `${t("conflicts", { count: hardViolationCount })}, ${t("warnings", { count: softViolationCount })}, ${t("ready", { percent: clampedPercent })}`}
              </p>
            </div>
          </div>

          {onPublish && (
            <Button
              onClick={onPublish}
              disabled={hasHardConflicts}
              className="rounded-xl bg-neutral-900 font-bold text-white shadow-lg shadow-neutral-900/10 hover:bg-black disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none"
              title={hasHardConflicts ? t("publishBlocked") : undefined}
            >
              {t("publish")}
            </Button>
          )}
        </div>

        {/* Segmented bar */}
        <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
          {hardWidth > 0 && (
            <div
              className="bg-rose-500 transition-all duration-500 ease-out"
              style={{ width: `${hardWidth}%` }}
            />
          )}
          {softWidth > 0 && (
            <div
              className="bg-orange-400 transition-all duration-500 ease-out"
              style={{ width: `${softWidth}%` }}
            />
          )}
          {healthyWidth > 0 && (
            <div
              className="bg-[#009588] transition-all duration-500 ease-out"
              style={{ width: `${healthyWidth}%` }}
            />
          )}
        </div>

        {hasHardConflicts && (
          <p className="mt-2 text-xs font-medium text-rose-600">
            {t("publishBlocked")}
          </p>
        )}
      </div>
    </section>
  );
}
