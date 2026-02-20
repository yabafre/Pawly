"use client";

import { useTranslations } from "next-intl";
import { Plane, Thermometer, GraduationCap, CircleMinus } from "lucide-react";

const ABSENCE_STYLES: Record<
  string,
  { bg: string; border: string; text: string; Icon: typeof Plane }
> = {
  VACATION: {
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    text: "text-emerald-700",
    Icon: Plane,
  },
  SICK: {
    bg: "bg-rose-50",
    border: "border-rose-100",
    text: "text-rose-700",
    Icon: Thermometer,
  },
  SCHOOL: {
    bg: "bg-purple-50",
    border: "border-purple-100",
    text: "text-purple-700",
    Icon: GraduationCap,
  },
  OTHER: {
    bg: "bg-neutral-50",
    border: "border-neutral-100",
    text: "text-neutral-400",
    Icon: CircleMinus,
  },
};

type Props = {
  type: "VACATION" | "SICK" | "SCHOOL" | "OTHER";
  reason?: string;
};

export function AbsenceCell({ type, reason }: Props) {
  const t = useTranslations("admin.scheduleView.absence");
  const style = ABSENCE_STYLES[type] || ABSENCE_STYLES.OTHER;
  const { bg, border, text, Icon } = style;

  const typeLabels: Record<string, string> = {
    VACATION: t("vacation"),
    SICK: t("sick"),
    SCHOOL: t("school"),
    OTHER: t("other"),
  };

  return (
    <div
      className={`h-full min-h-[48px] rounded-lg border ${bg} ${border} flex flex-col items-center justify-center gap-1 px-2 py-1.5`}
      title={reason || typeLabels[type]}
    >
      <Icon size={16} className={text} />
      <span className={`text-[10px] font-semibold ${text}`}>
        {typeLabels[type]}
      </span>
    </div>
  );
}
