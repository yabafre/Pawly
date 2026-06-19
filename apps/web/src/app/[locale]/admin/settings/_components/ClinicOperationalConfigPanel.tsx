'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { updateClinicOperationalConfigSchema, WORK_DAYS } from '@pawly/validators';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CalendarClock, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useClinicOperationalConfig } from '../_hooks/useClinicOperationalConfig';
import { ClosedDaysFieldArray } from './ClosedDaysFieldArray';
import { SpecialDaysFieldArray } from './SpecialDaysFieldArray';
import { SettingsSkeleton } from './SettingsSkeleton';

type FormValues = {
  workDays: string[];
  defaultStartTime: string;
  defaultEndTime: string;
  is24_7: boolean;
  closedDays: Array<{ date: string; reason: string }>;
  specialDays: Array<{
    date: string;
    startTime: string;
    endTime: string;
    label: string;
  }>;
};

const toErrorMap = (
  issues: Array<{ path: PropertyKey[]; message: string }>,
  mapMessage: (message: string) => string
) =>
  issues.reduce<Record<string, string>>((acc, issue) => {
    const key = issue.path.map((segment) => String(segment)).join('.');
    if (!acc[key]) {
      acc[key] = mapMessage(issue.message);
    }
    return acc;
  }, {});

function configToFormValues(config: {
  workDays: string[];
  defaultStartTime: string;
  defaultEndTime: string;
  is24_7?: boolean;
  closedDays: Array<{ date: string; reason?: string | null }>;
  specialDays: Array<{
    date: string;
    startTime: string;
    endTime: string;
    label?: string | null;
  }>;
}): FormValues {
  return {
    workDays: config.workDays,
    defaultStartTime: config.defaultStartTime,
    defaultEndTime: config.defaultEndTime,
    is24_7: config.is24_7 ?? false,
    closedDays: config.closedDays.map((item) => ({
      date: item.date,
      reason: item.reason ?? '',
    })),
    specialDays: config.specialDays.map((item) => ({
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      label: item.label ?? '',
    })),
  };
}

export function ClinicOperationalConfigPanel() {
  const t = useTranslations('settings.operationalConfig');
  const { config, isPending, updateOperationalConfig, isUpdating } = useClinicOperationalConfig();

  if (isPending || !config) {
    return <SettingsSkeleton />;
  }

  return (
    <ClinicOperationalConfigForm
      key={JSON.stringify(config)}
      config={config}
      updateOperationalConfig={updateOperationalConfig}
      isUpdating={isUpdating}
    />
  );
}

function ClinicOperationalConfigForm({
  config,
  updateOperationalConfig,
  isUpdating,
}: {
  config: {
    workDays: string[];
    defaultStartTime: string;
    defaultEndTime: string;
    closedDays: Array<{ date: string; reason?: string | null }>;
    specialDays: Array<{
      date: string;
      startTime: string;
      endTime: string;
      label?: string | null;
    }>;
  };
  updateOperationalConfig: (data: unknown) => void;
  isUpdating: boolean;
}) {
  const t = useTranslations('settings.operationalConfig');
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});
  const prevConfigRef = useRef(config);

  // Clear stale submit errors when config prop changes (derived state, no useEffect)
  if (prevConfigRef.current !== config) {
    prevConfigRef.current = config;
    if (Object.keys(submitErrors).length > 0) {
      setSubmitErrors({});
    }
  }

  const mapErrorMessage = (message: string) => {
    const dictionary: Record<string, string> = {
      'At least one work day is required': t('validation.workDaysRequired'),
      'Invalid time format (HH:MM)': t('validation.invalidTimeFormat'),
      'End time must be after start time': t('validation.endTimeAfterStartTime'),
      'Invalid date format (YYYY-MM-DD)': t('validation.invalidDateFormat'),
      'Invalid date value': t('validation.invalidDateValue'),
      'Duplicate closed day date': t('validation.duplicateClosedDay'),
      'Duplicate special day date': t('validation.duplicateSpecialDay'),
      'A date cannot be both closed and special': t('validation.closedAndSpecialConflict'),
    };

    return dictionary[message] ?? message;
  };

  const form = useForm({
    defaultValues: configToFormValues(config),
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

  const dayOptions = useMemo(
    () =>
      WORK_DAYS.map((day) => ({
        value: day,
        label: t(`days.${day}`),
      })),
    [t]
  );

  return (
    <form
      action={() => {
        form.handleSubmit();
      }}
      className="space-y-6"
    >
      {/* ── Weekly defaults ── */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
        <div>
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted">
              <Clock className="h-4 w-4 text-primary" strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-bold text-foreground">{t('sections.weekly')}</h3>
          </div>

          <form.Field name="workDays" mode="array">
            {(field: any) => (
              <fieldset className="space-y-3">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t('fields.workDays')}
                </Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {dayOptions.map((day) => {
                    const isChecked = field.state.value.includes(day.value);
                    return (
                      <div
                        key={day.value}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all select-none cursor-pointer',
                          isChecked
                            ? 'border-primary/30 bg-primary/8 shadow-sm'
                            : 'border-border bg-muted hover:bg-card hover:border-border'
                        )}
                      >
                        <Checkbox
                          id={`workday-${day.value}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              if (field.state.value.includes(day.value)) return;
                              field.handleChange([...field.state.value, day.value]);
                              return;
                            }
                            field.handleChange(
                              field.state.value.filter((value: string) => value !== day.value)
                            );
                          }}
                        />
                        <Label
                          htmlFor={`workday-${day.value}`}
                          className={cn(
                            'cursor-pointer text-sm font-medium',
                            isChecked ? 'text-primary/80' : 'text-muted-foreground'
                          )}
                        >
                          {day.label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
                {submitErrors.workDays && (
                  <p className="text-xs text-red-600" role="alert">
                    {submitErrors.workDays}
                  </p>
                )}
              </fieldset>
            )}
          </form.Field>

          <form.Field name="is24_7">
            {(field: any) => (
              <label className="mt-4 flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                />
                {t('fields.is24_7')}
              </label>
            )}
          </form.Field>

          <form.Subscribe selector={(state: any) => state.values.is24_7}>
            {(is24_7: boolean) => (
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <form.Field name="defaultStartTime">
                  {(field: any) => (
                    <div className="space-y-2">
                      <Label
                        htmlFor="defaultStartTime"
                        className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                      >
                        {t('fields.defaultStartTime')}
                      </Label>
                      <Input
                        id="defaultStartTime"
                        type="time"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={!!submitErrors.defaultStartTime}
                        disabled={is24_7}
                        className="rounded-xl border-border bg-muted focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary/20 transition-all"
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
                    <div className="space-y-2">
                      <Label
                        htmlFor="defaultEndTime"
                        className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                      >
                        {t('fields.defaultEndTime')}
                      </Label>
                      <Input
                        id="defaultEndTime"
                        type="time"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={!!submitErrors.defaultEndTime}
                        disabled={is24_7}
                        className="rounded-xl border-border bg-muted focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary/20 transition-all"
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
            )}
          </form.Subscribe>
        </div>
      </section>

      {/* ── Closed Days ── */}
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

      {/* ── Special Days ── */}
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

      {/* ── Save ── */}
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isUpdating} className="rounded-xl">
          {isUpdating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CalendarClock className="mr-2 h-4 w-4 text-primary" strokeWidth={1.5} />
          )}
          {isUpdating ? t('actions.saving') : t('actions.save')}
        </Button>
      </div>
    </form>
  );
}
