"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OnboardingForm } from "../OnboardingWizard";

interface StepClinicNameProps {
  form: OnboardingForm;
}

export function StepClinicName({ form }: StepClinicNameProps) {
  const t = useTranslations("onboarding.steps.clinicName");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-[#009588]/10 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-[#009588]" />
        </div>
        <p className="text-sm text-neutral-500">{t("help")}</p>
      </div>

      <form.Field
        name="clinicName"
        validators={{
          onChange: ({ value }: { value: string }) => {
            if (!value || value.length < 2)
              return "Minimum 2 characters";
            if (value.length > 100) return "Maximum 100 characters";
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
              {t("label")}
            </Label>
            <Input
              id={field.name}
              type="text"
              placeholder={t("placeholder")}
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
  );
}
