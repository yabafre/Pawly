"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/app/[locale]/(auth)/login/_hooks/useAuth";
import { ArrowRight, Check } from "lucide-react";
import { requestMagicLinkSchema } from "@pawly/validators";
import { useTranslations } from "next-intl";

export const MagicLinkForm = () => {
    const [submittedEmail, setSubmittedEmail] = useState("");
    const { requestMagicLink, isMagicPending, isMagicSuccess, resetMagicLink } = useAuth();
    const t = useTranslations("auth.magicLink");
    const tErrors = useTranslations("auth.errors");

    const form = useForm({
        defaultValues: {
            email: "",
        },
        onSubmit: async ({ value }) => {
            setSubmittedEmail(value.email);
            await requestMagicLink(value.email);
        },
    });

    if (isMagicSuccess) {
        return (
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl text-center space-y-3 py-8 mt-6">
                <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-indigo-600/20">
                    <Check className="w-6 h-6 text-white" />
                </div>
                <div className="space-y-1">
                    <p className="font-bold text-indigo-900">{t("checkEmail")}</p>
                    <p className="text-sm text-indigo-700">{t("linkSent")} <br /><span className="font-semibold">{submittedEmail}</span></p>
                </div>
                <Button
                    variant="link"
                    type="button"
                    onClick={() => {
                        setSubmittedEmail("");
                        form.setFieldValue("email", "");
                        resetMagicLink();
                    }}
                    className="text-indigo-600 font-semibold"
                >
                    {t("resendLink")}
                </Button>
            </div>
        );
    }

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
            className="space-y-5 pt-6"
        >
            <form.Field
                name="email"
                validators={{
                    onChange: ({ value }) => {
                        const result = requestMagicLinkSchema.shape.email.safeParse(value);
                        return result.success ? undefined : result.error.issues[0]?.message ?? tErrors("invalidEmail");
                    },
                }}
            >
                {(field) => (
                    <div className="space-y-2">
                        <Label htmlFor={field.name} className="text-neutral-900 font-medium">{t("emailLabel")}</Label>
                        <Input
                            id={field.name}
                            type="email"
                            placeholder={t("emailPlaceholder")}
                            required
                            aria-invalid={field.state.meta.errors.length > 0}
                            aria-describedby={field.state.meta.errors.length > 0 ? `${field.name}-error` : undefined}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            className="h-12"
                        />
                        {field.state.meta.errors.length > 0 && (
                            <p id={`${field.name}-error`} className="text-[11px] text-orange-600" role="alert" aria-live="assertive">{field.state.meta.errors[0]}</p>
                        )}
                        <p className="text-[11px] text-neutral-400 mt-2">
                            {t("helper")}
                        </p>
                    </div>
                )}
            </form.Field>

            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
                {([canSubmit, isSubmitting]) => (
                    <Button
                        type="submit"
                        size="lg"
                        className="w-full font-bold"
                        disabled={!canSubmit || isSubmitting || isMagicPending}
                    >
                        {isMagicPending ? t("submitting") : <span className="flex items-center gap-2">{t("submitButton")} <ArrowRight className="w-4 h-4" /></span>}
                    </Button>
                )}
            </form.Subscribe>
        </form>
    );
};
