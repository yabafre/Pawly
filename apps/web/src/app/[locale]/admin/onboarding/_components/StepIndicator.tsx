"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: totalSteps }).map((_, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <div key={index} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent && "border-2 border-primary text-primary bg-card",
                  !isCompleted && !isCurrent && "border-2 border-border text-muted-foreground bg-card",
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
              </div>
              {index < totalSteps - 1 && (
                <div
                  className={cn(
                    "w-0.5 h-6 transition-all",
                    index < currentStep ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "text-sm pt-1.5 font-medium",
                isCurrent ? "text-foreground" : isCompleted ? "text-muted-foreground" : "text-muted-foreground/60",
              )}
            >
              {stepLabels[index]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
