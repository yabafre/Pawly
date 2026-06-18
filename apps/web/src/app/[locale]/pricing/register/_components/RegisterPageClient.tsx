'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { PawlyLogo } from '@/components/pawly-logo';
import { FallingAnimals } from '@/components/ui/falling-animals';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PasswordStrength } from '@/components/ui/password-strength';
import { TurnstileBox } from '@/components/turnstile';
import { ArrowLeft, ArrowRight, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useRegister } from '../_hooks/useRegister';
import { registerAdminInputSchema } from '@pawly/validators';

/** Map TanStack Form errors (strings) to FieldError-compatible format */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toFieldErrors = (errors: any[]): Array<{ message?: string } | undefined> =>
  errors.map((e) => (typeof e === 'string' ? { message: e } : e));

interface RegisterPageClientProps {
  selectedPlan: 'starter' | 'professional';
}

export function RegisterPageClient({ selectedPlan }: RegisterPageClientProps) {
  const t = useTranslations('register');
  const tPwd = useTranslations('auth.resetPassword');
  const locale = useLocale() as 'fr' | 'en';

  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  const { register, isPending, serverError, clearServerError } = useRegister(selectedPlan);

  const form = useForm({
    defaultValues: {
      clinicName: '',
      adminName: '',
      email: '',
      password: '',
    },
    validators: {
      onSubmit: registerAdminInputSchema.omit({ turnstileToken: true }),
    },
    onSubmit: async ({ value }) => {
      clearServerError();
      register({
        clinicName: value.clinicName.trim(),
        adminName: value.adminName.trim(),
        email: value.email.trim().toLowerCase(),
        password: value.password,
        turnstileToken,
        locale,
      });
    },
  });

  const passwordTranslations = {
    hint: tPwd('passwordHint'),
    empty: tPwd('strength.empty'),
    weak: tPwd('strength.weak'),
    medium: tPwd('strength.medium'),
    strong: tPwd('strength.strong'),
    rules: {
      min8: tPwd('rules.min8'),
      uppercase: tPwd('rules.uppercase'),
      lowercase: tPwd('rules.lowercase'),
      digit: tPwd('rules.digit'),
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
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full shrink-0 h-8 w-8"
                  asChild
                >
                  <Link href="/#pricing" aria-label={t('backToPricing')}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <PawlyLogo />
              </div>
              <CardTitle className="text-lg font-bold tracking-tight">{t('title')}</CardTitle>
              <CardDescription className="text-xs">{t('subtitle')}</CardDescription>
            </CardHeader>

            <CardContent>
              {/* Server error banner */}
              {serverError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-4 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  form.handleSubmit();
                }}
                className="space-y-3"
                noValidate
              >
                <form.Field
                  name="clinicName"
                  children={(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name} className="text-sm">
                          {t('clinicName')}
                        </FieldLabel>
                        <Input
                          id={field.name}
                          type="text"
                          placeholder={t('clinicNamePlaceholder')}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                          className="h-9"
                        />
                        {isInvalid && (
                          <FieldError
                            errors={toFieldErrors(field.state.meta.errors)}
                            className="text-[11px]"
                          />
                        )}
                      </Field>
                    );
                  }}
                />

                <div className="grid grid-cols-2 gap-3">
                  <form.Field
                    name="adminName"
                    children={(field) => {
                      const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name} className="text-sm">
                            {t('adminName')}
                          </FieldLabel>
                          <Input
                            id={field.name}
                            type="text"
                            placeholder={t('adminNamePlaceholder')}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={isInvalid}
                            className="h-9"
                          />
                          {isInvalid && (
                            <FieldError
                              errors={toFieldErrors(field.state.meta.errors)}
                              className="text-[11px]"
                            />
                          )}
                        </Field>
                      );
                    }}
                  />

                  <form.Field
                    name="email"
                    children={(field) => {
                      const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name} className="text-sm">
                            {t('email')}
                          </FieldLabel>
                          <Input
                            id={field.name}
                            type="email"
                            placeholder={t('emailPlaceholder')}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={isInvalid}
                            className="h-9"
                          />
                          {isInvalid && (
                            <FieldError
                              errors={toFieldErrors(field.state.meta.errors)}
                              className="text-[11px]"
                            />
                          )}
                        </Field>
                      );
                    }}
                  />
                </div>

                <form.Field
                  name="password"
                  children={(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name} className="text-sm">
                          {t('password')}
                        </FieldLabel>
                        <div className="relative">
                          <Input
                            id={field.name}
                            type={showPassword ? 'text' : 'password'}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={isInvalid}
                            className="h-9 pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {isInvalid && (
                          <FieldError
                            errors={toFieldErrors(field.state.meta.errors)}
                            className="text-[11px]"
                          />
                        )}
                        <PasswordStrength
                          password={field.state.value}
                          translations={passwordTranslations}
                        />
                      </Field>
                    );
                  }}
                />

                <TurnstileBox onVerify={setTurnstileToken} />

                <Button type="submit" className="w-full gap-2" disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> {t('submitting')}
                    </>
                  ) : (
                    <>
                      {t('submitButton')} <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  {t('alreadyHaveAccount')}{' '}
                  <Link href="/login" className="text-primary font-medium hover:underline">
                    {t('loginLink')}
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
