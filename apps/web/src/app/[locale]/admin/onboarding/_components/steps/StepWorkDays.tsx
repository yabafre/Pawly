"use client";

import { Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OnboardingForm } from "../OnboardingWizard";
import { WORK_DAYS, type WorkDay } from "@pawly/validators";

interface StepWorkDaysProps {
  form: OnboardingForm;
}

export function StepWorkDays({ form }: StepWorkDaysProps) {
  const t = useTranslations("onboarding.steps.workDays");
  const tDays = useTranslations("onboarding.days");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-[#009588]/10 flex items-center justify-center">
          <Calendar className="w-5 h-5 text-[#009588]" />
        </div>
        <p className="text-sm text-neutral-500">{t("help")}</p>
      </div>

      <form.Field
        name="workDays"
        validators={{
          onChange: ({ value }: { value: WorkDay[] }) => {
            if (!value || value.length === 0)
              return "At least one day is required";
            return undefined;
          },
        }}
      >
        {(field: any) => (
          <div className="space-y-3">
            <p className="text-sm font-medium text-neutral-900">{t("label")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                    className={`
                      px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200
                      min-h-[44px]
                      ${
                        isSelected
                          ? "bg-[#009588] text-white shadow-md shadow-[#009588]/20"
                          : "bg-white text-neutral-600 border border-neutral-200 hover:border-[#009588]/40"
                      }
                    `}
                  >
                    {tDays(day)}
                  </button>
                );
              })}
            </div>
            {field.state.meta.errors.length > 0 && (
              <p className="text-[11px] text-orange-600" role="alert">
                {field.state.meta.errors[0]}
              </p>
            )}
          </div>
        )}
      </form.Field>
    </div>
  );
}
