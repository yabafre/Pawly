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
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted">
              <CalendarOff className="h-4 w-4 text-red-400" strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {t("sections.closedDays")}
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
            {t("actions.addClosedDay")}
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <CalendarOff className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("empty.closedDays")}
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {items.map((item, index) => (
              <div
                key={`closed-${index}`}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-muted/30 p-4 transition-all hover:border-primary/20 hover:shadow-sm md:grid-cols-[180px_1fr_auto]"
              >
                <div className="space-y-2">
                  <Label
                    htmlFor={`closed-day-date-${index}`}
                    className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
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
                    className="rounded-xl border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
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
                    className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
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
                    className="rounded-xl border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>

                <div className="flex items-end">
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
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
