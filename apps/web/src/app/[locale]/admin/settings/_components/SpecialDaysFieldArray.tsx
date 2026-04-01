"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import type { SpecialDayItem } from "@pawly/types";

type SpecialDaysFieldArrayProps = {
  items: SpecialDayItem[];
  onChange: (next: SpecialDayItem[]) => void;
  errors: Record<string, string>;
  t: (key: string) => string;
};

const EMPTY_ROW: SpecialDayItem = {
  date: "",
  startTime: "",
  endTime: "",
  label: "",
};

export function SpecialDaysFieldArray({
  items,
  onChange,
  errors,
  t,
}: SpecialDaysFieldArrayProps) {
  const addRow = () => {
    onChange([...items, { ...EMPTY_ROW }]);
  };

  const removeRow = (index: number) => {
    onChange(items.filter((_, idx) => idx !== index));
  };

  const updateRow = (index: number, patch: Partial<SpecialDayItem>) => {
    onChange(
      items.map((row, idx) => (idx === index ? { ...row, ...patch } : row)),
    );
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted">
              <CalendarClock className="h-4 w-4 text-amber-500" strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {t("sections.specialDays")}
            </h3>
            <Badge
              variant="secondary"
              className="bg-muted text-muted-foreground hover:bg-muted text-[10px] font-bold tabular-nums"
            >
              {items.length}
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRow}
            className="text-primary hover:bg-primary/10 hover:text-primary/80 font-bold text-xs"
          >
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
            {t("actions.addSpecialDay")}
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <CalendarClock className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("empty.specialDays")}
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3">
            {items.map((item, index) => (
              <div
                key={`special-${index}`}
                className="rounded-2xl border border-border bg-muted/30 p-5 transition-all hover:border-primary/20 hover:shadow-sm"
              >
                {/* Mobile: stack, Desktop: inline grid */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.5fr_auto]">
                  {/* Date */}
                  <div className="space-y-2">
                    <Label
                      htmlFor={`special-day-date-${index}`}
                      className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                    >
                      {t("fields.date")}
                    </Label>
                    <Input
                      id={`special-day-date-${index}`}
                      type="date"
                      value={item.date}
                      onChange={(event) =>
                        updateRow(index, { date: event.target.value })
                      }
                      aria-invalid={!!errors[`specialDays.${index}.date`]}
                      className="rounded-xl border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                    {errors[`specialDays.${index}.date`] && (
                      <p className="text-xs text-red-600" role="alert">
                        {errors[`specialDays.${index}.date`]}
                      </p>
                    )}
                  </div>

                  {/* Label */}
                  <div className="space-y-2">
                    <Label
                      htmlFor={`special-day-label-${index}`}
                      className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                    >
                      {t("fields.label")}
                    </Label>
                    <Input
                      id={`special-day-label-${index}`}
                      value={item.label}
                      onChange={(event) =>
                        updateRow(index, { label: event.target.value })
                      }
                      placeholder={t("fields.labelPlaceholder")}
                      className="rounded-xl border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                  </div>

                  {/* Delete button aligned with inputs */}
                  <div className="hidden md:flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(index)}
                      aria-label={t("actions.remove")}
                      className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>

                {/* Time inputs row */}
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label
                      htmlFor={`special-day-start-${index}`}
                      className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                    >
                      {t("fields.startTime")}
                    </Label>
                    <Input
                      id={`special-day-start-${index}`}
                      type="time"
                      value={item.startTime}
                      onChange={(event) =>
                        updateRow(index, { startTime: event.target.value })
                      }
                      aria-invalid={!!errors[`specialDays.${index}.startTime`]}
                      className="rounded-xl border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                    {errors[`specialDays.${index}.startTime`] && (
                      <p className="text-xs text-red-600" role="alert">
                        {errors[`specialDays.${index}.startTime`]}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor={`special-day-end-${index}`}
                      className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                    >
                      {t("fields.endTime")}
                    </Label>
                    <Input
                      id={`special-day-end-${index}`}
                      type="time"
                      value={item.endTime}
                      onChange={(event) =>
                        updateRow(index, { endTime: event.target.value })
                      }
                      aria-invalid={!!errors[`specialDays.${index}.endTime`]}
                      className="rounded-xl border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                    {errors[`specialDays.${index}.endTime`] && (
                      <p className="text-xs text-red-600" role="alert">
                        {errors[`specialDays.${index}.endTime`]}
                      </p>
                    )}
                  </div>
                </div>

                {/* Mobile-only delete button */}
                <div className="mt-4 flex justify-end md:hidden">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(index)}
                    aria-label={t("actions.remove")}
                    className="rounded-xl text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                    {t("actions.remove")}
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
