"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

type ClosedDayItem = {
  date: string;
  reason: string;
};

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
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">
          {t("sections.closedDays")}
        </h3>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("actions.addClosedDay")}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">{t("empty.closedDays")}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={`closed-${index}`}
              className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3 md:grid-cols-[180px_1fr_auto]"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`closed-day-date-${index}`}>{t("fields.date")}</Label>
                <Input
                  id={`closed-day-date-${index}`}
                  type="date"
                  value={item.date}
                  onChange={(event) =>
                    updateRow(index, { date: event.target.value })
                  }
                  aria-invalid={!!errors[`closedDays.${index}.date`]}
                />
                {errors[`closedDays.${index}.date`] && (
                  <p className="text-xs text-red-600" role="alert">
                    {errors[`closedDays.${index}.date`]}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`closed-day-reason-${index}`}>{t("fields.reason")}</Label>
                <Input
                  id={`closed-day-reason-${index}`}
                  value={item.reason}
                  onChange={(event) =>
                    updateRow(index, { reason: event.target.value })
                  }
                  placeholder={t("fields.reasonPlaceholder")}
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(index)}
                  aria-label={t("actions.remove")}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
