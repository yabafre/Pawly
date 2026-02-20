"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Calendar, Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { TemplateSlotForm } from "./TemplateSlotForm";
import type { ShiftTypeRecord } from "@/app/[locale]/admin/settings/_hooks/useClinicShiftTypes";

type TemplateSlot = {
  shiftTypeCode: string;
  requiredStaff: number;
  requiredJobTypes?: string[];
};

type TemplateDay = {
  dayOfWeek: number;
  slots: TemplateSlot[];
};

type TemplateData = {
  days: TemplateDay[];
};

type TemplateRecord = {
  id: string;
  name: string;
  data: TemplateData;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateRecord | null;
  shiftTypes: ShiftTypeRecord[];
  workDays?: number[];
  onSave: (name: string, data: TemplateData) => void;
  isSaving: boolean;
};

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type DayEditorProps = {
  dayLabel: string;
  isOpen: boolean;
  isNonWorkDay: boolean;
  slots: TemplateSlot[];
  shiftTypes: ShiftTypeRecord[];
  onToggle: () => void;
  onAddSlot: () => void;
  onUpdateSlot: (slotIdx: number, updatedSlot: TemplateSlot) => void;
  onRemoveSlot: (slotIdx: number) => void;
};

function DayEditor({
  dayLabel,
  isOpen,
  isNonWorkDay,
  slots,
  shiftTypes,
  onToggle,
  onAddSlot,
  onUpdateSlot,
  onRemoveSlot,
}: DayEditorProps) {
  const t = useTranslations("admin.planningTemplates");
  const isWorked = slots.length > 0;

  return (
    <div
      className={`transition-all duration-300 border border-neutral-100 overflow-hidden ${
        isOpen
          ? "bg-neutral-50 rounded-2xl shadow-sm my-4"
          : "bg-white rounded-xl my-2 hover:border-neutral-200"
      }`}
    >
      <div
        onClick={onToggle}
        className="flex items-center justify-between p-4 cursor-pointer"
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isOpen ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-400"
            }`}
          >
            <Calendar size={14} />
          </div>

          <span className={`font-bold text-sm ${isOpen ? "text-neutral-900" : "text-neutral-600"}`}>
            {dayLabel}
          </span>

          {isNonWorkDay && !isWorked && (
            <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-2 py-1 rounded-full uppercase tracking-wide">
              {t("nonWorkDay")}
            </span>
          )}

          {!isNonWorkDay && !isWorked && (
            <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-2 py-1 rounded-full uppercase tracking-wide">
              {t("preview.noSlots")}
            </span>
          )}

          {isWorked && !isOpen && (
            <span className="text-[10px] font-bold text-[#009588] bg-[#009588]/10 px-2 py-1 rounded-full uppercase tracking-wide">
              {t("card.slotsCount", { count: slots.length })}
            </span>
          )}
        </div>

        <ChevronDown
          size={16}
          className={`text-neutral-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {isOpen && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
          {isNonWorkDay && slots.length === 0 ? (
            <div className="text-center py-8 border-t border-neutral-200 border-dashed mt-2">
              <p className="text-xs text-neutral-400 mb-4">{t("nonWorkDay")}</p>
              <button
                type="button"
                onClick={onAddSlot}
                className="px-4 py-2 bg-white border border-neutral-200 text-neutral-900 text-xs font-bold rounded-xl hover:bg-neutral-50 transition-colors shadow-sm"
              >
                {t("slot.addSlot")}
              </button>
            </div>
          ) : (
            <div className="space-y-3 mt-2">
              {slots.length > 0 && (
                <div className="grid grid-cols-[minmax(0,1fr)_112px] items-center gap-3 px-2 mb-1">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                    {t("slot.shiftType")}
                  </span>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest text-center whitespace-nowrap">
                    {t("slot.requiredStaff")}
                  </span>
                </div>
              )}

              {slots.map((slot, idx) => (
                <TemplateSlotForm
                  key={`${dayLabel}-${idx}`}
                  slot={slot}
                  shiftTypes={shiftTypes}
                  onUpdate={(updatedSlot) => onUpdateSlot(idx, updatedSlot)}
                  onRemove={() => onRemoveSlot(idx)}
                />
              ))}

              <button
                type="button"
                onClick={onAddSlot}
                className="w-full py-3 border border-dashed border-neutral-300 rounded-xl flex items-center justify-center gap-2 text-neutral-400 hover:text-[#009588] hover:border-[#009588] hover:bg-[#009588]/5 transition-all group mt-4"
              >
                <Plus size={16} className="group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">{t("slot.addSlot")}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TemplateEditor({
  open,
  onOpenChange,
  template,
  shiftTypes,
  workDays,
  onSave,
  isSaving,
}: Props) {
  const t = useTranslations("admin.planningTemplates");
  const isEditing = !!template;

  const [name, setName] = useState(template?.name ?? "");
  const [days, setDays] = useState<TemplateDay[]>(() => {
    if (template?.data?.days) return [...template.data.days];
    return [];
  });
  const [expandedDay, setExpandedDay] = useState<(typeof DAY_KEYS)[number] | null>("monday");

  const resetForm = useCallback(() => {
    setName(template?.name ?? "");
    setDays(template?.data?.days ? [...template.data.days] : []);
    setExpandedDay("monday");
  }, [template]);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  const getDaySlots = (dayOfWeek: number): TemplateSlot[] => {
    return days.find((d) => d.dayOfWeek === dayOfWeek)?.slots ?? [];
  };

  const updateDaySlots = (dayOfWeek: number, slots: TemplateSlot[]) => {
    setDays((prev) => {
      const existing = prev.find((d) => d.dayOfWeek === dayOfWeek);
      if (existing) {
        return prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, slots } : d));
      }
      if (slots.length === 0) return prev;
      return [...prev, { dayOfWeek, slots }];
    });
  };

  const addSlot = (dayOfWeek: number) => {
    const currentSlots = getDaySlots(dayOfWeek);
    const defaultCode = shiftTypes[0]?.code ?? "";
    updateDaySlots(dayOfWeek, [
      ...currentSlots,
      { shiftTypeCode: defaultCode, requiredStaff: 1 },
    ]);
  };

  const updateSlot = (dayOfWeek: number, slotIdx: number, updatedSlot: TemplateSlot) => {
    const currentSlots = getDaySlots(dayOfWeek);
    updateDaySlots(
      dayOfWeek,
      currentSlots.map((slot, idx) => (idx === slotIdx ? updatedSlot : slot)),
    );
  };

  const removeSlot = (dayOfWeek: number, slotIdx: number) => {
    const currentSlots = getDaySlots(dayOfWeek);
    const newSlots = currentSlots.filter((_, i) => i !== slotIdx);
    if (newSlots.length === 0) {
      setDays((prev) => prev.filter((d) => d.dayOfWeek !== dayOfWeek));
    } else {
      updateDaySlots(dayOfWeek, newSlots);
    }
  };

  const isNonWorkDay = (dayOfWeek: number) => {
    if (!workDays) return false;
    return !workDays.includes(dayOfWeek);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const cleanDays = days.filter((d) => d.slots.length > 0);
    onSave(name.trim(), { days: cleanDays });
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-none md:w-[640px] xl:w-[700px] p-0 flex flex-col gap-0 border-l border-neutral-200 shadow-2xl"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Template Editor</SheetTitle>
          <SheetDescription>Planning template editor panel</SheetDescription>
        </SheetHeader>

        <div className="px-6 py-5 border-b border-neutral-100 flex justify-between items-start bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 mb-1">
              {isEditing ? t("form.editTitle") : t("form.createTitle")}
            </h2>
            <p className="text-xs text-neutral-500">{t("form.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-[#FAFAFA]">
          <div className="mb-8">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2 block">
              {t("form.name")}
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("form.namePlaceholder")}
              className="w-full bg-white border border-neutral-200 rounded-xl py-4 px-4 text-sm font-medium text-neutral-900 focus-visible:outline-none focus-visible:border-[#009588] focus-visible:ring-4 focus-visible:ring-[#009588]/10 transition-all shadow-sm h-12"
              aria-invalid={!name.trim() && name.length > 0}
              aria-describedby={!name.trim() && name.length > 0 ? "template-name-error" : undefined}
            />
            {!name.trim() && name.length > 0 && (
              <p id="template-name-error" className="sr-only" role="alert">
                {t("form.nameRequired")}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="h-px bg-neutral-200 flex-1" />
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest bg-[#FAFAFA] px-2">
              {t("preview.title")}
            </span>
            <div className="h-px bg-neutral-200 flex-1" />
          </div>

          <div className="space-y-2">
            {DAY_KEYS.map((dayKey, idx) => {
              const dayOfWeek = idx + 1;
              const slots = getDaySlots(dayOfWeek);

              return (
                <DayEditor
                  key={dayKey}
                  dayLabel={t(`days.${dayKey}`)}
                  isOpen={expandedDay === dayKey}
                  isNonWorkDay={isNonWorkDay(dayOfWeek)}
                  slots={slots}
                  shiftTypes={shiftTypes}
                  onToggle={() => setExpandedDay(expandedDay === dayKey ? null : dayKey)}
                  onAddSlot={() => addSlot(dayOfWeek)}
                  onUpdateSlot={(slotIdx, updatedSlot) => updateSlot(dayOfWeek, slotIdx, updatedSlot)}
                  onRemoveSlot={(slotIdx) => removeSlot(dayOfWeek, slotIdx)}
                />
              );
            })}
          </div>
        </div>

        <div className="p-5 border-t border-neutral-100 bg-white flex justify-between items-center gap-4">
          <div className="flex gap-3 flex-1 justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-11 px-5 border border-neutral-200 text-neutral-600 font-bold rounded-xl text-sm hover:bg-neutral-50 cursor-pointer"
            >
              {t("form.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim() || isSaving}
              className="h-11 px-6 bg-[#171717] text-white font-bold rounded-xl text-sm hover:bg-neutral-900 shadow-lg shadow-neutral-900/10 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {t("form.save")}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
