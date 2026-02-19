"use client";

import { useTranslations } from "next-intl";
import { Calendar, Users, Sparkles, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ShiftData = {
  id: string;
  date: Date | string;
  startTime: string;
  endTime: string;
  shiftTypeCode: string;
  source: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    color?: string | null;
    jobType: string;
  } | null;
};

type Props = {
  shifts: ShiftData[];
  isLoading: boolean;
  onDeleteGenerated?: () => void;
  isDeleting?: boolean;
};

export function MonthShiftsSummary({
  shifts,
  isLoading,
  onDeleteGenerated,
  isDeleting,
}: Props) {
  const t = useTranslations("admin.planningGeneration.existing");

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

  return (
    <div className="bg-white rounded-2xl border border-neutral-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 animate-in fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400">
          {t("title")}
        </h3>
        {generated.length > 0 && onDeleteGenerated && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDeleteGenerated}
            disabled={isDeleting}
            className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 text-xs"
          >
            <Trash2 size={12} className="mr-1.5" />
            {t("deleteGenerated")}
          </Button>
        )}
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
      <div className="text-xs text-neutral-400">
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
    <div className="flex items-center gap-2.5 rounded-xl bg-neutral-50/80 px-3 py-2.5">
      {icon}
      <div>
        <div className="text-lg font-extrabold text-neutral-900 leading-none">
          {value}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-0.5">
          {label}
        </div>
      </div>
    </div>
  );
}
