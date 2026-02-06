"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { WorkDay } from "@pawly/validators";
import { completeOnboardingAction } from "../_actions/onboarding-actions";
import { StepIndicator } from "./StepIndicator";
import { StepClinicName } from "./steps/StepClinicName";
import { StepWorkDays } from "./steps/StepWorkDays";
import { StepWorkHours } from "./steps/StepWorkHours";
import { StepShiftTypes } from "./steps/StepShiftTypes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OnboardingForm = any;

export interface OnboardingFormValues {
  clinicName: string;
  workDays: WorkDay[];
  defaultStartTime: string;
  defaultEndTime: string;
  shiftTypes: Array<{
    name: string;
    code: string;
    startTime: string;
    endTime: string;
    color: string;
  }>;
}

interface OnboardingWizardProps {
  initialData: {
    clinicName: string;
    config: {
      workDays: string[];
      defaultStartTime: string;
      defaultEndTime: string;
    } | null;
    shiftTypes: Array<{
      name: string;
      code: string;
      startTime: string;
      endTime: string;
      color: string;
    }>;
  };
}

const TOTAL_STEPS = 4;

export function OnboardingWizard({ initialData }: OnboardingWizardProps) {
  const t = useTranslations("onboarding");
  const tNav = useTranslations("onboarding.navigation");
  const router = useRouter();
  const locale = useLocale();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    defaultValues: {
      clinicName: initialData.clinicName,
      workDays:
        (initialData.config?.workDays as WorkDay[]) ?? [
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
        ],
      defaultStartTime: initialData.config?.defaultStartTime ?? "08:30",
      defaultEndTime: initialData.config?.defaultEndTime ?? "18:30",
      shiftTypes:
        initialData.shiftTypes.length > 0
          ? initialData.shiftTypes.map((st) => ({
              name: st.name,
              code: st.code,
              startTime: st.startTime,
              endTime: st.endTime,
              color: st.color,
            }))
          : [
              {
                name: "Surgery",
                code: "CHIR",
                startTime: "08:30",
                endTime: "18:30",
                color: "#4F46E5",
              },
              {
                name: "Reception",
                code: "ACC",
                startTime: "09:00",
                endTime: "19:30",
                color: "#F97316",
              },
            ],
    },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      try {
        const [, error] = await completeOnboardingAction(value);
        if (error) {
          toast.error(t("errors.saveFailed"));
          setIsSubmitting(false);
          return;
        }
        toast.success(t("completion.toast"));
        router.push(`/${locale}/admin/dashboard`);
      } catch {
        toast.error(t("errors.saveFailed"));
        setIsSubmitting(false);
      }
    },
  });

  const stepLabels = [
    t("steps.clinicName.title"),
    t("steps.workDays.title"),
    t("steps.workHours.title"),
    t("steps.shiftTypes.title"),
  ];

  const stepTitles = stepLabels;
  const stepDescriptions = [
    t("steps.clinicName.description"),
    t("steps.workDays.description"),
    t("steps.workHours.description"),
    t("steps.shiftTypes.description"),
  ];

  const validateCurrentStep = (): boolean => {
    const values = form.state.values;
    switch (currentStep) {
      case 0:
        return values.clinicName.length >= 2 && values.clinicName.length <= 100;
      case 1:
        return values.workDays.length >= 1;
      case 2:
        return (
          /^\d{2}:\d{2}$/.test(values.defaultStartTime) &&
          /^\d{2}:\d{2}$/.test(values.defaultEndTime) &&
          values.defaultEndTime > values.defaultStartTime
        );
      case 3:
        return (
          values.shiftTypes.length >= 1 &&
          values.shiftTypes.every(
            (st) =>
              st.name.length > 0 &&
              st.code.length > 0 &&
              /^\d{2}:\d{2}$/.test(st.startTime) &&
              /^\d{2}:\d{2}$/.test(st.endTime) &&
              /^#[0-9A-Fa-f]{6}$/.test(st.color),
          )
        );
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
    }
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleComplete = () => {
    if (validateCurrentStep()) {
      void form.handleSubmit();
    }
  };

  const isLastStep = currentStep === TOTAL_STEPS - 1;
  const canProceed = validateCurrentStep();

  return (
    <div className="min-h-screen bg-[#FDFDFD] py-12 px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            {t("title")}
          </h1>
          <p className="text-neutral-500">{t("subtitle")}</p>
        </div>

        {/* Step Indicator */}
        <StepIndicator
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          stepLabels={stepLabels}
        />

        {/* Step Card */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isLastStep) {
              handleComplete();
            } else {
              handleNext();
            }
          }}
        >
          <Card className="shadow-[0_4px_20px_-4px_rgba(0,149,136,0.15)] border-neutral-100 rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-bold text-neutral-900">
                {stepTitles[currentStep]}
              </CardTitle>
              <CardDescription className="text-neutral-500">
                {stepDescriptions[currentStep]}
              </CardDescription>
            </CardHeader>

            <CardContent className="pb-6">
              <div className="transition-all duration-300 ease-in-out">
                {currentStep === 0 ? (
                  <StepClinicName form={form} />
                ) : currentStep === 1 ? (
                  <StepWorkDays form={form} />
                ) : currentStep === 2 ? (
                  <StepWorkHours form={form} />
                ) : (
                  <StepShiftTypes form={form} />
                )}
              </div>
            </CardContent>

            <CardFooter className="flex justify-between pt-4 border-t border-neutral-100">
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="min-h-[44px] rounded-xl"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {tNav("previous")}
              </Button>

              {isLastStep ? (
                <Button
                  type="submit"
                  disabled={!canProceed || isSubmitting}
                  className="bg-[#009588] hover:bg-[#00796B] text-white font-bold min-h-[44px] rounded-xl shadow-lg shadow-[#009588]/20 transition-all hover:scale-[1.01]"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {tNav("completing")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      {tNav("complete")}
                    </span>
                  )}
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!canProceed}
                  className="bg-[#009588] hover:bg-[#00796B] text-white font-bold min-h-[44px] rounded-xl shadow-lg shadow-[#009588]/20 transition-all hover:scale-[1.01]"
                >
                  {tNav("next")}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
