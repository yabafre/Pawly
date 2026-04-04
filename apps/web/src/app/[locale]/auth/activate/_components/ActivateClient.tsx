"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActivateAccount } from "../_hooks/useActivateAccount";
import { activateAccountBaseSchema } from "@pawly/validators";

type ActivateClientProps = {
    token?: string;
};

export const ActivateClient = ({ token }: ActivateClientProps) => {
    const t = useTranslations("auth.activate");
    const tErrors = useTranslations("auth.errors");
    const { activateAccount, isPending } = useActivateAccount();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const form = useForm({
        defaultValues: {
            password: "",
            passwordConfirm: "",
        },
        onSubmit: async ({ value }) => {
            if (!token) return;
            await activateAccount(token, value.password);
        },
    });

    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden px-6">
                <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-primary/5 blur-[120px] rounded-full mix-blend-multiply pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-orange-500/5 blur-[120px] rounded-full mix-blend-multiply pointer-events-none" />
                <Card className="w-full max-w-md text-center shadow-[0_8px_30px_rgba(0,0,0,0.04)] border-border bg-card/90 backdrop-blur-sm">
                    <CardHeader className="space-y-3">
                        <div className="mx-auto w-12 h-12 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-orange-500" />
                        </div>
                        <CardTitle className="text-xl font-bold text-foreground">
                            {t("invalidToken")}
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                            {t("tokenMissing")}
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden px-6">
            <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-primary/5 blur-[120px] rounded-full mix-blend-multiply pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-orange-500/5 blur-[120px] rounded-full mix-blend-multiply pointer-events-none" />

            <Card className="w-full max-w-md shadow-[0_8px_30px_rgba(0,0,0,0.04)] border-border bg-card/90 backdrop-blur-sm">
                <CardHeader className="space-y-1 pb-4">
                    <div className="mx-auto w-12 h-12 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center mb-2">
                        <Lock className="w-6 h-6 text-teal-600" />
                    </div>
                    <CardTitle className="text-xl font-bold text-foreground text-center">
                        {t("title")}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground text-center">
                        {t("subtitle")}
                    </CardDescription>
                </CardHeader>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void form.handleSubmit();
                    }}
                    className="space-y-5 px-6 pb-6"
                >
                    <form.Field
                        name="password"
                        validators={{
                            onChange: ({ value }) => {
                                const result = activateAccountBaseSchema.shape.password.safeParse(value);
                                return result.success ? undefined : result.error.issues[0]?.message ?? tErrors("generic");
                            },
                        }}
                    >
                        {(field: any) => (
                            <div className="space-y-2">
                                <Label htmlFor={field.name} className="text-foreground font-medium">
                                    {t("passwordLabel")}
                                </Label>
                                <div className="relative">
                                    <Input
                                        id={field.name}
                                        type={showPassword ? "text" : "password"}
                                        required
                                        aria-invalid={field.state.meta.errors.length > 0}
                                        aria-describedby={field.state.meta.errors.length > 0 ? `${field.name}-error` : undefined}
                                        value={field.state.value}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value)}
                                        onBlur={field.handleBlur}
                                        className="bg-muted border-border focus:bg-card h-12 pr-10 focus-visible:border-indigo-500 focus-visible:ring-indigo-500/20"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">{t("passwordHint")}</p>
                                {field.state.meta.errors.length > 0 && (
                                    <p id={`${field.name}-error`} className="text-[11px] text-destructive" role="alert" aria-live="assertive">
                                        {field.state.meta.errors[0]}
                                    </p>
                                )}
                            </div>
                        )}
                    </form.Field>

                    <form.Field
                        name="passwordConfirm"
                        validators={{
                            onChangeListenTo: ["password"],
                            onChange: ({ value, fieldApi }) => {
                                if (value && value !== fieldApi.form.getFieldValue("password")) {
                                    return t("passwordMismatch");
                                }
                                return undefined;
                            },
                        }}
                    >
                        {(field: any) => (
                            <div className="space-y-2">
                                <Label htmlFor={field.name} className="text-foreground font-medium">
                                    {t("confirmLabel")}
                                </Label>
                                <div className="relative">
                                    <Input
                                        id={field.name}
                                        type={showConfirm ? "text" : "password"}
                                        required
                                        aria-invalid={field.state.meta.errors.length > 0}
                                        aria-describedby={field.state.meta.errors.length > 0 ? `${field.name}-error` : undefined}
                                        value={field.state.value}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value)}
                                        onBlur={field.handleBlur}
                                        className="bg-muted border-border focus:bg-card h-12 pr-10 focus-visible:border-indigo-500 focus-visible:ring-indigo-500/20"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                                        tabIndex={-1}
                                    >
                                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                {field.state.meta.errors.length > 0 && (
                                    <p id={`${field.name}-error`} className="text-[11px] text-destructive" role="alert" aria-live="assertive">
                                        {field.state.meta.errors[0]}
                                    </p>
                                )}
                            </div>
                        )}
                    </form.Field>

                    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
                        {([canSubmit, isSubmitting]) => (
                            <Button
                                type="submit"
                                className="w-full bg-foreground hover:bg-black text-white font-bold h-12 shadow-lg shadow-foreground/10 transition-all hover:scale-[1.01]"
                                disabled={!canSubmit || isSubmitting || isPending}
                            >
                                {isPending ? t("submitting") : (
                                    <span className="flex items-center gap-2">
                                        {t("submitButton")} <ArrowRight className="w-4 h-4" />
                                    </span>
                                )}
                            </Button>
                        )}
                    </form.Subscribe>
                </form>
            </Card>
        </div>
    );
};
