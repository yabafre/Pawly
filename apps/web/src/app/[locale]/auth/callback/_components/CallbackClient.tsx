"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMagicLinkCallback } from "../_hooks/useMagicLinkCallback";

type CallbackClientProps = {
    token?: string;
};

export const CallbackClient = ({ token }: CallbackClientProps) => {
    const router = useRouter();
    const t = useTranslations("auth.callback");
    const tCommon = useTranslations("common");
    const hasRun = useRef(false);
    const [status, setStatus] = useState<"pending" | "error" | "success">("pending");
    const { validateMagicLink, isPending } = useMagicLinkCallback();

    useEffect(() => {
        if (hasRun.current) {
            return;
        }
        hasRun.current = true;

        if (!token) {
            setStatus("error");
            return;
        }

        const run = async () => {
            const [data, err] = await validateMagicLink(token);

            if (err || !data) {
                setStatus("error");
                return;
            }

            localStorage.setItem("token", data.access_token);
            localStorage.setItem("user", JSON.stringify(data.user));
            setStatus("success");

            if (data.user.role === "ADMIN") {
                router.replace("/admin/planning");
            } else {
                router.replace("/dashboard");
            }
        };

        void run();
    }, [router, token, validateMagicLink]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FDFDFD] relative overflow-hidden px-6">
            <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-[#009588]/5 blur-[120px] rounded-full mix-blend-multiply pointer-events-none"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-orange-500/5 blur-[120px] rounded-full mix-blend-multiply pointer-events-none"></div>

            <Card className="w-full max-w-md text-center shadow-[0_8px_30px_rgba(0,0,0,0.04)] border-neutral-100 bg-white/90 backdrop-blur-sm">
                {status === "error" ? (
                    <CardHeader className="space-y-3">
                        <div className="mx-auto w-12 h-12 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-orange-500" />
                        </div>
                        <CardTitle className="text-xl font-bold text-neutral-900">
                            {t("invalidLink")}
                        </CardTitle>
                        <CardDescription className="text-neutral-500">
                            {t("linkExpiredMessage")}
                        </CardDescription>
                        <Button
                            type="button"
                            onClick={() => router.replace("/login")}
                            className="bg-neutral-900 hover:bg-black text-white font-semibold h-11"
                        >
                            {tCommon("backToLogin")}
                        </Button>
                    </CardHeader>
                ) : (
                    <CardHeader className="space-y-3">
                        <div className="mx-auto w-12 h-12 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center">
                            {status === "success" ? (
                                <Check className="w-6 h-6 text-teal-600" />
                            ) : (
                                <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
                            )}
                        </div>
                        <CardTitle className="text-xl font-bold text-neutral-900">
                            {status === "success" ? t("connectionValidated") : t("validationInProgress")}
                        </CardTitle>
                        <CardDescription className="text-neutral-500">
                            {status === "success"
                                ? t("redirecting")
                                : (isPending ? t("verifyingLink") : t("preparingSession"))}
                        </CardDescription>
                    </CardHeader>
                )}
            </Card>
        </div>
    );
};
