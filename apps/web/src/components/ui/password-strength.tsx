"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const RULES = [
  { key: "min8", test: (p: string) => p.length >= 8 },
  { key: "uppercase", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lowercase", test: (p: string) => /[a-z]/.test(p) },
  { key: "digit", test: (p: string) => /[0-9]/.test(p) },
] as const;

export { RULES as PASSWORD_RULES };

export function allPasswordRulesPass(password: string) {
  return RULES.every((r) => r.test(password));
}

interface PasswordStrengthProps {
  password: string;
  translations: {
    hint: string;
    empty: string;
    weak: string;
    medium: string;
    strong: string;
    rules: Record<string, string>;
  };
}

export function PasswordStrength({ password, translations: t }: PasswordStrengthProps) {
  const passCount = RULES.filter((r) => r.test(password)).length;
  const percent = (passCount / RULES.length) * 100;

  const indicatorColor =
    passCount === 0
      ? "[&>[data-slot=progress-indicator]]:bg-border"
      : passCount <= 1
        ? "[&>[data-slot=progress-indicator]]:bg-destructive"
        : passCount <= 2
          ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
          : passCount <= 3
            ? "[&>[data-slot=progress-indicator]]:bg-amber-400"
            : "[&>[data-slot=progress-indicator]]:bg-primary";

  const label =
    passCount === 0
      ? t.empty
      : passCount <= 2
        ? t.weak
        : passCount <= 3
          ? t.medium
          : t.strong;

  const labelColor =
    passCount === 0
      ? "text-muted-foreground"
      : passCount <= 2
        ? "text-destructive"
        : passCount <= 3
          ? "text-amber-500"
          : "text-primary";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t.hint}</span>
        <span className={cn("text-xs font-medium", labelColor)}>
          {label}
        </span>
      </div>
      <Progress
        value={percent}
        className={cn("h-1.5", indicatorColor)}
      />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {RULES.map((rule) => {
          const passes = rule.test(password);
          return (
            <div key={rule.key} className="flex items-center gap-1.5">
              {passes ? (
                <Check className="h-3 w-3 text-primary shrink-0" />
              ) : (
                <div className="h-3 w-3 rounded-full border border-border shrink-0" />
              )}
              <span className={`text-[11px] ${passes ? "text-foreground" : "text-muted-foreground"}`}>
                {t.rules[rule.key]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
