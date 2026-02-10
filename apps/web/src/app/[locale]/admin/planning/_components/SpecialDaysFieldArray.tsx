"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

type SpecialDayItem = {
  date: string;
  startTime: string;
  endTime: string;
  label: string;
};

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
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">
          {t("sections.specialDays")}
        </h3>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("actions.addSpecialDay")}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">{t("empty.specialDays")}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={`special-${index}`}
              className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3 md:grid-cols-2"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`special-day-date-${index}`}>{t("fields.date")}</Label>
                <Input
                  id={`special-day-date-${index}`}
                  type="date"
                  value={item.date}
                  onChange={(event) =>
                    updateRow(index, { date: event.target.value })
                  }
                  aria-invalid={!!errors[`specialDays.${index}.date`]}
                />
                {errors[`specialDays.${index}.date`] && (
                  <p className="text-xs text-red-600" role="alert">
                    {errors[`specialDays.${index}.date`]}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`special-day-label-${index}`}>{t("fields.label")}</Label>
                <Input
                  id={`special-day-label-${index}`}
                  value={item.label}
                  onChange={(event) =>
                    updateRow(index, { label: event.target.value })
                  }
                  placeholder={t("fields.labelPlaceholder")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`special-day-start-${index}`}>
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
                />
                {errors[`specialDays.${index}.startTime`] && (
                  <p className="text-xs text-red-600" role="alert">
                    {errors[`specialDays.${index}.startTime`]}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`special-day-end-${index}`}>{t("fields.endTime")}</Label>
                <div className="flex items-end gap-2">
                  <div className="w-full">
                    <Input
                      id={`special-day-end-${index}`}
                      type="time"
                      value={item.endTime}
                      onChange={(event) =>
                        updateRow(index, { endTime: event.target.value })
                      }
                      aria-invalid={!!errors[`specialDays.${index}.endTime`]}
                    />
                    {errors[`specialDays.${index}.endTime`] && (
                      <p className="text-xs text-red-600" role="alert">
                        {errors[`specialDays.${index}.endTime`]}
                      </p>
                    )}
                  </div>
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
