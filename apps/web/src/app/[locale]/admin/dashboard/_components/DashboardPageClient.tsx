"use client";

import { useTranslations } from "next-intl";
import {
  Calendar,
  CheckCircle2,
  Users,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Clock,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useDashboardStats } from "../_hooks/useDashboardStats";
import { useEffect, useReducer } from "react";
import AdminLoading from "../../loading";
import { UpgradeModal } from "../../_components/UpgradeModal";
import { useSubscription } from "@/lib/contexts/subscription-context";

const StatCard = ({
  title,
  value,
  helper,
  icon: Icon,
  href,
  linkLabel,
}: {
  title: string;
  value: string | number;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  linkLabel?: string;
}) => (
  <div className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between gap-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
        <div className="text-3xl font-extrabold text-foreground mt-2">
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{helper}</p>
      </div>
      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
    </div>
    {href && linkLabel && (
      <Link
        href={href}
        className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        {linkLabel}
        <ArrowRight className="w-3 h-3" />
      </Link>
    )}
  </div>
);

export function DashboardPageClient() {
  const t = useTranslations("admin.dashboard");
  const { stats, isPending } = useDashboardStats();
  const [pageState, dispatch] = useReducer(
    (state: { isMounted: boolean; showSplash: boolean }, action: Partial<{ isMounted: boolean; showSplash: boolean }>) => ({ ...state, ...action }),
    { isMounted: false, showSplash: true }
  );

  useEffect(() => {
    const hasShownSplash = sessionStorage.getItem("adminSplashShown");
    if (hasShownSplash) {
      dispatch({ isMounted: true, showSplash: false });
    } else {
      dispatch({ isMounted: true });
      const timer = setTimeout(() => {
        dispatch({ isMounted: true, showSplash: false });
        sessionStorage.setItem("adminSplashShown", "true");
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!pageState.isMounted || isPending || pageState.showSplash) {
    return <AdminLoading />;
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

  const coverageHelper = stats?.coveragePercent != null
    ? t("coverageHelper", { percent: stats.coveragePercent })
    : t("noCoverage");

  const { entitlementTier } = useSubscription();

  return (
    <div className="space-y-6 animate-in fade-in">
      <UpgradeModal entitlementTier={entitlementTier} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("overview")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t("monthlyPlanning")}
          value={`${stats?.monthlyPlannedHours ?? 0}h`}
          helper={t("shiftsCount", { count: stats?.totalShifts ?? 0 })}
          icon={Calendar}
          href="/admin/planning"
          linkLabel={t("goToPlanning")}
        />
        <StatCard
          title={t("coverage")}
          value={stats?.coveragePercent != null ? `${stats.coveragePercent}%` : "—"}
          helper={coverageHelper}
          icon={TrendingUp}
          href="/admin/planning"
          linkLabel={t("goToPlanning")}
        />
        <StatCard
          title={t("pendingRequests")}
          value={stats?.pendingRequests ?? 0}
          helper={pendingHelper}
          icon={stats && stats.pendingRequests > 0 ? AlertTriangle : CheckCircle2}
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
        />
      </div>

      {/* Today's team */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-foreground">
            {t("todayTeam")}
          </h2>
          <span className="text-xs font-medium text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>
        {stats?.todayEmployees && stats.todayEmployees.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.todayEmployees.map((emp: { id: string; firstName: string; lastName: string; jobType: string; startTime: string; endTime: string }) => (
              <div
                key={emp.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/50"
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {emp.firstName[0]}{emp.lastName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {emp.firstName} {emp.lastName}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {emp.startTime} — {emp.endTime}
                  </div>
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {emp.jobType}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noOneToday")}</p>
        )}
      </div>
    </div>
  );
}
