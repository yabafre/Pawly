"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PawlyLogo } from "@/components/pawly-logo";
import { FallingAnimals } from "@/components/ui/falling-animals";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PasswordStrength } from "@/components/ui/password-strength";
import { TurnstileBox } from "@/components/turnstile";
import { ArrowLeft, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useRegister } from "../_hooks/useRegister";
import { registerAdminInputSchema } from "@pawly/validators";

interface RegisterPageClientProps {
  selectedPlan: "starter" | "professional";
}

export function RegisterPageClient({ selectedPlan }: RegisterPageClientProps) {
  const t = useTranslations("register");
  const tPwd = useTranslations("auth.resetPassword");
  const locale = useLocale() as "fr" | "en";

  const [clinicName, setClinicName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { register, isPending } = useRegister(selectedPlan);

  const validate = () => {
    const result = registerAdminInputSchema.safeParse({
      clinicName,
      adminName,
      email,
      password,
      turnstileToken: turnstileToken || "pending",
    });

    if (result.success) {
      setErrors({});
      return true;
    }

    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as string;
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    setErrors(fieldErrors);
    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    register({
      clinicName: clinicName.trim(),
      adminName: adminName.trim(),
      email: email.trim().toLowerCase(),
      password,
      turnstileToken,
      locale,
    });
  };

  const clearError = (field: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const passwordTranslations = {
    hint: tPwd("passwordHint"),
    empty: tPwd("strength.empty"),
    weak: tPwd("strength.weak"),
    medium: tPwd("strength.medium"),
    strong: tPwd("strength.strong"),
    rules: {
      min8: tPwd("rules.min8"),
      uppercase: tPwd("rules.uppercase"),
      lowercase: tPwd("rules.lowercase"),
      digit: tPwd("rules.digit"),
    },
  };

  return (
    <div className="min-h-dvh flex bg-background">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-[420px]">
          <div className="absolute top-4 left-4">
            <LanguageSwitcher />
          </div>

          <Card className="border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 mb-1">
                <Button variant="outline" size="icon" asChild className="rounded-full shrink-0 h-8 w-8">
                  <Link href="/pricing" aria-label={t("backToPricing")}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <PawlyLogo />
              </div>
              <CardTitle className="text-lg font-bold tracking-tight">{t("title")}</CardTitle>
              <CardDescription className="text-xs">{t("subtitle")}</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="clinicName" className="text-sm">{t("clinicName")}</Label>
                  <Input
                    id="clinicName"
                    type="text"
                    placeholder={t("clinicNamePlaceholder")}
                    value={clinicName}
                    onChange={(e) => { setClinicName(e.target.value); clearError("clinicName"); }}
                    aria-invalid={!!errors.clinicName}
                    className="h-9"
                  />
                  {errors.clinicName && <p className="text-[11px] text-destructive">{errors.clinicName}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="adminName" className="text-sm">{t("adminName")}</Label>
                    <Input
                      id="adminName"
                      type="text"
                      placeholder={t("adminNamePlaceholder")}
                      value={adminName}
                      onChange={(e) => { setAdminName(e.target.value); clearError("adminName"); }}
                      aria-invalid={!!errors.adminName}
                      className="h-9"
                    />
                    {errors.adminName && <p className="text-[11px] text-destructive">{errors.adminName}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm">{t("email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t("emailPlaceholder")}
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                      aria-invalid={!!errors.email}
                      className="h-9"
                    />
                    {errors.email && <p className="text-[11px] text-destructive">{errors.email}</p>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm">{t("password")}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                      aria-invalid={!!errors.password}
                      className="h-9 pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-[11px] text-destructive">{errors.password}</p>}
                  <PasswordStrength password={password} translations={passwordTranslations} />
                </div>

                <TurnstileBox onVerify={setTurnstileToken} />

                <Button type="submit" className="w-full gap-2" disabled={isPending}>
                  {isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {t("submitting")}</>
                  ) : (
                    <>{t("submitButton")} <ArrowRight className="w-4 h-4" /></>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  {t("alreadyHaveAccount")}{" "}
                  <Link href="/login" className="text-primary font-medium hover:underline">
                    {t("loginLink")}
                  </Link>
                </p>
              </form>
            </CardContent>
          </Card>
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
