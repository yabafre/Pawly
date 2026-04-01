"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar, Users, Sparkles, Pencil, Trash2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useScheduleView } from "../_hooks/useScheduleView";
import type { GenerationResult } from "@pawly/validators";
import type { ShiftData } from "@pawly/types";

type Props = {
  shifts: ShiftData[];
  isLoading: boolean;
  month: string;
  onDeleteGenerated?: () => void;
  isDeleting?: boolean;
  isGenerating?: boolean;
  generationResult?: GenerationResult | null;
};

export function MonthShiftsSummary({
  shifts,
  isLoading,
  month,
  onDeleteGenerated,
  isDeleting,
  isGenerating,
  generationResult,
}: Props) {
  const t = useTranslations("admin.planningGeneration.existing");
  const { scheduleData } = useScheduleView(month);

  if (isLoading || shifts.length === 0) return null;

  const generated = shifts.filter((s) => s.source === "GENERATED");
  const manual = shifts.filter((s) => s.source === "MANUAL");

  // Group by date
  const dateMap = new Map<string, ShiftData[]>();
  for (const shift of shifts) {
    const dateStr =
      typeof shift.date === "string"
        ? shift.date.slice(0, 10)
        : new Date(shift.date).toISOString().slice(0, 10);
    const existing = dateMap.get(dateStr) || [];
    existing.push(shift);
    dateMap.set(dateStr, existing);
  }

  // Group by shift type
  const typeMap = new Map<string, number>();
  for (const shift of shifts) {
    typeMap.set(shift.shiftTypeCode, (typeMap.get(shift.shiftTypeCode) || 0) + 1);
  }

  // Unique employees
  const uniqueEmployees = new Set(
    shifts.filter((s) => s.employee).map((s) => s.employee!.id),
  );

  // Use generation result violations (complete) when available, fallback to schedule view
  const hardViolations = generationResult?.violations?.hard ?? scheduleData?.violations?.hard ?? [];
  const softViolations = generationResult?.violations?.soft ?? scheduleData?.violations?.soft ?? [];
  const totalWarnings = hardViolations.length + softViolations.length;

  return (
    <div className="bg-card rounded-2xl border border-border p-6 animate-in fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {t("title")}
        </h3>
        <div className="flex items-center gap-2">
          {totalWarnings > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-orange-600 border-orange-200 hover:bg-orange-50 text-xs"
                >
                  <AlertTriangle size={12} className="mr-1.5" />
                  {totalWarnings} {t("warnings")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-orange-500" />
                    {t("warningsTitle")} ({totalWarnings})
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-2 mt-2">
                  {hardViolations.map((v, i) => (
                    <div
                      key={`hard-${i}`}
                      className="flex items-start gap-3 rounded-xl bg-destructive/5 px-4 py-2.5 text-sm"
                    >
                      <XCircle size={14} className="text-destructive mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium text-foreground">
                          {v.ruleName}
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {v.message}
                        </p>
                      </div>
                    </div>
                  ))}
                  {softViolations.map((v, i) => (
                    <div
                      key={`soft-${i}`}
                      className="flex items-start gap-3 rounded-xl bg-orange-50/50 px-4 py-2.5 text-sm"
                    >
                      <AlertTriangle size={14} className="text-orange-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium text-foreground">
                          {v.ruleName}
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {v.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}
          {generated.length > 0 && onDeleteGenerated && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDeleteGenerated}
              disabled={isDeleting || isGenerating}
              className="text-destructive border-destructive/20 hover:bg-destructive/5 hover:text-destructive text-xs"
            >
              <Trash2 size={12} className="mr-1.5" />
              {t("deleteGenerated")}
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <MiniStat
          icon={<Calendar size={14} className="text-blue-500" />}
          label={t("totalShifts")}
          value={shifts.length}
        />
        <MiniStat
          icon={<Sparkles size={14} className="text-yellow-500" />}
          label={t("generated")}
          value={generated.length}
        />
        <MiniStat
          icon={<Pencil size={14} className="text-violet-500" />}
          label={t("manual")}
          value={manual.length}
        />
        <MiniStat
          icon={<Users size={14} className="text-emerald-500" />}
          label={t("employees")}
          value={uniqueEmployees.size}
        />
      </div>

      {/* Shift types breakdown */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Array.from(typeMap.entries()).map(([code, count]) => (
          <Badge
            key={code}
            variant="outline"
            className="text-xs font-medium px-2.5 py-1"
          >
            {code} &mdash; {count}
          </Badge>
        ))}
      </div>

      {/* Days breakdown (compact) */}
      <div className="text-xs text-muted-foreground">
        {t("daysWithShifts", { count: dateMap.size })}
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-muted/80 px-3 py-2.5">
      {icon}
      <div>
        <div className="text-lg font-extrabold text-foreground leading-none">
          {value}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">
          {label}
        </div>
      </div>
    </div>
  );
}
