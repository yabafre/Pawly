"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import type { ClosedDayItem } from "@pawly/types";

type ClosedDaysFieldArrayProps = {
  items: ClosedDayItem[];
  onChange: (next: ClosedDayItem[]) => void;
  errors: Record<string, string>;
  t: (key: string) => string;
};

const EMPTY_ROW: ClosedDayItem = { date: "", reason: "" };

export function ClosedDaysFieldArray({
  items,
  onChange,
  errors,
  t,
}: ClosedDaysFieldArrayProps) {
  const addRow = () => {
    onChange([...items, { ...EMPTY_ROW }]);
  };

  const removeRow = (index: number) => {
    onChange(items.filter((_, idx) => idx !== index));
  };

  const updateRow = (index: number, patch: Partial<ClosedDayItem>) => {
    onChange(
      items.map((row, idx) => (idx === index ? { ...row, ...patch } : row)),
    );
  };

  return (
    <section className="group relative overflow-hidden rounded-3xl border border-neutral-100 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] md:p-6">
      {/* Glow spot interne */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-[200px] w-[200px] rounded-full bg-red-400 opacity-0 blur-[60px] transition-opacity duration-700 group-hover:opacity-[0.04]" />

      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100">
              <CalendarOff className="h-4 w-4 text-red-400" strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-bold text-neutral-900">
              {t("sections.closedDays")}
            </h3>
            <Badge
              variant="secondary"
              className="bg-neutral-100 text-neutral-500 hover:bg-neutral-100 text-[10px] font-bold tabular-nums"
            >
              {items.length}
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRow}
            className="text-[#009588] hover:bg-[#009588]/10 hover:text-[#00796B] font-bold text-xs"
          >
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
            {t("actions.addClosedDay")}
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/40 py-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100">
              <CalendarOff className="h-6 w-6 text-neutral-300" strokeWidth={1.5} />
            </div>
            <p className="mt-3 text-sm text-neutral-400">
              {t("empty.closedDays")}
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {items.map((item, index) => (
              <div
                key={`closed-${index}`}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-100 bg-neutral-50/50 p-4 transition-all hover:border-[#009588]/20 hover:shadow-sm md:grid-cols-[180px_1fr_auto]"
              >
                <div className="space-y-2">
                  <Label
                    htmlFor={`closed-day-date-${index}`}
                    className="text-[10px] font-bold uppercase tracking-widest text-neutral-400"
                  >
                    {t("fields.date")}
                  </Label>
                  <Input
                    id={`closed-day-date-${index}`}
                    type="date"
                    value={item.date}
                    onChange={(event) =>
                      updateRow(index, { date: event.target.value })
                    }
                    aria-invalid={!!errors[`closedDays.${index}.date`]}
                    className="rounded-xl border-neutral-200 bg-white focus:border-[#009588] focus:ring-1 focus:ring-[#009588]/20 transition-all"
                  />
                  {errors[`closedDays.${index}.date`] && (
                    <p className="text-xs text-red-600" role="alert">
                      {errors[`closedDays.${index}.date`]}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor={`closed-day-reason-${index}`}
                    className="text-[10px] font-bold uppercase tracking-widest text-neutral-400"
                  >
                    {t("fields.reason")}
                  </Label>
                  <Input
                    id={`closed-day-reason-${index}`}
                    value={item.reason}
                    onChange={(event) =>
                      updateRow(index, { reason: event.target.value })
                    }
                    placeholder={t("fields.reasonPlaceholder")}
                    className="rounded-xl border-neutral-200 bg-white focus:border-[#009588] focus:ring-1 focus:ring-[#009588]/20 transition-all"
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(index)}
                    aria-label={t("actions.remove")}
                    className="h-9 w-9 rounded-xl text-neutral-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
