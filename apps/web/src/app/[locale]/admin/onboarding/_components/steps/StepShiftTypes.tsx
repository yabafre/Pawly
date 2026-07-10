'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OnboardingForm } from '../OnboardingWizard';

interface StepShiftTypesProps {
  form: OnboardingForm;
}

const COLOR_PALETTE = [
  { value: '#4F46E5', label: 'Indigo' },
  { value: '#F97316', label: 'Orange' },
  { value: '#10B981', label: 'Emerald' },
  { value: '#F43F5E', label: 'Rose' },
  { value: '#009588', label: 'Teal' },
  { value: '#8B5CF6', label: 'Violet' },
  { value: '#06B6D4', label: 'Cyan' },
  { value: '#EAB308', label: 'Yellow' },
];

export function StepShiftTypes({ form }: StepShiftTypesProps) {
  const t = useTranslations('onboarding.steps.shiftTypes');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Layers className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">{t('help')}</p>
      </div>

      <form.Field
        name="shiftTypes"
        validators={{
          onChange: ({ value }: { value: any[] }) => {
            if (!value || value.length === 0) return t('minRequired');
            const hasIncomplete = value.some(
              (st) =>
                !st.name?.trim() ||
                !st.code?.trim() ||
                !/^\d{2}:\d{2}$/.test(st.startTime) ||
                !/^\d{2}:\d{2}$/.test(st.endTime) ||
                st.endTime <= st.startTime
            );
            if (hasIncomplete) return t('incompleteShiftType');
            return undefined;
          },
        }}
      >
        {(field: any) => (
          <div className="space-y-3">
            {field.state.value.map((_item: any, index: number) => (
              <div key={index} className="p-4 rounded-xl border border-border bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: field.state.value[index].color }}
                  />
                  {field.state.value.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = field.state.value.filter(
                          (_: unknown, i: number) => i !== index
                        );
                        field.handleChange(next);
                      }}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      title={t('removeShiftType')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <Field>
                  <FieldLabel className="text-xs">{t('name')}</FieldLabel>
                  <Input
                    placeholder={t('namePlaceholder')}
                    value={field.state.value[index].name}
                    onChange={(e) => {
                      const next = [...field.state.value];
                      const otherCodes = next.filter((_, i) => i !== index).map((st) => st.code);
                      const base = e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 10);
                      let code = base;
                      if (base && otherCodes.includes(base)) {
                        let n = 2;
                        while (otherCodes.includes(`${base.slice(0, 8)}${n}`)) n++;
                        code = `${base.slice(0, 8)}${n}`;
                      }
                      next[index] = { ...next[index], name: e.target.value, code };
                      field.handleChange(next);
                    }}
                    className="h-9"
                  />
                </Field>

                <div className="grid grid-cols-3 gap-3">
                  <Field>
                    <FieldLabel className="text-xs">{t('startTime')}</FieldLabel>
                    <Input
                      type="time"
                      value={field.state.value[index].startTime}
                      onChange={(e) => {
                        const next = [...field.state.value];
                        next[index] = { ...next[index], startTime: e.target.value };
                        field.handleChange(next);
                      }}
                      className="h-9"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs">{t('endTime')}</FieldLabel>
                    <Input
                      type="time"
                      value={field.state.value[index].endTime}
                      onChange={(e) => {
                        const next = [...field.state.value];
                        next[index] = { ...next[index], endTime: e.target.value };
                        field.handleChange(next);
                      }}
                      className="h-9"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs">{t('breakMinutes')}</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      max={300}
                      value={field.state.value[index].breakMinutes ?? 0}
                      onChange={(e) => {
                        const next = [...field.state.value];
                        next[index] = {
                          ...next[index],
                          breakMinutes: Math.max(0, Math.min(300, parseInt(e.target.value) || 0)),
                        };
                        field.handleChange(next);
                      }}
                      className="h-9"
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel className="text-xs">{t('color')}</FieldLabel>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_PALETTE.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => {
                          const next = [...field.state.value];
                          next[index] = { ...next[index], color: color.value };
                          field.handleChange(next);
                        }}
                        className={`
                          w-7 h-7 rounded-lg transition-all
                          ${
                            field.state.value[index].color === color.value
                              ? 'ring-2 ring-offset-2 ring-foreground scale-110'
                              : 'hover:scale-105'
                          }
                        `}
                        style={{ backgroundColor: color.value }}
                        title={color.label}
                      />
                    ))}
                  </div>
                </Field>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                field.handleChange([
                  ...field.state.value,
                  {
                    name: '',
                    code: '',
                    startTime: '08:30',
                    endTime: '18:30',
                    breakMinutes: 0,
                    color: COLOR_PALETTE[field.state.value.length % COLOR_PALETTE.length].value,
                  },
                ]);
              }}
              className="w-full border-dashed"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('addShiftType')}
            </Button>

            {field.state.meta.errors.length > 0 && <FieldError errors={field.state.meta.errors} />}
          </div>
        )}
      </form.Field>
    </div>
  );
}
