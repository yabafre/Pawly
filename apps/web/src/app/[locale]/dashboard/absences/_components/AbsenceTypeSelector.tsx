"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  Plane,
  Thermometer,
  GraduationCap,
  Baby,
  HelpCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type AbsenceTypeConfig = {
  key: string;
  icon: LucideIcon;
  colorClass: string;
  selectedBg: string;
  selectedBorder: string;
};

const ABSENCE_TYPE_CONFIG: AbsenceTypeConfig[] = [
  {
    key: "PAID_LEAVE",
    icon: Plane,
    colorClass: "text-emerald-600",
    selectedBg: "bg-emerald-50",
    selectedBorder: "border-emerald-300",
  },
  {
    key: "SICK_LEAVE",
    icon: Thermometer,
    colorClass: "text-rose-600",
    selectedBg: "bg-rose-50",
    selectedBorder: "border-rose-300",
  },
  {
    key: "TRAINING",
    icon: GraduationCap,
    colorClass: "text-neutral-600",
    selectedBg: "bg-neutral-50",
    selectedBorder: "border-neutral-400",
  },
  {
    key: "CHILD_SICK",
    icon: Baby,
    colorClass: "text-blue-600",
    selectedBg: "bg-blue-50",
    selectedBorder: "border-blue-300",
  },
  {
    key: "OTHER",
    icon: HelpCircle,
    colorClass: "text-neutral-500",
    selectedBg: "bg-neutral-50",
    selectedBorder: "border-neutral-400",
  },
];

interface AbsenceTypeSelectorProps {
  selected: string | null;
  onSelect: (type: string) => void;
}

export function AbsenceTypeSelector({
  selected,
  onSelect,
}: AbsenceTypeSelectorProps) {
  const t = useTranslations("dashboard.absences.types");

  return (
    <div className="grid grid-cols-2 gap-3">
      {ABSENCE_TYPE_CONFIG.map((config) => {
        const isSelected = selected === config.key;
        const Icon = config.icon;
        return (
          <button
            key={config.key}
            type="button"
            onClick={() => onSelect(config.key)}
            className={cn(
              "flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left min-h-[56px]",
              isSelected
                ? `${config.selectedBg} ${config.selectedBorder} shadow-sm`
                : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm"
            )}
            aria-pressed={isSelected}
            aria-label={t(config.key as any)}
          >
            <Icon size={20} className={config.colorClass} />
            <span
              className={cn(
                "text-sm font-semibold",
                isSelected ? "text-neutral-900" : "text-neutral-600"
              )}
            >
              {t(config.key as any)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
