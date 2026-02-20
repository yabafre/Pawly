"use client";

import { useTranslations } from "next-intl";

type Props = {
  date: string;
  isClosed: boolean;
  rowIndex?: number;
  colIndex?: number;
  tabIndex?: number;
};

export function ClosedDayColumn({ date, isClosed, rowIndex, colIndex, tabIndex = -1 }: Props) {
  const t = useTranslations("admin.scheduleView.grid");

  return (
    <div
      role="gridcell"
      tabIndex={tabIndex}
      data-row={rowIndex}
      data-col={colIndex}
      aria-disabled="true"
      className="border-b border-neutral-100 min-h-[48px] outline-none focus:ring-2 focus:ring-teal-500 focus:ring-inset"
      style={{
        background:
          "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.04) 4px, rgba(0,0,0,0.04) 8px)",
      }}
    >
      <div className="flex items-center justify-center h-full p-2">
        <span className="text-[10px] font-semibold text-neutral-400">
          {isClosed ? t("closedDay") : t("nonWorkDay")}
        </span>
      </div>
    </div>
  );
}
