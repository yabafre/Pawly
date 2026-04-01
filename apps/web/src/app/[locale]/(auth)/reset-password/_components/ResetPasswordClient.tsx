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
import { PasswordStrength, allPasswordRulesPass } from "@/components/ui/password-strength";
import { PawlyLogo } from "@/components/pawly-logo";
import { FallingAnimals } from "@/components/ui/falling-animals";
import { CheckCircle2, AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";

interface ResetPasswordClientProps {
  token?: string;
}

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

  const allRulesPass = allPasswordRulesPass(password);
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
          <PasswordStrength
            password={password}
            translations={{
              hint: t("passwordHint"),
              empty: t("strength.empty"),
              weak: t("strength.weak"),
              medium: t("strength.medium"),
              strong: t("strength.strong"),
              rules: {
                min8: t("rules.min8"),
                uppercase: t("rules.uppercase"),
                lowercase: t("rules.lowercase"),
                digit: t("rules.digit"),
              },
            }}
          />

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


function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex bg-background">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-1.5">
            <PawlyLogo />
          </div>
          {children}
        </div>
      </div>

      <div className="hidden lg:block w-1/2 relative">
        <FallingAnimals
          color="#009588"
          speed={0.6}
          size={18}
          gap={52}
          className="absolute inset-0 h-full w-full [mask-image:linear-gradient(to_right,transparent,black_30%)]"
        />
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
