"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { CalendarDays, Loader2, Plus, Sparkles } from "lucide-react";
import { TemplateSlotForm } from "./TemplateSlotForm";
import { TemplateWeekPreview } from "./TemplateWeekPreview";
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

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

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

  const resetForm = useCallback(() => {
    setName(template?.name ?? "");
    setDays(template?.data?.days ? [...template.data.days] : []);
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
      currentSlots.map((s, i) => (i === slotIdx ? updatedSlot : s)),
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

  const totalSlots = days.reduce((acc, d) => acc + d.slots.length, 0);
  const totalStaff = days.reduce(
    (acc, d) => acc + d.slots.reduce((s, slot) => s + slot.requiredStaff, 0),
    0,
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-2xl lg:max-w-3xl p-0 flex flex-col gap-0 border-l-0 shadow-[-8px_0_40px_rgba(0,0,0,0.08)]"
      >
        {/* ── Sticky header ─────────────────────────────────────── */}
        <SheetHeader className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-neutral-100 px-6 py-5 gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#009588]/10">
                <CalendarDays className="h-4.5 w-4.5 text-[#009588]" />
              </div>
              <div>
                <SheetTitle className="text-base font-bold text-neutral-800">
                  {isEditing ? t("form.editTitle") : t("form.createTitle")}
                </SheetTitle>
                <SheetDescription className="text-xs text-neutral-400 mt-0">
                  {t("form.subtitle")}
                </SheetDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-neutral-400 hover:text-neutral-600 text-xs"
              onClick={() => onOpenChange(false)}
            >
              {t("form.cancel")}
            </Button>
          </div>

          {/* Name input in header */}
          <div className="relative">
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("form.namePlaceholder")}
              maxLength={100}
              aria-invalid={!name.trim() && name.length > 0}
              aria-describedby={!name.trim() && name.length > 0 ? "name-error" : undefined}
              className="h-11 rounded-xl border-neutral-200 bg-neutral-50/80 px-4 text-sm font-medium placeholder:text-neutral-300 focus-visible:border-[#009588] focus-visible:ring-[#009588]/20"
            />
            {!name.trim() && name.length > 0 && (
              <p id="name-error" className="sr-only" role="alert">
                {t("form.nameRequired")}
              </p>
            )}
            {name.trim() && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Sparkles className="h-3.5 w-3.5 text-[#009588]/40" />
              </div>
            )}
          </div>
        </SheetHeader>

        {/* ── Scrollable body ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-3">
            {DAY_KEYS.map((dayKey, idx) => {
              const dayOfWeek = idx + 1;
              const slots = getDaySlots(dayOfWeek);
              const nonWork = isNonWorkDay(dayOfWeek);
              const hasSlots = slots.length > 0;

              return (
                <div
                  key={dayKey}
                  className={`group relative rounded-2xl border transition-all duration-200 ${
                    nonWork
                      ? "border-dashed border-neutral-200/80 bg-neutral-50/40"
                      : hasSlots
                        ? "border-neutral-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
                        : "border-neutral-100 bg-white/60"
                  }`}
                >
                  {/* Day header */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {/* Day indicator dot */}
                      <div
                        className={`h-2 w-2 rounded-full transition-colors ${
                          hasSlots
                            ? "bg-[#009588]"
                            : nonWork
                              ? "bg-neutral-200"
                              : "bg-neutral-300"
                        }`}
                      />
                      <h3
                        className={`text-[13px] font-semibold tracking-tight ${
                          nonWork ? "text-neutral-400" : "text-neutral-700"
                        }`}
                      >
                        {t(`days.${dayKey}`)}
                      </h3>
                      {nonWork && (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-medium text-neutral-400">
                          {t("nonWorkDay")}
                        </span>
                      )}
                      {hasSlots && (
                        <span className="rounded-full bg-[#009588]/8 px-2 py-0.5 text-[9px] font-semibold text-[#009588]">
                          {t("card.slotsCount", { count: slots.length })}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-lg px-2.5 text-[11px] font-medium text-[#009588] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#009588]/8 hover:text-[#00796B]"
                      onClick={() => addSlot(dayOfWeek)}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {t("slot.addSlot")}
                    </Button>
                  </div>

                  {/* Slots area */}
                  {hasSlots && (
                    <div className="border-t border-neutral-100 px-4 py-3 space-y-2">
                      {slots.map((slot, slotIdx) => (
                        <TemplateSlotForm
                          key={slotIdx}
                          slot={slot}
                          shiftTypes={shiftTypes}
                          onUpdate={(updated) => updateSlot(dayOfWeek, slotIdx, updated)}
                          onRemove={() => removeSlot(dayOfWeek, slotIdx)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Sticky footer with preview + actions ──────────────── */}
        <SheetFooter className="sticky bottom-0 z-10 border-t border-neutral-100 bg-white/95 backdrop-blur-sm px-6 py-4 gap-4">
          {/* Live preview strip */}
          <div className="w-full">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                {t("preview.title")}
              </p>
              <div className="flex items-center gap-3 text-[10px] text-neutral-400">
                <span>{t("card.slotsCount", { count: totalSlots })}</span>
                <span className="h-3 w-px bg-neutral-200" />
                <span>{t("slot.staffCount", { count: totalStaff })}</span>
              </div>
            </div>
            <TemplateWeekPreview
              data={{ days }}
              shiftTypes={shiftTypes}
              workDays={workDays}
              compact
            />
          </div>

          {/* Actions */}
          <div className="flex w-full items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl px-4 text-xs text-neutral-500 hover:text-neutral-700"
              onClick={() => onOpenChange(false)}
            >
              {t("form.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || isSaving}
              size="sm"
              className="rounded-xl bg-[#009588] px-6 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(0,149,136,0.3)] transition-all hover:bg-[#00796B] hover:shadow-[0_4px_12px_rgba(0,149,136,0.4)] disabled:opacity-50 disabled:shadow-none"
            >
              {isSaving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              {t("form.save")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
