"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";

type ConflictEntry = { message: string; severity: "blocking" | "warning" };

type Props = {
  conflicts: ConflictEntry[];
};

export function ConflictIndicator({ conflicts }: Props) {
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

  if (conflicts.length === 0) return null;

  return (
    <div ref={ref} className="absolute top-0 right-0 z-20">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white shadow-sm hover:bg-rose-600 transition-colors"
        aria-label={t("hardCount", { count: conflicts.length })}
      >
        <AlertCircle size={12} strokeWidth={2.5} />
      </button>

      {open && (
        <div className="absolute top-6 right-0 w-56 bg-white rounded-xl border border-neutral-200 shadow-lg p-3 space-y-2">
          <p className="text-xs font-bold text-rose-600">
            {t("hardTitle")} ({conflicts.length})
          </p>
          {conflicts.map((c, i) => (
            <p key={i} className="text-[11px] text-neutral-600 leading-snug">
              {c.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
