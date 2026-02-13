"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
    <div className="group/slot relative flex items-stretch gap-0 rounded-xl border border-neutral-100 bg-white overflow-hidden transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:border-neutral-200">
      {/* Color indicator bar */}
      <div
        className="w-1.5 shrink-0"
        style={{ backgroundColor: shiftColor }}
      />

      {/* Slot content */}
      <div className="flex flex-1 items-center gap-3 px-3 py-2.5">
        {/* Shift type select */}
        <div className="flex-1 min-w-0 space-y-1">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            {t("shiftType")}
          </Label>
          <Select
            value={slot.shiftTypeCode}
            onValueChange={(value) => onUpdate({ ...slot, shiftTypeCode: value })}
          >
            <SelectTrigger className="h-9 rounded-lg border-neutral-200 bg-neutral-50/50 text-xs font-medium focus:ring-1 focus:ring-[#009588]/20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {shiftTypes.map((st) => (
                <SelectItem key={st.code} value={st.code}>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full ring-1 ring-black/5"
                      style={{ backgroundColor: st.color }}
                    />
                    <span className="text-xs font-medium">{st.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Staff count */}
        <div className="w-[72px] shrink-0 space-y-1">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            {t("requiredStaff")}
          </Label>
          <Input
            type="number"
            min={1}
            value={slot.requiredStaff}
            onChange={(e) =>
              onUpdate({ ...slot, requiredStaff: Math.max(1, parseInt(e.target.value) || 1) })
            }
            className="h-9 rounded-lg border-neutral-200 bg-neutral-50/50 text-xs text-center font-bold focus-visible:ring-[#009588]/20"
          />
        </div>

        {/* Job type toggles — compact inline */}
        <div className="shrink-0 space-y-1">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            {t("requiredJobTypes")}
          </Label>
          <div className="flex gap-1">
            {JOB_TYPES.map((jt) => {
              const isSelected = slot.requiredJobTypes?.includes(jt);
              return (
                <button
                  key={jt}
                  type="button"
                  onClick={() => toggleJobType(jt)}
                  className={`h-9 rounded-lg px-2.5 text-[10px] font-bold tracking-tight transition-all border ${
                    isSelected
                      ? "border-transparent text-white shadow-sm"
                      : "border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600"
                  }`}
                  style={isSelected ? { backgroundColor: shiftColor } : undefined}
                >
                  {jt}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Remove button */}
      <div className="flex items-center pr-2 pl-1 border-l border-neutral-50">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-neutral-300 transition-all hover:bg-red-50 hover:text-red-500"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
