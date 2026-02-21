"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

type WarningEntry = {
  message: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  severity: "blocking" | "warning";
};

type Props = {
  warnings: WarningEntry[];
};

export function WarningBadge({ warnings }: Props) {
  const t = useTranslations("admin.scheduleView.conflict");
  const tv = useTranslations("admin");

  if (warnings.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute bottom-0 right-0 z-20 flex items-center justify-center w-5 h-5 rounded-full bg-orange-400 text-white shadow-sm hover:bg-orange-500 transition-colors"
          aria-label={t("softCount", { count: warnings.length })}
        >
          <AlertTriangle size={10} strokeWidth={2.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-2" side="bottom" align="end">
        <p className="text-xs font-bold text-orange-500">
          {t("softTitle")} ({warnings.length})
        </p>
        {warnings.map((w, i) => (
          <p key={i} className="text-[11px] text-neutral-600 leading-snug">
            {w.messageKey ? tv(w.messageKey, w.messageParams) : w.message}
          </p>
        ))}
      </PopoverContent>
    </Popover>
  );
}
