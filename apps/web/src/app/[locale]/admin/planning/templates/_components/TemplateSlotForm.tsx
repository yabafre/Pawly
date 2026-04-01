"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import type { ShiftTypeRecord } from "@/app/[locale]/admin/settings/_hooks/useClinicShiftTypes";

const JOB_TYPES = ["VET", "ASV", "APPRENTICE"] as const;

type TemplateSlot = {
  shiftTypeCode: string;
  requiredStaff: number;
  requiredJobTypes?: string[];
};

type Props = {
  slot: TemplateSlot;
  shiftTypes: ShiftTypeRecord[];
  onUpdate: (slot: TemplateSlot) => void;
  onRemove: () => void;
};

export function TemplateSlotForm({ slot, shiftTypes, onUpdate, onRemove }: Props) {
  const t = useTranslations("admin.planningTemplates.slot");

  const currentShiftType = shiftTypes.find((st) => st.code === slot.shiftTypeCode);
  const shiftColor = currentShiftType?.color ?? "#a3a3a3";

  const toggleJobType = (jt: string) => {
    const current = slot.requiredJobTypes ?? [];
    const updated = current.includes(jt)
      ? current.filter((j) => j !== jt)
      : [...current, jt];
    onUpdate({ ...slot, requiredJobTypes: updated.length > 0 ? updated : undefined });
  };

  return (
    <div className="group/slot flex items-center gap-2 p-3 bg-card border border-border rounded-xl shadow-sm mb-2 last:mb-0">
      <div className="flex flex-1 items-end justify-between gap-4 min-w-0">
        <div className="min-w-0 flex-1">
          <Label className="sr-only">{t("shiftType")}</Label>
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: shiftColor }} />

            <Select
              value={slot.shiftTypeCode}
              onValueChange={(value) => onUpdate({ ...slot, shiftTypeCode: value })}
            >
              <SelectTrigger
                aria-label={t("shiftType")}
                className="h-10 max-w-[220px] rounded-2xl border-border bg-muted px-3 text-sm font-medium transition-all focus:border-primary focus:ring-1 focus:ring-ring/20"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                sideOffset={6}
                className="z-[80] rounded-2xl"
              >
                {shiftTypes.map((st) => (
                  <SelectItem key={st.code} value={st.code}>
                    {st.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-end gap-3 shrink-0">
          <div>
            <Label className="sr-only">{t("requiredStaff")}</Label>
            <Input
              type="number"
              min={1}
              value={slot.requiredStaff}
              onChange={(e) =>
                onUpdate({ ...slot, requiredStaff: Math.max(1, parseInt(e.target.value) || 1) })
              }
              aria-label={t("requiredStaff")}
              className="h-8 w-16 rounded-xl border-border bg-muted text-center text-sm leading-none font-bold transition-all focus:border-primary focus:bg-card focus:ring-1 focus:ring-ring/20"
            />
          </div>

          <div>
            <Label className="sr-only">{t("requiredJobTypes")}</Label>
            <div className="flex gap-2">
              {JOB_TYPES.map((jt) => {
                const isSelected = slot.requiredJobTypes?.includes(jt);
                return (
                  <button
                    key={jt}
                    type="button"
                    onClick={() => toggleJobType(jt)}
                    className={`h-8 rounded-xl px-2.5 text-[11px] font-bold tracking-wide transition-all ${
                      isSelected
                        ? "text-white shadow-[0_1px_6px_rgba(0,149,136,0.28)]"
                        : "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground"
                    }`}
                    style={isSelected ? { backgroundColor: shiftColor } : undefined}
                    aria-label={`${t("requiredJobTypes")} ${jt}`}
                  >
                    {jt}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={t("removeSlot")}
        className="shrink-0 h-7 w-7 rounded-lg text-muted-foreground opacity-0 transition-all group-hover/slot:opacity-100 hover:bg-destructive/5 hover:text-destructive"
      >
        <X className="h-3.5 w-3.5 mx-auto" />
      </button>
    </div>
  );
}
