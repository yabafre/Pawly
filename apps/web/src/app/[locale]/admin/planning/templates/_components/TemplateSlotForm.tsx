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
    <div className="group/slot relative flex items-stretch gap-0 rounded-xl border border-neutral-100 bg-white overflow-hidden transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-neutral-200">
      {/* Color indicator bar */}
      <div
        className="w-1 shrink-0"
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
            <SelectTrigger className="h-9 rounded-xl border-neutral-200 bg-neutral-50 text-xs font-medium transition-all focus:border-[#009588] focus:ring-1 focus:ring-[#009588]/20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {shiftTypes.map((st) => (
                <SelectItem key={st.code} value={st.code}>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full ring-1 ring-black/5"
                      style={{ backgroundColor: st.color }}
                    />
                    <span className="text-xs">{st.name}</span>
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
            className="h-9 rounded-xl border-neutral-200 bg-neutral-50 text-xs text-center font-bold transition-all focus:border-[#009588] focus:bg-white focus:ring-1 focus:ring-[#009588]/20"
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
                  className={`h-8 rounded-lg px-2 text-[10px] font-bold tracking-tight transition-all ${
                    isSelected
                      ? "text-white shadow-[0_1px_4px_rgba(0,149,136,0.3)]"
                      : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
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
      <div className="flex items-center pr-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-lg text-neutral-300 opacity-0 transition-all group-hover/slot:opacity-100 hover:bg-red-50 hover:text-red-500"
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
