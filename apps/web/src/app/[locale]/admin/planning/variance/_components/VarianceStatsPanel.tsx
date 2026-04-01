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
  const avgDeltaRaw = stats?.totals._avg.deltaMinutes
    ? Math.round(Number(stats.totals._avg.deltaMinutes))
    : 0;
  const noShowCount =
    stats?.countByType.find((entry) => entry.type === "NO_SHOW")?._count.id ?? 0;

  const formatDelta = (minutes: number) => {
    if (minutes === 0) return "0 min";
    const h = Math.floor(Math.abs(minutes) / 60);
    const m = Math.abs(minutes) % 60;
    const sign = minutes < 0 ? "-" : "";
    if (h === 0) return `${sign}${m} min`;
    if (m === 0) return `${sign}${h}h`;
    return `${sign}${h}h ${m}min`;
  };

  const cards = [
    { label: t("totalEvents"), value: totalEvents, icon: BarChart3 },
    { label: t("pendingCount"), value: pendingCount, icon: Clock },
    { label: t("avgDelta"), value: formatDelta(avgDeltaRaw), icon: AlertTriangle },
    { label: t("noShowCount"), value: noShowCount, icon: UserX },
  ];

  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
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
            className="bg-card rounded-2xl border border-border p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-muted text-muted-foreground"
              >
                <card.icon size={18} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-foreground">
                  {card.value}
                </p>
                <p className="text-xs text-muted-foreground font-medium">
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
