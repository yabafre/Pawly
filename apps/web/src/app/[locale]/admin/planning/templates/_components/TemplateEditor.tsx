"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
import type { TemplateSlot, TemplateDay, TemplateData, EditableTemplate } from "@pawly/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EditableTemplate | null;
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
      className={`transition-all duration-300 border border-border overflow-hidden ${isOpen
        ? "bg-muted rounded-2xl shadow-sm my-4"
        : "bg-card rounded-xl my-2 hover:border-border"
        }`}
    >
      <div
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Space") onToggle();
        }}
        role="button"
        tabIndex={0}
        className="flex items-center justify-between p-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-border"
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isOpen ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              }`}
          >
            <Calendar size={14} />
          </div>

          <span className={`font-bold text-sm ${isOpen ? "text-foreground" : "text-muted-foreground"}`}>
            {dayLabel}
          </span>

          {isNonWorkDay && !isWorked && (
            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-full uppercase tracking-wide">
              {t("nonWorkDay")}
            </span>
          )}

          {!isNonWorkDay && !isWorked && (
            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-full uppercase tracking-wide">
              {t("preview.noSlots")}
            </span>
          )}

          {isWorked && !isOpen && (
            <span className="text-[10px] font-bold text-primary bg-secondary px-2 py-1 rounded-full uppercase tracking-wide">
              {t("card.slotsCount", { count: slots.length })}
            </span>
          )}
        </div>

        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {isOpen && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
          {isNonWorkDay && slots.length === 0 ? (
            <div className="text-center py-8 border-t border-border border-dashed mt-2">
              <p className="text-xs text-muted-foreground mb-4">{t("nonWorkDay")}</p>
              <button
                type="button"
                onClick={onAddSlot}
                className="px-4 py-2 bg-card border border-border text-foreground text-xs font-bold rounded-xl hover:bg-muted transition-colors shadow-sm"
              >
                {t("slot.addSlot")}
              </button>
            </div>
          ) : (
            <div className="space-y-3 mt-2">
              {slots.length > 0 && (
                <div className="grid grid-cols-[minmax(0,1fr)_112px] items-center gap-3 px-2 mb-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {t("slot.shiftType")}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center whitespace-nowrap">
                    {t("slot.requiredStaff")}
                  </span>
                </div>
              )}

              {slots.map((slot, idx) => {
                const stableKey = `slot-${dayLabel}-${idx}`;
                return (
                  <TemplateSlotForm
                    key={stableKey}
                    slot={slot}
                    shiftTypes={shiftTypes}
                    onUpdate={(updatedSlot) => onUpdateSlot(idx, updatedSlot)}
                    onRemove={() => onRemoveSlot(idx)}
                  />
                );
              })}

              <button
                type="button"
                onClick={onAddSlot}
                className="w-full py-3 border border-dashed border-border rounded-xl flex items-center justify-center gap-2 text-muted-foreground hover:text-primary hover:border-primary hover:bg-primary/5 transition-all group mt-4"
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

  const prevOpenRef = useRef(open);
  const prevTemplateRef = useRef(template);

  if (open !== prevOpenRef.current || template !== prevTemplateRef.current) {
    prevOpenRef.current = open;
    prevTemplateRef.current = template;
    if (open) {
      setName(template?.name ?? "");
      setDays(template?.data?.days ? [...template.data.days] : []);
      setExpandedDay("monday");
    }
  }

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
        className="w-full sm:max-w-none md:w-[640px] xl:w-[700px] p-0 flex flex-col gap-0 border-l border-border shadow-2xl"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Template Editor</SheetTitle>
          <SheetDescription>Planning template editor panel</SheetDescription>
        </SheetHeader>

        <div className="px-6 py-5 border-b border-border flex justify-between items-start bg-card/80 backdrop-blur-md sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold text-foreground mb-1">
              {isEditing ? t("form.editTitle") : t("form.createTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("form.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-muted">
          <div className="mb-8">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">
              {t("form.name")}
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("form.namePlaceholder")}
              className="w-full bg-card border border-border rounded-xl py-4 px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/10 transition-all shadow-sm h-12"
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
            <div className="h-px bg-border flex-1" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted px-2">
              {t("preview.title")}
            </span>
            <div className="h-px bg-border flex-1" />
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

        <div className="p-5 border-t border-border bg-card flex justify-between items-center gap-4">
          <div className="flex gap-3 flex-1 justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-11 px-5 border border-border text-muted-foreground font-bold rounded-xl text-sm hover:bg-muted cursor-pointer"
            >
              {t("form.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim() || isSaving}
              className="h-11 px-6 bg-foreground text-background font-bold rounded-xl text-sm hover:bg-foreground/90 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
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
