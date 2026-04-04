"use client";

import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

type ConflictEntry = { message: string; severity: "blocking" | "warning" };

type Props = {
  conflicts: ConflictEntry[];
};

export function ConflictIndicator({ conflicts }: Props) {
  const t = useTranslations("admin.scheduleView.conflict");

  if (conflicts.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute top-0 right-0 z-20 flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white shadow-sm hover:bg-orange-600 transition-colors"
          aria-label={t("hardCount", { count: conflicts.length })}
        >
          <AlertCircle size={12} strokeWidth={2.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-2" side="bottom" align="end">
        <p className="text-xs font-bold text-orange-500">
          {t("hardTitle")} ({conflicts.length})
        </p>
        {conflicts.map((c, i) => (
          <p key={i} className="text-[11px] text-muted-foreground leading-snug">
            {c.message}
          </p>
        ))}
      </PopoverContent>
    </Popover>
  );
}
