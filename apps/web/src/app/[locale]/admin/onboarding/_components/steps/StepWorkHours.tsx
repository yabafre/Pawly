"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OnboardingForm } from "../OnboardingWizard";

interface StepWorkHoursProps {
  form: OnboardingForm;
}

export function StepWorkHours({ form }: StepWorkHoursProps) {
  const t = useTranslations("onboarding.steps.workHours");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-[#009588]/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-[#009588]" />
        </div>
        <p className="text-sm text-neutral-500">{t("help")}</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <form.Field
          name="defaultStartTime"
          validators={{
            onChange: ({ value }: { value: string }) => {
              if (!/^\d{2}:\d{2}$/.test(value)) return "Invalid format (HH:MM)";
              return undefined;
            },
          }}
        >
          {(field: any) => (
            <div className="space-y-2">
              <Label
                htmlFor={field.name}
                className="text-neutral-900 font-medium"
              >
                {t("startTime")}
              </Label>
              <Input
                id={field.name}
                type="time"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                className="bg-neutral-50 border-neutral-200 focus:bg-white h-12 transition-all focus-visible:border-[#009588] focus-visible:ring-[#009588]/20 rounded-xl"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-[11px] text-orange-600" role="alert">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="defaultEndTime"
          validators={{
            onChange: ({ value }: { value: string }) => {
              if (!/^\d{2}:\d{2}$/.test(value)) return "Invalid format (HH:MM)";
              return undefined;
            },
          }}
        >
          {(field: any) => (
            <div className="space-y-2">
              <Label
                htmlFor={field.name}
                className="text-neutral-900 font-medium"
              >
                {t("endTime")}
              </Label>
              <Input
                id={field.name}
                type="time"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                className="bg-neutral-50 border-neutral-200 focus:bg-white h-12 transition-all focus-visible:border-[#009588] focus-visible:ring-[#009588]/20 rounded-xl"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-[11px] text-orange-600" role="alert">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </div>
          )}
        </form.Field>
      </div>
    </div>
  );
}
