"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { resetPasswordAction } from "../../login/_actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { PawlyLogo } from "@/components/pawly-logo";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, ArrowRight, Eye, EyeOff, Check } from "lucide-react";

interface ResetPasswordClientProps {
  token?: string;
}

const RULES = [
  { key: "min8", test: (p: string) => p.length >= 8 },
  { key: "uppercase", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lowercase", test: (p: string) => /[a-z]/.test(p) },
  { key: "digit", test: (p: string) => /[0-9]/.test(p) },
] as const;

export function ResetPasswordClient({ token }: ResetPasswordClientProps) {
  const t = useTranslations("auth.resetPassword");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState(false);

  const { mutate, isPending } = useServerActionMutation(resetPasswordAction, {
    onSuccess: (data) => {
      setSuccess(true);
      // Cookie is set by server action — redirect to admin dashboard
      if (data?.user?.role === "ADMIN") {
        setTimeout(() => router.push("/admin/dashboard"), 1500);
      }
    },
    onError: () => setApiError(true),
  });

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return <Shell><ErrorState t={t} /></Shell>;
  }

  if (apiError) {
    return <Shell><ErrorState t={t} /></Shell>;
  }

  if (success) {
    return (
      <Shell>
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{t("successTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("successMessage")}</p>
          <Button className="rounded-xl" asChild>
            <Link href="/login">
              {t("goToLogin")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const allRulesPass = RULES.every((r) => r.test(password));
  const passwordsMatch = password.length > 0 && password === passwordConfirm;
  const canSubmit = allRulesPass && passwordsMatch && !isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutate({ token, password });
  };

  return (
    <Shell>
      <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-sm font-medium">
              {t("passwordLabel")}
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                className="rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password strength */}
          <PasswordStrength password={password} t={t} />

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-sm font-medium">
              {t("confirmLabel")}
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                className="rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordConfirm.length > 0 && !passwordsMatch && (
              <p className="text-xs text-destructive">{t("mismatch")}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl"
          >
            {isPending ? t("submitting") : t("submitButton")}
          </Button>
        </form>
      </div>
    </Shell>
  );
}

function PasswordStrength({ password, t }: { password: string; t: ReturnType<typeof useTranslations> }) {
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
      ? t("strength.empty")
      : passCount <= 2
        ? t("strength.weak")
        : passCount <= 3
          ? t("strength.medium")
          : t("strength.strong");

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
        <span className="text-xs text-muted-foreground">{t("passwordHint")}</span>
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
                {t(`rules.${rule.key}`)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <PawlyLogo />
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorState({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <h1 className="text-xl font-bold text-foreground">{t("errorTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("errorMessage")}</p>
      <Button variant="outline" className="rounded-xl" asChild>
        <Link href="/forgot-password">{t("requestNew")}</Link>
      </Button>
    </div>
  );
}
