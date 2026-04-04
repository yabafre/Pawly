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
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useRegister } from "../_hooks/useRegister";
import { registerAdminInputSchema } from "@pawly/validators";

interface RegisterPageClientProps {
  selectedPlan: "starter" | "professional";
}

export function RegisterPageClient({ selectedPlan }: RegisterPageClientProps) {
  const t = useTranslations("register");
  const tPwd = useTranslations("auth.resetPassword");

  const [clinicName, setClinicName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { register, isPending } = useRegister();

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

    if (selectedPlan === "professional") {
      sessionStorage.setItem("pawly_selected_plan", "professional");
    }

    register({
      clinicName: clinicName.trim(),
      adminName: adminName.trim(),
      email: email.trim().toLowerCase(),
      password,
      turnstileToken,
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
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="absolute top-4 left-4">
            <LanguageSwitcher />
          </div>

          <div className="relative flex flex-col items-center gap-1.5 mb-8">
            <Button variant="outline" size="icon" asChild className="rounded-full absolute left-0 top-0">
              <Link href="/pricing" aria-label={t("backToPricing")}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <PawlyLogo />
            <p className="text-xs text-muted-foreground">{t("tagline")}</p>
          </div>

          <Card className="border bg-card">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl font-bold tracking-tight">{t("title")}</CardTitle>
              <CardDescription>{t("subtitle")}</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="clinicName" className="font-medium">{t("clinicName")}</Label>
                  <Input
                    id="clinicName"
                    type="text"
                    placeholder={t("clinicNamePlaceholder")}
                    value={clinicName}
                    onChange={(e) => { setClinicName(e.target.value); clearError("clinicName"); }}
                    aria-invalid={!!errors.clinicName}
                    className="h-10"
                  />
                  {errors.clinicName && <p className="text-[11px] text-destructive">{errors.clinicName}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminName" className="font-medium">{t("adminName")}</Label>
                  <Input
                    id="adminName"
                    type="text"
                    placeholder={t("adminNamePlaceholder")}
                    value={adminName}
                    onChange={(e) => { setAdminName(e.target.value); clearError("adminName"); }}
                    aria-invalid={!!errors.adminName}
                    className="h-10"
                  />
                  {errors.adminName && <p className="text-[11px] text-destructive">{errors.adminName}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="font-medium">{t("email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                    aria-invalid={!!errors.email}
                    className="h-10"
                  />
                  {errors.email && <p className="text-[11px] text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="font-medium">{t("password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                    aria-invalid={!!errors.password}
                    className="h-10"
                  />
                  {errors.password && <p className="text-[11px] text-destructive">{errors.password}</p>}
                  <PasswordStrength password={password} translations={passwordTranslations} />
                </div>

                <TurnstileBox onVerify={setTurnstileToken} className="mb-2" />

                <Button type="submit" className="w-full gap-2" disabled={isPending}>
                  {isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {t("submitting")}</>
                  ) : (
                    <>{t("submitButton")} <ArrowRight className="w-4 h-4" /></>
                  )}
                </Button>
              </form>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                {t("alreadyHaveAccount")}{" "}
                <Link href="/login" className="text-primary font-medium hover:underline">
                  {t("loginLink")}
                </Link>
              </p>
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
