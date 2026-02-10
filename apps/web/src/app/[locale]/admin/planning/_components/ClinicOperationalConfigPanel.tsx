"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  updateClinicOperationalConfigSchema,
  WORK_DAYS,
} from "@pawly/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { useClinicOperationalConfig } from "../_hooks/useClinicOperationalConfig";
import { ClosedDaysFieldArray } from "./ClosedDaysFieldArray";
import { SpecialDaysFieldArray } from "./SpecialDaysFieldArray";

type FormValues = {
  workDays: string[];
  defaultStartTime: string;
  defaultEndTime: string;
  closedDays: Array<{ date: string; reason: string }>;
  specialDays: Array<{
    date: string;
    startTime: string;
    endTime: string;
    label: string;
  }>;
};

const EMPTY_FORM: FormValues = {
  workDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  defaultStartTime: "08:30",
  defaultEndTime: "18:30",
  closedDays: [],
  specialDays: [],
};

const toErrorMap = (
  issues: Array<{ path: PropertyKey[]; message: string }>,
  mapMessage: (message: string) => string,
) =>
  issues.reduce<Record<string, string>>((acc, issue) => {
    const key = issue.path.map((segment) => String(segment)).join(".");
    if (!acc[key]) {
      acc[key] = mapMessage(issue.message);
    }
    return acc;
  }, {});

export function ClinicOperationalConfigPanel() {
  const t = useTranslations("planning.operationalConfig");
  const {
    config,
    isPending,
    error,
    updateOperationalConfig,
    isUpdating,
  } = useClinicOperationalConfig();
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});

  const mapErrorMessage = (message: string) => {
    const dictionary: Record<string, string> = {
      "At least one work day is required": t("validation.workDaysRequired"),
      "Invalid time format (HH:MM)": t("validation.invalidTimeFormat"),
      "End time must be after start time": t("validation.endTimeAfterStartTime"),
      "Invalid date format (YYYY-MM-DD)": t("validation.invalidDateFormat"),
      "Invalid date value": t("validation.invalidDateValue"),
      "Duplicate closed day date": t("validation.duplicateClosedDay"),
      "Duplicate special day date": t("validation.duplicateSpecialDay"),
      "A date cannot be both closed and special": t(
        "validation.closedAndSpecialConflict",
      ),
    };

    return dictionary[message] ?? message;
  };

  const form = useForm({
    defaultValues: EMPTY_FORM,
    onSubmit: async ({ value }) => {
      const parsed = updateClinicOperationalConfigSchema.safeParse(value);
      if (!parsed.success) {
        setSubmitErrors(toErrorMap(parsed.error.issues, mapErrorMessage));
        return;
      }

      setSubmitErrors({});
      updateOperationalConfig(parsed.data);
    },
  });

  useEffect(() => {
    if (!config) return;

    form.setFieldValue("workDays", config.workDays);
    form.setFieldValue("defaultStartTime", config.defaultStartTime);
    form.setFieldValue("defaultEndTime", config.defaultEndTime);
    form.setFieldValue(
      "closedDays",
      config.closedDays.map((item) => ({
        date: item.date,
        reason: item.reason ?? "",
      })),
    );
    form.setFieldValue(
      "specialDays",
      config.specialDays.map((item) => ({
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        label: item.label ?? "",
      })),
    );
  }, [config, form]);

  const dayOptions = useMemo(
    () =>
      WORK_DAYS.map((day) => ({
        value: day,
        label: t(`days.${day}`),
      })),
    [t],
  );

  return (
    <section className="space-y-4 rounded-3xl border border-neutral-100 bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.04)]">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-neutral-900">{t("title")}</h2>
        <p className="text-sm text-neutral-600">{t("subtitle")}</p>
      </div>

      {error && <p className="text-sm text-red-600">{t("errors.loadFailed")}</p>}
      {isPending && !config && (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-neutral-900">{t("sections.weekly")}</h3>

          <form.Field name="workDays">
            {(field: any) => (
              <div className="space-y-2">
                <Label>{t("fields.workDays")}</Label>
                <div className="flex flex-wrap gap-2">
                  {dayOptions.map((day) => {
                    const isChecked = field.state.value.includes(day.value);
                    return (
                      <label
                        key={day.value}
                        className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) => {
                            if (event.target.checked) {
                              field.handleChange([...field.state.value, day.value]);
                              return;
                            }
                            field.handleChange(
                              field.state.value.filter((value: string) => value !== day.value),
                            );
                          }}
                        />
                        {day.label}
                      </label>
                    );
                  })}
                </div>
                {submitErrors.workDays && (
                  <p className="text-xs text-red-600" role="alert">
                    {submitErrors.workDays}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <form.Field name="defaultStartTime">
              {(field: any) => (
                <div className="space-y-1.5">
                  <Label htmlFor="defaultStartTime">{t("fields.defaultStartTime")}</Label>
                  <Input
                    id="defaultStartTime"
                    type="time"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={!!submitErrors.defaultStartTime}
                  />
                  {submitErrors.defaultStartTime && (
                    <p className="text-xs text-red-600" role="alert">
                      {submitErrors.defaultStartTime}
                    </p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field name="defaultEndTime">
              {(field: any) => (
                <div className="space-y-1.5">
                  <Label htmlFor="defaultEndTime">{t("fields.defaultEndTime")}</Label>
                  <Input
                    id="defaultEndTime"
                    type="time"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={!!submitErrors.defaultEndTime}
                  />
                  {submitErrors.defaultEndTime && (
                    <p className="text-xs text-red-600" role="alert">
                      {submitErrors.defaultEndTime}
                    </p>
                  )}
                </div>
              )}
            </form.Field>
          </div>
        </section>

        <form.Field name="closedDays">
          {(field: any) => (
            <ClosedDaysFieldArray
              items={field.state.value}
              onChange={field.handleChange}
              errors={submitErrors}
              t={(key) => t(key)}
            />
          )}
        </form.Field>

        <form.Field name="specialDays">
          {(field: any) => (
            <SpecialDaysFieldArray
              items={field.state.value}
              onChange={field.handleChange}
              errors={submitErrors}
              t={(key) => t(key)}
            />
          )}
        </form.Field>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isUpdating}
            className="rounded-xl bg-neutral-900 text-white hover:bg-neutral-800"
          >
            {isUpdating ? t("actions.saving") : t("actions.save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
