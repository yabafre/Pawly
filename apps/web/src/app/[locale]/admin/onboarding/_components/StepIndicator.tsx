"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface StepIndicatorProps {
  currentStep: number;
  maxStepReached: number;
  totalSteps: number;
  stepLabels: string[];
  onStepClick?: (step: number) => void;
}

export function StepIndicator({
  currentStep,
  maxStepReached,
  totalSteps,
  stepLabels,
  onStepClick,
}: StepIndicatorProps) {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: totalSteps }).map((_, index) => {
        const isCurrent = index === currentStep;
        // A step is "visited" if it was reached before but isn't the current one
        const isVisited = index <= maxStepReached && !isCurrent;
        const isClickable = onStepClick && index <= maxStepReached;

        return (
          <div key={index} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(index)}
                className={cn(
                  "w-8 h-8 rounded-full text-xs font-bold transition-all",
                  isVisited && "bg-primary text-primary-foreground hover:bg-primary/90",
                  isCurrent && "border-2 border-primary text-primary bg-card hover:bg-card",
                  !isVisited && !isCurrent && "border-2 border-border text-muted-foreground bg-card hover:bg-card",
                  isClickable && "!cursor-pointer hover:ring-2 hover:ring-primary/30",
                )}
              >
                {isVisited ? <Check className="w-4 h-4" /> : index + 1}
              </Button>
              {index < totalSteps - 1 && (
                <div
                  className={cn(
                    "w-0.5 h-6 transition-all",
                    index < maxStepReached ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>
            <Button
              type="button"
              variant="link"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(index)}
              className={cn(
                "h-auto p-0 pt-1.5 text-sm font-medium text-left justify-start no-underline hover:no-underline",
                isCurrent ? "text-foreground" : isVisited ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/60",
                isClickable && "!cursor-pointer",
              )}
            >
              {stepLabels[index]}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
