"use client";

import { useTranslations, useLocale } from "next-intl";
import { useReviewVariance } from "../_hooks/useAdminVariance";
import { VarianceRejectDialog } from "./VarianceRejectDialog";
import { cn } from "@/lib/utils";
import { Clock, AlertCircle, LogOut, Check, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export interface VarianceEventItem {
  id: string;
  type: string;
  status: string;
  plannedTime: string;
  actualTime: string;
  deltaMinutes: number;
  exceptionNote?: string | null;
  shift: {
    shiftTypeCode: string;
    startTime: string;
    endTime: string;
    date: string;
    employee: {
      id: string;
      firstName: string;
      lastName: string;
      jobType: string;
    };
  };
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  CLOCK_IN_DEVIATION: Clock,
  CLOCK_OUT_DEVIATION: Clock,
  NO_SHOW: AlertCircle,
  EARLY_DEPARTURE: LogOut,
};

const TYPE_STYLES: Record<string, string> = {
  CLOCK_IN_DEVIATION: "bg-orange-100 text-orange-700",
  CLOCK_OUT_DEVIATION: "bg-amber-100 text-amber-700",
  NO_SHOW: "bg-rose-100 text-rose-700",
  EARLY_DEPARTURE: "bg-amber-100 text-amber-700",
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-orange-100 text-orange-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

interface VarianceEventListProps {
  events: VarianceEventItem[];
  isPending: boolean;
}

export function VarianceEventList({ events, isPending: isLoading }: VarianceEventListProps) {
  const t = useTranslations("admin.variance");
  const locale = useLocale();
  const { approve, reject, isPending: isReviewing } = useReviewVariance();
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-neutral-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="text-center py-12 text-neutral-400">
        <p className="text-sm">{t("list.empty")}</p>
      </div>
    );
  }

  const handleApprove = (eventId: string) => {
    approve(eventId);
  };

  const handleRejectConfirm = (note: string) => {
    if (!rejectTarget) return;
    reject(rejectTarget, note);
    setRejectTarget(null);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <div className="space-y-3">
        {events.map((event) => {
          const Icon = TYPE_ICONS[event.type] ?? AlertCircle;
          const isPendingStatus = event.status === "PENDING";
          const isNoShow = event.type === "NO_SHOW";

          return (
            <div
              key={event.id}
              className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-neutral-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-900">
                      {event.shift.employee.firstName} {event.shift.employee.lastName}
                      <span className="text-neutral-400 font-normal ml-1">
                        · {event.shift.employee.jobType}
                      </span>
                    </p>
                    <p className="text-sm text-neutral-500">
                      {new Date(event.shift.date).toLocaleDateString(locale, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      · {event.shift.shiftTypeCode} {event.shift.startTime}-{event.shift.endTime}
                    </p>
                    <p className="text-sm text-neutral-600 mt-0.5">
                      {isNoShow ? (
                        t("list.notConfirmed")
                      ) : (
                        <>
                          {t("list.planned")}: {formatTime(event.plannedTime)} →{" "}
                          {t("list.actual")}: {formatTime(event.actualTime)}{" "}
                          · <span className="font-medium">
                            {event.deltaMinutes > 0 ? "+" : ""}
                            {t("list.delta", { minutes: event.deltaMinutes })}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                      TYPE_STYLES[event.type] ?? "bg-neutral-100 text-neutral-600",
                    )}
                  >
                    {t(`types.${event.type}` as any)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                      STATUS_STYLES[event.status] ?? "bg-neutral-100 text-neutral-600",
                    )}
                  >
                    {t(`status.${event.status}` as any)}
                  </span>
                  {isPendingStatus && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(event.id)}
                        disabled={isReviewing}
                        aria-label={`${t("actions.approve")} - ${event.shift.employee.lastName}`}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Check size={14} className="mr-1" />
                        {t("actions.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectTarget(event.id)}
                        disabled={isReviewing}
                        aria-label={`${t("actions.reject")} - ${event.shift.employee.lastName}`}
                        className="rounded-xl border-rose-300 text-rose-600 hover:bg-rose-50"
                      >
                        <X size={14} className="mr-1" />
                        {t("actions.reject")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {event.status === "REJECTED" && event.exceptionNote && (
                <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3">
                  <p className="text-xs font-semibold text-rose-600">
                    {t("list.reason")}
                  </p>
                  <p className="text-sm text-rose-700 mt-1">
                    {event.exceptionNote}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <VarianceRejectDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
      />
    </>
  );
}
