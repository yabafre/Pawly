"use client";

import { useState, useRef } from "react";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/app/[locale]/(auth)/login/_hooks/useAuth";
import { ArrowRight, Check, ArrowLeft, RefreshCw } from "lucide-react";
import { requestOtpSchema } from "@pawly/validators";
import { useTranslations } from "next-intl";
import { OtpInput, type OtpInputHandle } from "./OtpInput";

type Stage = "email" | "otp" | "magic_link_fallback";

export const MagicLinkForm = () => {
    const [stage, setStage] = useState<Stage>("email");
    const [submittedEmail, setSubmittedEmail] = useState("");
    const otpInputRef = useRef<OtpInputHandle>(null);
    const {
        requestOtp,
        verifyOtp,
        isOtpRequestPending,
        isOtpVerifyPending,
    } = useAuth();
    const t = useTranslations("auth.magicLink");
    const tOtp = useTranslations("auth.otp");
    const tErrors = useTranslations("auth.errors");

    const form = useForm({
        defaultValues: {
            email: "",
        },
        onSubmit: async ({ value }) => {
            setSubmittedEmail(value.email);
            const method = await requestOtp(value.email);

            if (method === "otp") {
                setStage("otp");
            } else if (method === "magic_link") {
                setStage("magic_link_fallback");
            }
        },
    });

    const handleOtpComplete = async (code: string) => {
        const success = await verifyOtp(submittedEmail, code);
        if (!success) {
            otpInputRef.current?.clear();
        }
    };

    const handleResendCode = async () => {
        const method = await requestOtp(submittedEmail);
        if (method === "magic_link") {
            setStage("magic_link_fallback");
        }
    };

    const handleBack = () => {
        setStage("email");
        setSubmittedEmail("");
    };

    // Stage: Magic Link fallback
    if (stage === "magic_link_fallback") {
        return (
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl text-center space-y-3 py-8 mt-6">
                <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-indigo-600/20">
                    <Check className="w-6 h-6 text-white" />
                </div>
                <div className="space-y-1">
                    <p className="font-bold text-indigo-900">{t("fallbackMessage")}</p>
                    <p className="text-sm text-indigo-700">
                        {t("fallbackHelper")}
                        <br />
                        <span className="font-semibold">{submittedEmail}</span>
                    </p>
                </div>
                <Button
                    variant="link"
                    type="button"
                    onClick={handleBack}
                    className="text-indigo-600 font-semibold"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    {tOtp("back")}
                </Button>
            </div>
        );
    }

    // Stage: OTP input
    if (stage === "otp") {
        return (
            <div className="space-y-6 pt-6">
                <div className="text-center space-y-2">
                    <p className="text-sm font-medium text-neutral-900">{tOtp("enterCode")}</p>
                    <p className="text-xs text-neutral-500">
                        {tOtp("sentTo")} <span className="font-semibold">{submittedEmail}</span>
                    </p>
                </div>

                <OtpInput
                    ref={otpInputRef}
                    onComplete={handleOtpComplete}
                    disabled={isOtpVerifyPending}
                />

                {isOtpVerifyPending && (
                    <p className="text-center text-sm text-neutral-500">{tOtp("verifying")}</p>
                )}

                <p className="text-center text-[11px] text-neutral-400">{tOtp("codeExpiry")}</p>

                <div className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={handleBack}
                        disabled={isOtpVerifyPending}
                    >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        {tOtp("back")}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={handleResendCode}
                        disabled={isOtpRequestPending || isOtpVerifyPending}
                    >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        {isOtpRequestPending ? tOtp("resending") : tOtp("resendCode")}
                    </Button>
                </div>
            </div>
        );
    }

    // Stage: Email input (default)
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
                        const result = requestOtpSchema.shape.email.safeParse(value);
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
                        disabled={!canSubmit || isSubmitting || isOtpRequestPending}
                    >
                        {isOtpRequestPending ? t("submitting") : <span className="flex items-center gap-2">{t("submitButton")} <ArrowRight className="w-4 h-4" /></span>}
                    </Button>
                )}
            </form.Subscribe>
        </form>
    );
};
