"use client";

import { Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import type { OnboardingForm } from "../OnboardingWizard";
import { WORK_DAYS, type WorkDay } from "@pawly/validators";

interface StepWorkDaysProps {
  form: OnboardingForm;
}

export function StepWorkDays({ form }: StepWorkDaysProps) {
  const t = useTranslations("onboarding.steps.workDays");
  const tDays = useTranslations("onboarding.days");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Calendar className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">{t("help")}</p>
      </div>

      <form.Field
        name="workDays"
        validators={{
          onChange: ({ value }: { value: WorkDay[] }) => {
            if (!value || value.length === 0) return t("required");
            return undefined;
          },
        }}
      >
        {(field: any) => (
          <div className="space-y-2">
            <Label>{t("label")}</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {WORK_DAYS.map((day) => {
                const isSelected = field.state.value.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      const current = field.state.value;
                      const next = isSelected
                        ? current.filter((d: WorkDay) => d !== day)
                        : [...current, day];
                      field.handleChange(next as WorkDay[]);
                    }}
                    className={cn(
                      "px-3 py-2.5 rounded-xl text-sm font-semibold transition-all min-h-[44px]",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-card border border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {tDays(day)}
                  </button>
                );
              })}
            </div>
            {field.state.meta.errors.length > 0 && (
              <p className="text-[11px] text-destructive" role="alert">
                {field.state.meta.errors[0]}
              </p>
            )}
          </div>
        )}
      </form.Field>
    </div>
  );
}
