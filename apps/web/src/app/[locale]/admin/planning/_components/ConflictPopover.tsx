"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, AlertTriangle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type ConflictEntry = {
  message: string;
  severity: "blocking" | "warning";
  ruleName?: string;
  category?: string;
};

type Props = {
  conflicts: ConflictEntry[];
  children: React.ReactNode;
};

export function ConflictPopover({ conflicts, children }: Props) {
  const t = useTranslations("admin.scheduleView.conflict");

  if (conflicts.length === 0) return <>{children}</>;

  const hardConflicts = conflicts.filter((c) => c.severity === "blocking");
  const softConflicts = conflicts.filter((c) => c.severity === "warning");

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <h4 className="text-sm font-bold text-neutral-900 mb-3">
          {t("details")}
        </h4>

        {hardConflicts.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertCircle size={14} className="text-[#F97316]" />
              <span className="text-xs font-bold text-[#F97316]">
                {t("hardTitle")}
              </span>
            </div>
            <ul className="space-y-1.5">
              {hardConflicts.map((c, i) => (
                <li
                  key={i}
                  className="text-xs text-neutral-600 bg-orange-50 rounded-lg px-2.5 py-1.5 border border-orange-100"
                >
                  {c.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {softConflicts.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle size={14} className="text-orange-500" />
              <span className="text-xs font-bold text-orange-500">
                {t("softTitle")}
              </span>
            </div>
            <ul className="space-y-1.5">
              {softConflicts.map((c, i) => (
                <li
                  key={i}
                  className="text-xs text-neutral-600 bg-orange-50/50 rounded-lg px-2.5 py-1.5 border border-orange-50"
                >
                  {c.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
