"use client";

import { useForm } from "@tanstack/react-form";
import { useTranslations } from "next-intl";
import {
  createUnavailabilitySchema,
  updateUnavailabilitySchema,
  UNAVAILABILITY_TYPES,
} from "@pawly/validators";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ConstraintValues = {
  id?: string;
  type: "SCHOOL" | "VACATION" | "SICK" | "OTHER";
  startDate: string;
  endDate: string;
  reason: string;
  daysOfWeek: number[];
};

type EmployeeConstraintFormProps = {
  employeeId: string;
  defaultValues?: ConstraintValues;
  mode: "create" | "edit";
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
};

const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const toDateInputValue = (value?: string | Date | null) => {
  if (!value) return "";
  return new Date(value).toISOString().split("T")[0];
};

const toStartOfDayIso = (dateValue: string) =>
  new Date(`${dateValue}T00:00:00.000Z`).toISOString();

const toEndOfDayIso = (dateValue: string) =>
  new Date(`${dateValue}T23:59:59.999Z`).toISOString();

export function EmployeeConstraintForm({
  employeeId,
  defaultValues,
  mode,
  isPending,
  onCancel,
  onSubmit,
}: EmployeeConstraintFormProps) {
  const t = useTranslations("employees");
  const hasRecurringDays = (defaultValues?.daysOfWeek ?? []).length > 0;

  const form = useForm({
    defaultValues: {
      type: defaultValues?.type ?? "SCHOOL",
      startDate: toDateInputValue(defaultValues?.startDate),
      endDate: toDateInputValue(defaultValues?.endDate),
      reason: defaultValues?.reason ?? "",
      isRecurring: hasRecurringDays,
      daysOfWeek: defaultValues?.daysOfWeek ?? [],
    },
    onSubmit: async ({ value }) => {
      const payload = {
        employeeId,
        type: value.type,
        startDate: toStartOfDayIso(value.startDate),
        endDate: toEndOfDayIso(value.endDate),
        reason: value.reason.trim(),
        daysOfWeek: value.isRecurring ? value.daysOfWeek : [],
      };

      if (mode === "edit" && defaultValues?.id) {
        const parsed = updateUnavailabilitySchema.safeParse({
          id: defaultValues.id,
          ...payload,
        });
        if (!parsed.success) return;
        onSubmit(parsed.data);
        return;
      }

      const parsed = createUnavailabilitySchema.safeParse(payload);
      if (!parsed.success) return;
      onSubmit(parsed.data);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-4 rounded-2xl border border-border bg-muted p-4"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <form.Field name="type">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label>{t("constraints.form.type")}</Label>
              <Select value={field.state.value} onValueChange={field.handleChange}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNAVAILABILITY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`constraints.types.${type}` as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="reason">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="reason">{t("constraints.form.reason")}</Label>
              <Input
                id="reason"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={t("constraints.form.reasonPlaceholder")}
              />
            </div>
          )}
        </form.Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <form.Field
          name="startDate"
          validators={{
            onChange: ({ value }) =>
              value ? undefined : t("constraints.validation.startDateRequired"),
          }}
        >
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="startDate">{t("constraints.form.startDate")}</Label>
              <Input
                id="startDate"
                type="date"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive" role="alert">
                  {t("constraints.validation.startDateRequired")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="endDate"
          validators={{
            onChangeListenTo: ["startDate"],
            onChange: ({ value, fieldApi }) => {
              const startDate = fieldApi.form.getFieldValue("startDate");
              if (!value) return t("constraints.validation.endDateRequired");
              if (!startDate) return undefined;
              return new Date(value) >= new Date(startDate)
                ? undefined
                : t("constraints.validation.endDateAfterStart");
            },
          }}
        >
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="endDate">{t("constraints.form.endDate")}</Label>
              <Input
                id="endDate"
                type="date"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive" role="alert">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="isRecurring">
        {(field: any) => (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked === true)}
            />
            {t("constraints.form.recurring")}
          </label>
        )}
      </form.Field>

      <form.Subscribe selector={(state: any) => state.values.isRecurring}>
        {(isRecurring: boolean) => (
          <form.Field
            name="daysOfWeek"
            validators={{
              onChange: ({ value }) => {
                if (!isRecurring) return undefined;
                return value.length > 0
                  ? undefined
                  : t("constraints.validation.weekdayRequired");
              },
            }}
          >
            {(field: any) => (
              <div className={isRecurring ? "space-y-2" : "hidden"}>
                <Label>{t("constraints.form.daysOfWeek")}</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEK_DAYS.map((weekday) => {
                    const isChecked = field.state.value.includes(weekday);
                    return (
                      <label
                        key={weekday}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm cursor-pointer hover:bg-muted transition-colors"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              field.handleChange(
                                [...field.state.value, weekday].sort((a: number, b: number) => a - b),
                              );
                              return;
                            }
                            field.handleChange(
                              field.state.value.filter((value: number) => value !== weekday),
                            );
                          }}
                        />
                        {t(
                          `constraints.days.${weekday}` as Parameters<typeof t>[0],
                        )}
                      </label>
                    );
                  })}
                </div>
                {field.state.meta.errors.length > 0 && (
                  <p className="text-sm text-destructive" role="alert">
                    {t("constraints.validation.weekdayRequired")}
                  </p>
                )}
              </div>
            )}
          </form.Field>
        )}
      </form.Subscribe>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl">
          {t("actions.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-foreground text-background hover:bg-foreground/90"
        >
          {isPending ? "..." : t("actions.save")}
        </Button>
      </div>
    </form>
  );
}
