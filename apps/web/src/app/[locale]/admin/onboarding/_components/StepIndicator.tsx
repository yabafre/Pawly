"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export function StepIndicator({
  currentStep,
  totalSteps,
  stepLabels,
}: StepIndicatorProps) {
  const t = useTranslations("onboarding");

  return (
    <div className="w-full">
      <p className="text-sm text-neutral-500 text-center mb-6">
        {t("progress", { current: currentStep + 1, total: totalSteps })}
      </p>
      <div className="flex items-center justify-center gap-0">
        {Array.from({ length: totalSteps }).map((_, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <div key={index} className="flex items-center">
              {/* Step circle */}
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                  transition-all duration-300
                  ${
                    isCompleted
                      ? "bg-[#009588] text-white"
                      : isCurrent
                        ? "border-2 border-[#009588] text-[#009588] bg-white"
                        : "border-2 border-neutral-200 text-neutral-400 bg-white"
                  }
                `}
                title={stepLabels[index]}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : index + 1}
              </div>

              {/* Connecting line */}
              {index < totalSteps - 1 && (
                <div
                  className={`
                    w-12 h-0.5 transition-all duration-300
                    ${index < currentStep ? "bg-[#009588]" : "bg-neutral-200"}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
