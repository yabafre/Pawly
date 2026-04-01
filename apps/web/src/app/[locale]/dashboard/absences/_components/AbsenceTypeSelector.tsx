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

const ABSENCE_TYPES: { key: string; icon: LucideIcon }[] = [
  { key: "PAID_LEAVE", icon: Plane },
  { key: "SICK_LEAVE", icon: Thermometer },
  { key: "TRAINING", icon: GraduationCap },
  { key: "CHILD_SICK", icon: Baby },
  { key: "OTHER", icon: HelpCircle },
];

interface AbsenceTypeSelectorProps {
  selected: string | null;
  onSelect: (type: string) => void;
}

export function AbsenceTypeSelector({ selected, onSelect }: AbsenceTypeSelectorProps) {
  const t = useTranslations("dashboard.absences.types");

  return (
    <div className="grid grid-cols-2 gap-2">
      {ABSENCE_TYPES.map(({ key, icon: Icon }) => {
        const isSelected = selected === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              "flex items-center gap-2.5 p-3 rounded-2xl border transition-all text-left",
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-border/80",
            )}
            aria-pressed={isSelected}
          >
            <Icon size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
            <span className={cn("text-sm font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>
              {t(key as any)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
