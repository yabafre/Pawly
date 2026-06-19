'use client';

import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OnboardingForm } from '../OnboardingWizard';

interface StepWorkHoursProps {
  form: OnboardingForm;
}

export function StepWorkHours({ form }: StepWorkHoursProps) {
  const t = useTranslations('onboarding.steps.workHours');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Clock className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">{t('help')}</p>
      </div>

      <form.Field name="is24_7">
        {(field: any) => (
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <Checkbox
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked === true)}
            />
            {t('is24_7')}
          </label>
        )}
      </form.Field>

      <form.Subscribe selector={(state: any) => state.values.is24_7}>
        {(is24_7: boolean) => (
          <div className="grid grid-cols-2 gap-4">
            <form.Field
              name="defaultStartTime"
              validators={{
                onChange: ({ value }: { value: string }) => {
                  if (!/^\d{2}:\d{2}$/.test(value)) return t('invalidFormat');
                  return undefined;
                },
              }}
            >
              {(field: any) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>{t('startTime')}</FieldLabel>
                    <Input
                      id={field.name}
                      type="time"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={isInvalid}
                      disabled={is24_7}
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field
              name="defaultEndTime"
              validators={{
                onChange: ({ value }: { value: string }) => {
                  if (!/^\d{2}:\d{2}$/.test(value)) return t('invalidFormat');
                  return undefined;
                },
              }}
            >
              {(field: any) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>{t('endTime')}</FieldLabel>
                    <Input
                      id={field.name}
                      type="time"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={isInvalid}
                      disabled={is24_7}
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>
          </div>
        )}
      </form.Subscribe>
    </div>
  );
}
