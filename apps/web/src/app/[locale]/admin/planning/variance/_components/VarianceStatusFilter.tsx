"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const FILTERS = [
  { key: undefined, labelKey: "all" },
  { key: "PENDING", labelKey: "pending" },
  { key: "APPROVED", labelKey: "approved" },
  { key: "REJECTED", labelKey: "rejected" },
] as const;

interface VarianceStatusFilterProps {
  selected: string | undefined;
  onSelect: (status: string | undefined) => void;
}

export function VarianceStatusFilter({ selected, onSelect }: VarianceStatusFilterProps) {
  const t = useTranslations("admin.variance.tabs");

  return (
    <div role="group" aria-label={t("all")} className="flex gap-2 overflow-x-auto pb-1">
      {FILTERS.map((filter) => {
        const isActive = selected === filter.key;
        return (
          <button
            key={filter.labelKey}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(filter.key)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap",
              isActive
                ? "bg-foreground text-background shadow-md"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(filter.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
