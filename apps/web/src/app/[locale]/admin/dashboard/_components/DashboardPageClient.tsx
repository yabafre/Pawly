"use client";

import { useTranslations } from "next-intl";
import {
  Calendar,
  CheckCircle2,
  Users,
  AlertTriangle,
  ArrowRight,
  GitCompareArrows,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useDashboardStats } from "../_hooks/useDashboardStats";

const StatCard = ({
  title,
  value,
  helper,
  icon: Icon,
  accent,
  href,
  linkLabel,
}: {
  title: string;
  value: string | number;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  href?: string;
  linkLabel?: string;
}) => (
  <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-neutral-100 p-6 flex flex-col justify-between gap-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">
          {title}
        </p>
        <div className="text-3xl font-extrabold text-neutral-900 mt-2">
          {value}
        </div>
        <p className="text-xs text-neutral-500 mt-1">{helper}</p>
      </div>
      <div
        className={`w-12 h-12 rounded-2xl ${accent} flex items-center justify-center shrink-0`}
      >
        <Icon className="w-5 h-5" />
      </div>
    </div>
    {href && linkLabel && (
      <Link
        href={href}
        className="text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-1"
      >
        {linkLabel}
        <ArrowRight className="w-3 h-3" />
      </Link>
    )}
  </div>
);

const SkeletonCard = () => (
  <div className="bg-white rounded-3xl border border-neutral-100 p-6 animate-pulse">
    <div className="h-3 w-24 bg-neutral-100 rounded mb-4" />
    <div className="h-8 w-16 bg-neutral-100 rounded mb-2" />
    <div className="h-3 w-32 bg-neutral-100 rounded" />
  </div>
);

export function DashboardPageClient() {
  const t = useTranslations("admin.dashboard");
  const { stats, isPending } = useDashboardStats();

  if (isPending) {
    return (
      <div className="space-y-6 animate-in fade-in">
        <div>
          <div className="h-7 w-48 bg-neutral-100 rounded animate-pulse mb-2" />
          <div className="h-4 w-64 bg-neutral-100 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="h-36 bg-white rounded-3xl border border-neutral-100 animate-pulse" />
      </div>
    );
  }

  const pendingHelper = stats
    ? stats.pendingRequests > 0
      ? t("pendingDetail", {
          absences: stats.pendingAbsences,
          variances: stats.pendingVariances,
          both: stats.pendingAbsences > 0 && stats.pendingVariances > 0 ? "true" : "false",
        })
      : t("noPending")
    : t("noPending");

  const teamHelper = stats
    ? t("teamBreakdown", { count: stats.activeEmployees })
    : "";

  return (
    <div className="space-y-6 animate-in fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          {t("overview")}
        </h1>
        <p className="text-neutral-400">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title={t("monthlyPlanning")}
          value={`${stats?.monthlyPlannedHours ?? 0}h`}
          helper={t("shiftsCount", { count: stats?.totalShifts ?? 0 })}
          icon={Calendar}
          accent="bg-indigo-50 text-indigo-600"
          href="/admin/planning"
          linkLabel={t("goToPlanning")}
        />
        <StatCard
          title={t("pendingRequests")}
          value={stats?.pendingRequests ?? 0}
          helper={pendingHelper}
          icon={stats && stats.pendingRequests > 0 ? AlertTriangle : CheckCircle2}
          accent={
            stats && stats.pendingRequests > 0
              ? "bg-orange-50 text-orange-600"
              : "bg-emerald-50 text-emerald-600"
          }
          href={
            stats && stats.pendingVariances > 0
              ? "/admin/planning/variance"
              : "/admin/employees/absences"
          }
          linkLabel={
            stats && stats.pendingVariances > 0
              ? t("goToVariance")
              : t("goToAbsences")
          }
        />
        <StatCard
          title={t("activeTeam")}
          value={stats?.activeEmployees ?? 0}
          helper={teamHelper}
          icon={Users}
          accent="bg-emerald-50 text-emerald-600"
        />
      </div>

      <div className="bg-white rounded-3xl border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-neutral-900">
            {t("quickSummary")}
          </h2>
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
            {t("week", { number: stats?.weekNumber ?? 0 })}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-neutral-600">
          <div className="p-4 rounded-2xl bg-neutral-50 flex items-center gap-3">
            <GitCompareArrows className="w-4 h-4 text-neutral-400 shrink-0" />
            {stats && stats.pendingVariances > 0 ? (
              <span>
                <strong className="text-orange-600">
                  {stats.pendingVariances}
                </strong>{" "}
                {t("pendingDetail", {
                  absences: 0,
                  variances: stats.pendingVariances,
                  both: "false",
                })}
              </span>
            ) : (
              <span className="text-emerald-600">{t("noPending")}</span>
            )}
          </div>
          <div className="p-4 rounded-2xl bg-neutral-50 flex items-center gap-3">
            <Users className="w-4 h-4 text-neutral-400 shrink-0" />
            {stats && stats.undeclaredApprenticeCount > 0 ? (
              <span className="text-orange-600">
                {t("apprenticesWarning", {
                  count: stats.undeclaredApprenticeCount,
                })}
              </span>
            ) : (
              <span className="text-emerald-600">{t("apprenticesOk")}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
