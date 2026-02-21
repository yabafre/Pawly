"use client";

import { useMemo, useState, useCallback, useRef, useId } from "react";
import { useTranslations } from "next-intl";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { EquitySummaryEntry } from "@pawly/validators";

type Props = {
  entry: EquitySummaryEntry;
};

export function EmployeeEquityBadge({ entry }: Props) {
  const t = useTranslations("admin.equity");
  const [showPopover, setShowPopover] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setShowPopover(false);
    }
  }, []);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget)) {
      setShowPopover(false);
    }
  }, []);

  const status = useMemo(() => {
    let aboveCount = 0;
    let belowCount = 0;
    for (const counter of entry.counters) {
      if (counter.count > counter.clinicAverage) aboveCount++;
      if (counter.count < counter.clinicAverage) belowCount++;
    }
    if (aboveCount > 0) return "above" as const;
    if (belowCount > 0) return "below" as const;
    return "average" as const;
  }, [entry.counters]);

  if (entry.counters.length === 0) return null;

  const Icon = status === "above" ? TrendingUp : status === "below" ? TrendingDown : Minus;
  const colorClass =
    status === "above"
      ? "text-orange-500"
      : status === "below"
        ? "text-teal-500"
        : "text-neutral-400";

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <button
        type="button"
        className={`inline-flex items-center ${colorClass}`}
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => setShowPopover(false)}
        onClick={() => setShowPopover((p) => !p)}
        aria-label={t("badgeLabel")}
        aria-expanded={showPopover}
        aria-controls={showPopover ? popoverId : undefined}
      >
        <Icon size={12} strokeWidth={2} />
      </button>

      {showPopover && (
        <div
          id={popoverId}
          role="tooltip"
          className="fixed left-auto z-50 w-52 bg-white rounded-xl border border-neutral-100 shadow-lg p-3 text-xs"
          style={{
            top: containerRef.current
              ? containerRef.current.getBoundingClientRect().top +
                containerRef.current.getBoundingClientRect().height / 2
              : 0,
            left: containerRef.current
              ? containerRef.current.getBoundingClientRect().right + 8
              : 0,
            transform: "translateY(-50%)",
          }}
        >
          <p className="font-semibold text-neutral-900 mb-2">{t("popoverTitle")}</p>
          {entry.counters.map((c) => {
            const threshold = (c as { maxPerPeriod?: number }).maxPerPeriod;
            const displayMax = threshold ?? c.clinicAverage;
            return (
              <div key={c.counterType} className="flex items-center justify-between py-1">
                <span className="text-neutral-600">{t(`counterType.${c.counterType}`)}</span>
                <span className={c.count > displayMax ? "font-bold text-orange-600" : "text-neutral-500"}>
                  {c.count} / {displayMax}
                </span>
              </div>
            );
          })}
          <p className="text-neutral-400 mt-1 text-[10px]">{t("popoverHint")}</p>
        </div>
      )}
    </div>
  );
}
