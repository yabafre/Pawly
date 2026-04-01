"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { requestPasswordResetAction } from "../../login/_actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PawlyLogo } from "@/components/pawly-logo";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";

export function ForgotPasswordClient() {
  const t = useTranslations("auth.forgotPassword");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const { mutate, isPending } = useServerActionMutation(
    requestPasswordResetAction,
    {
      onSuccess: () => setSent(true),
      onError: () => setSent(true), // Always show success (prevent enumeration)
    },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    mutate({ email: email.trim() });
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <PawlyLogo />
        </div>

        {sent ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">{t("successTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("successMessage")}</p>
            <Button variant="outline" className="rounded-xl" asChild>
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("backToLogin")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
              <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reset-email" className="text-sm font-medium">
                  {t("emailLabel")}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("emailPlaceholder")}
                    required
                    autoFocus
                    className="rounded-xl pl-10"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isPending || !email.trim()}
                className="w-full rounded-xl"
              >
                {isPending ? t("submitting") : t("submitButton")}
              </Button>
            </form>

            <div className="text-center">
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
                {t("backToLogin")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
