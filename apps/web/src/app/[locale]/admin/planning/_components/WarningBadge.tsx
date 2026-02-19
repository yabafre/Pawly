"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

type WarningEntry = { message: string; severity: "blocking" | "warning" };

type Props = {
  warnings: WarningEntry[];
};

export function WarningBadge({ warnings }: Props) {
  const t = useTranslations("admin.scheduleView.conflict");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (warnings.length === 0) return null;

  return (
    <div ref={ref} className="absolute bottom-0 right-0 z-20">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-center w-5 h-5 rounded-full bg-orange-400 text-white shadow-sm hover:bg-orange-500 transition-colors"
        aria-label={t("softCount", { count: warnings.length })}
      >
        <AlertTriangle size={10} strokeWidth={2.5} />
      </button>

      {open && (
        <div className="absolute bottom-6 right-0 w-56 bg-white rounded-xl border border-neutral-200 shadow-lg p-3 space-y-2">
          <p className="text-xs font-bold text-orange-500">
            {t("softTitle")} ({warnings.length})
          </p>
          {warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-neutral-600 leading-snug">
              {w.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
