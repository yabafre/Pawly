"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "@tanstack/react-form";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { WorkDay } from "@pawly/validators";
import type { OnboardingInitialData } from "@pawly/types";
import { completeOnboardingAction, saveOnboardingDraftAction } from "../_actions/onboarding-actions";
import { setupStarterSubscriptionAction, syncAfterCheckoutAction } from "@/app/[locale]/admin/billing/_actions/billing-actions";
import { useOnboardingStatus } from "../_hooks/useOnboardingStatus";
import { StepIndicator } from "./StepIndicator";
import { StepWorkDays } from "./steps/StepWorkDays";
import { StepWorkHours } from "./steps/StepWorkHours";
import { StepShiftTypes } from "./steps/StepShiftTypes";

export type OnboardingForm = any;

interface OnboardingFormValues {
  clinicName: string;
  workDays: WorkDay[];
  defaultStartTime: string;
  defaultEndTime: string;
  shiftTypes: Array<{
    name: string;
    code: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    color: string;
  }>;
}

const TOTAL_STEPS = 3;

export function OnboardingWizard() {
  const t = useTranslations("onboarding");
  const { initialData, isLoading, isError } = useOnboardingStatus();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !initialData) {
    return (
      <div className="rounded-2xl bg-destructive/5 border border-destructive/20 px-6 py-4 text-sm text-destructive font-medium">
        {t("errors.loadFailed")}
      </div>
    );
  }

  return <OnboardingWizardForm initialData={initialData} />;
}

function OnboardingWizardForm({ initialData }: { initialData: OnboardingInitialData & { onboardingDraft?: Record<string, unknown> | null } }) {
  const t = useTranslations("onboarding");
  const tNav = useTranslations("onboarding.navigation");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const selectedPlan = searchParams.get("plan") ?? "starter";

  const draft = initialData.onboardingDraft as { step?: number; values?: Record<string, unknown> } | null;
  const [currentStep, setCurrentStep] = useState(draft?.step ?? 0);
  const [maxStepReached, setMaxStepReached] = useState(draft?.step ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fallbackDefaults = {
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
          breakMinutes: st.breakMinutes ?? 0,
          color: st.color,
        }))
        : [
          {
            name: "Surgery",
            code: "CHIR",
            startTime: "08:30",
            endTime: "18:30",
            breakMinutes: 0,
            color: "#4F46E5",
          },
          {
            name: "Reception",
            code: "ACC",
            startTime: "09:00",
            endTime: "19:30",
            breakMinutes: 0,
            color: "#F97316",
          },
        ],
  };

  const form = useForm({
    defaultValues: draft?.values
      ? { ...fallbackDefaults, ...draft.values }
      : fallbackDefaults,
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      try {
        const [, error] = await completeOnboardingAction(value);
        if (error) {
          toast.error(t("errors.saveFailed"));
          setIsSubmitting(false);
          return;
        }

        if (selectedPlan === "starter") {
          // Starter: create Stripe customer/subscription server-side
          await setupStarterSubscriptionAction().catch(() => {});
        } else {
          // Pro: sync subscription from Stripe (fallback if webhook hasn't fired yet)
          await syncAfterCheckoutAction().catch(() => {});
        }

        toast.success(t("completion.toast"));
        window.location.href = `/${locale}/admin/dashboard`;
      } catch {
        toast.error(t("errors.saveFailed"));
        setIsSubmitting(false);
      }
    },
  });

  // Save draft on step change (not on every keystroke to avoid re-renders)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveOnboardingDraftAction({
        step: currentStep,
        values: form.state.values as Record<string, unknown>,
      }).catch(() => {});
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const stepLabels = [
    t("steps.workDays.title"),
    t("steps.workHours.title"),
    t("steps.shiftTypes.title"),
  ];

  const stepDescriptions = [
    t("steps.workDays.description"),
    t("steps.workHours.description"),
    t("steps.shiftTypes.description"),
  ];

  const validateCurrentStep = (): boolean => {
    const values = form.state.values;
    switch (currentStep) {
      case 0:
        return values.workDays.length >= 1;
      case 1:
        return (
          /^\d{2}:\d{2}$/.test(values.defaultStartTime) &&
          /^\d{2}:\d{2}$/.test(values.defaultEndTime) &&
          values.defaultEndTime > values.defaultStartTime
        );
      case 2:
        return (
          values.shiftTypes.length >= 1 &&
          values.shiftTypes.every(
            (st) =>
              st.name.length > 0 &&
              st.code.length > 0 &&
              /^\d{2}:\d{2}$/.test(st.startTime) &&
              /^\d{2}:\d{2}$/.test(st.endTime) &&
              st.endTime > st.startTime &&
              /^#[0-9A-Fa-f]{6}$/.test(st.color),
          )
        );
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      const next = Math.min(currentStep + 1, TOTAL_STEPS - 1);
      setCurrentStep(next);
      setMaxStepReached((prev) => Math.max(prev, next));
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
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
      {/* Left: stepper + header — sticky so it stays visible while content scrolls */}
      <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <StepIndicator
          currentStep={currentStep}
          maxStepReached={maxStepReached}
          totalSteps={TOTAL_STEPS}
          stepLabels={stepLabels}
          onStepClick={(step) => {
            if (step <= maxStepReached) setCurrentStep(step);
          }}
        />
      </div>

      {/* Right: step content */}
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
        <Card className="border bg-card rounded-2xl">
          <CardContent className="pt-6">
            <div className="space-y-1 mb-5">
              <h2 className="text-lg font-semibold">{stepLabels[currentStep]}</h2>
              <p className="text-sm text-muted-foreground">{stepDescriptions[currentStep]}</p>
            </div>

            {currentStep === 0 ? (
              <StepWorkDays form={form} />
            ) : currentStep === 1 ? (
              <StepWorkHours form={form} />
            ) : (
              <StepShiftTypes form={form} />
            )}
          </CardContent>

          <CardFooter className="flex justify-between pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {tNav("previous")}
            </Button>

            {isLastStep ? (
              <Button
                type="submit"
                disabled={!canProceed || isSubmitting}
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
              >
                {tNav("next")}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
