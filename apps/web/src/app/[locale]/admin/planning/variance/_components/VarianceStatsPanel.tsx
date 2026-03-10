"use client";

import { useTranslations } from "next-intl";
import { LazyMotion, m, domAnimation } from "motion/react";
import { BarChart3, Clock, AlertTriangle, UserX } from "lucide-react";

interface VarianceStats {
  countByType: Array<{ type: string; _count: { id: number }; _avg: { deltaMinutes: number | null } }>;
  countByStatus: Array<{ status: string; _count: { id: number } }>;
  totals: {
    _count: { id: number };
    _sum: { deltaMinutes: number | null };
    _avg: { deltaMinutes: number | null };
  };
}

interface VarianceStatsPanelProps {
  stats: VarianceStats | null;
  isPending: boolean;
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 30 },
  },
};

export function VarianceStatsPanel({ stats, isPending }: VarianceStatsPanelProps) {
  const t = useTranslations("admin.variance.stats");

  const totalEvents = stats?.totals._count.id ?? 0;
  const pendingCount =
    stats?.countByStatus.find((s) => s.status === "PENDING")?._count.id ?? 0;
  const avgDelta = stats?.totals._avg.deltaMinutes
    ? Math.round(stats.totals._avg.deltaMinutes)
    : 0;
  const noShowCount =
    stats?.countByType.find((entry) => entry.type === "NO_SHOW")?._count.id ?? 0;

  const cards = [
    {
      label: t("totalEvents"),
      value: totalEvents,
      icon: BarChart3,
      color: "bg-blue-100 text-blue-700",
    },
    {
      label: t("pendingCount"),
      value: pendingCount,
      icon: Clock,
      color: "bg-orange-100 text-orange-700",
    },
    {
      label: t("avgDelta"),
      value: t("minutes", { count: avgDelta }),
      icon: AlertTriangle,
      color: "bg-amber-100 text-amber-700",
    },
    {
      label: t("noShowCount"),
      value: noShowCount,
      icon: UserX,
      color: "bg-rose-100 text-rose-700",
    },
  ];

  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-3xl bg-neutral-100 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className="grid grid-cols-1 gap-4 md:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {cards.map((card) => (
          <m.div
            key={card.label}
            variants={cardVariants}
            className="bg-white rounded-3xl border border-neutral-200 p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.color}`}
              >
                <card.icon size={18} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-neutral-900">
                  {card.value}
                </p>
                <p className="text-xs text-neutral-500 font-medium">
                  {card.label}
                </p>
              </div>
            </div>
          </m.div>
        ))}
      </m.div>
    </LazyMotion>
  );
}
