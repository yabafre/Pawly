"use client";

import { useState, useRef } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PawlyLogo } from "@/components/pawly-logo";
import { Mail, Lock, ArrowLeft, ArrowRight, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { FallingAnimals } from "@/components/ui/falling-animals";
import { Link } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../_hooks/useAuth";
import { requestOtpSchema, loginSchema } from "@pawly/validators";
import { OtpInput, type OtpInputHandle } from "./OtpInput";

const roles = ["employee", "admin"] as const;
type Role = (typeof roles)[number];
type Stage = "form" | "otp" | "magic_link_fallback";

export const LoginPageClient = () => {
    const [activeRole, setActiveRole] = useState<Role>("employee");
    const [stage, setStage] = useState<Stage>("form");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [emailError, setEmailError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [submittedEmail, setSubmittedEmail] = useState("");
    const otpInputRef = useRef<OtpInputHandle>(null);

    const t = useTranslations("auth.login");
    const tMagic = useTranslations("auth.magicLink");
    const tOtp = useTranslations("auth.otp");
    const tErrors = useTranslations("auth.errors");
    const tBrand = useTranslations("brand");

    const {
        login, isLoginPending,
        requestOtp, isOtpRequestPending,
        verifyOtp, isOtpVerifyPending,
    } = useAuth();

    const roleIndex = roles.indexOf(activeRole);
    const isAdmin = activeRole === "admin";
    const isPending = isAdmin ? isLoginPending : isOtpRequestPending;

    const validateEmail = (val: string) => {
        const result = requestOtpSchema.shape.email.safeParse(val);
        return result.success ? "" : (result.error.issues[0]?.message ?? tErrors("invalidEmail"));
    };

    const validatePassword = (val: string) => {
        const result = loginSchema.shape.password.safeParse(val);
        return result.success ? "" : (result.error.issues[0]?.message ?? tErrors("passwordRequired"));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const eErr = validateEmail(email);
        setEmailError(eErr);
        if (eErr) return;

        if (isAdmin) {
            const pErr = validatePassword(password);
            setPasswordError(pErr);
            if (pErr) return;
            await login({ email, password });
        } else {
            setSubmittedEmail(email);
            const method = await requestOtp(email);
            if (method === "otp") setStage("otp");
            else if (method === "magic_link") setStage("magic_link_fallback");
        }
    };

    const handleOtpComplete = async (code: string) => {
        const success = await verifyOtp(submittedEmail, code);
        if (!success) otpInputRef.current?.clear();
    };

    const handleBack = () => {
        setStage("form");
        setSubmittedEmail("");
    };

    const clearErrors = () => { setEmailError(""); setPasswordError(""); };

    // OTP stage
    if (stage === "otp") {
        return (
            <LoginShell activeRole={activeRole} setActiveRole={setActiveRole} roleIndex={roleIndex} t={t} tBrand={tBrand} onTabSwitch={clearErrors}>
                <div className="space-y-6 pt-4">
                    <div className="text-center space-y-2">
                        <p className="text-sm font-medium">{tOtp("enterCode")}</p>
                        <p className="text-xs text-muted-foreground">
                            {tOtp("sentTo")} <span className="font-semibold">{submittedEmail}</span>
                        </p>
                    </div>
                    <OtpInput ref={otpInputRef} onComplete={handleOtpComplete} disabled={isOtpVerifyPending} />
                    {isOtpVerifyPending && <p className="text-center text-sm text-muted-foreground">{tOtp("verifying")}</p>}
                    <p className="text-center text-[11px] text-muted-foreground">{tOtp("codeExpiry")}</p>
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" type="button" onClick={handleBack} disabled={isOtpVerifyPending}>
                            <ArrowLeft className="w-4 h-4 mr-1" /> {tOtp("back")}
                        </Button>
                        <Button variant="ghost" size="sm" type="button" onClick={async () => {
                            const method = await requestOtp(submittedEmail);
                            if (method === "magic_link") setStage("magic_link_fallback");
                        }} disabled={isOtpRequestPending || isOtpVerifyPending}>
                            <RefreshCw className="w-4 h-4 mr-1" /> {isOtpRequestPending ? tOtp("resending") : tOtp("resendCode")}
                        </Button>
                    </div>
                </div>
            </LoginShell>
        );
    }

    // Magic link fallback stage
    if (stage === "magic_link_fallback") {
        return (
            <LoginShell activeRole={activeRole} setActiveRole={setActiveRole} roleIndex={roleIndex} t={t} tBrand={tBrand} onTabSwitch={clearErrors}>
                <div className="bg-primary/5 border border-primary/10 p-4 rounded-2xl text-center space-y-3 py-8 mt-4">
                    <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto">
                        <Check className="w-6 h-6 text-white" />
                    </div>
                    <div className="space-y-1">
                        <p className="font-bold">{tMagic("fallbackMessage")}</p>
                        <p className="text-sm text-muted-foreground">
                            {tMagic("fallbackHelper")}<br />
                            <span className="font-semibold">{submittedEmail}</span>
                        </p>
                    </div>
                    <Button variant="link" type="button" onClick={handleBack} className="text-primary font-semibold">
                        <ArrowLeft className="w-4 h-4 mr-1" /> {tOtp("back")}
                    </Button>
                </div>
            </LoginShell>
        );
    }

    // Default: form stage
    return (
        <LoginShell activeRole={activeRole} setActiveRole={setActiveRole} roleIndex={roleIndex} t={t} tBrand={tBrand} onTabSwitch={clearErrors}>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4" noValidate>
                {/* Email - always visible */}
                <div className="space-y-2">
                    <Label htmlFor="email" className="font-medium">{t("emailLabel")}</Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder={t("emailPlaceholder")}
                        required
                        aria-invalid={!!emailError}
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                        className="h-10"
                    />
                    {emailError && <p className="text-[11px] text-destructive">{emailError}</p>}
                    {!isAdmin && <p className="text-[11px] text-muted-foreground">{tMagic("helper")}</p>}
                </div>

                {/* Password - animated reveal for admin */}
                <AnimatePresence initial={false}>
                    {isAdmin && (
                        <motion.div
                            key="password"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className="overflow-hidden"
                        >
                            <div className="space-y-2 pb-1">
                                <Label htmlFor="password" className="font-medium">{t("passwordLabel")}</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    required
                                    aria-invalid={!!passwordError}
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                                    className="h-10"
                                />
                                {passwordError && <p className="text-[11px] text-destructive">{passwordError}</p>}
                                <Link
                                    href="/forgot-password"
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {t("forgotPassword")}
                                </Link>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <Button type="submit" className="w-full gap-2" disabled={isPending}>
                    {isPending ? t("submitting") : (
                        <>{isAdmin ? t("submitButton") : tMagic("submitButton")} <ArrowRight className="w-4 h-4" /></>
                    )}
                </Button>
            </form>
        </LoginShell>
    );
};

// Shared layout shell
function LoginShell({
    activeRole, setActiveRole, roleIndex, t, tBrand, children, onTabSwitch,
}: {
    activeRole: Role;
    setActiveRole: (r: Role) => void;
    roleIndex: number;
    t: ReturnType<typeof useTranslations>;
    tBrand: ReturnType<typeof useTranslations>;
    children: React.ReactNode;
    onTabSwitch?: () => void;
}) {
    return (
        <div className="min-h-dvh flex bg-background">
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-sm">
                    <div className="absolute top-4 left-4">
                        <LanguageSwitcher />
                    </div>

                    <div className="relative flex flex-col items-center gap-1.5 mb-8">
                        <Button variant="outline" size="icon" asChild className="rounded-full absolute left-0 top-0">
                            <Link href="/" aria-label="Retour à l'accueil">
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

                        {/* Role tabs with sliding pill */}
                        <div className="px-6">
                            <div className="relative grid grid-cols-2 h-9 rounded-full bg-muted p-1">
                                <motion.div
                                    className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm"
                                    initial={false}
                                    animate={{
                                        left: `calc(${roleIndex * 50}% + 4px)`,
                                        width: "calc(50% - 8px)",
                                    }}
                                    transition={{ type: "spring", stiffness: 200, damping: 25, mass: 0.8 }}
                                />
                                {roles.map((role) => (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() => { setActiveRole(role); onTabSwitch?.(); }}
                                        className={`relative z-10 flex items-center justify-center gap-1.5 text-sm font-medium rounded-full transition-colors duration-200 ${
                                            activeRole === role ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
                                        }`}
                                    >
                                        {role === "employee" ? (
                                            <><Mail className="w-3.5 h-3.5" /> {t("employeeTab")}</>
                                        ) : (
                                            <><Lock className="w-3.5 h-3.5" /> {t("adminTab")}</>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="px-6 pb-6">
                            {children}
                        </div>
                    </Card>

                    <p className="mt-6 text-center text-xs text-muted-foreground">{tBrand("copyright")}</p>
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
