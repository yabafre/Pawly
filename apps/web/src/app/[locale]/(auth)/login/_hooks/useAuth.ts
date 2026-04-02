"use client";

import { QueryKeyFactory, useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { loginAction, requestMagicLinkAction, requestOtpAction, verifyOtpAction } from "@/app/[locale]/(auth)/login/_actions/auth-actions";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { z } from "@pawly/zod";
import { loginSchema } from "@pawly/validators";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

type LoginFormValues = z.infer<typeof loginSchema>;

export const useAuth = () => {
    const router = useRouter();
    const queryClient = useQueryClient();
    const t = useTranslations("auth.toast");

    const invalidateAuthQueries = async () => {
        await queryClient.invalidateQueries({ queryKey: QueryKeyFactory.auth() });
    };

    const loginMutation = useServerActionMutation(loginAction, {
        returnError: true,
        onSettled: invalidateAuthQueries,
    });
    const magicLinkMutation = useServerActionMutation(requestMagicLinkAction, {
        returnError: true,
        onSettled: invalidateAuthQueries,
    });
    const otpRequestMutation = useServerActionMutation(requestOtpAction, {
        returnError: true,
        onSettled: invalidateAuthQueries,
    });
    const otpVerifyMutation = useServerActionMutation(verifyOtpAction, {
        returnError: true,
        onSettled: invalidateAuthQueries,
    });

    const login = async (values: LoginFormValues & { turnstileToken?: string }) => {
        try {
            const [data, err] = await loginMutation.mutateAsync(values);

            if (err) {
                toast.error(err.message || t("loginError"));
                return;
            }

            if (data) {
                toast.success(t("loginSuccess"));

                if (data.user.role === "ADMIN") {
                    router.push("/admin/planning");
                } else {
                    router.push("/dashboard");
                }
            }
        } catch (error) {
            if (error instanceof TypeError && error.message.includes("fetch")) {
                toast.error(t("serverError"));
            } else {
                toast.error(t("unexpectedError"));
            }
        }
    };

    const requestMagicLink = async (email: string) => {
        try {
            const [data, err] = await magicLinkMutation.mutateAsync({ email });

            if (err) {
                toast.error(err.message || t("magicLinkError"));
                return;
            }

            if (data) {
                toast.success(t("magicLinkSent"));
            }
        } catch (error) {
            if (error instanceof TypeError && error.message.includes("fetch")) {
                toast.error(t("serverError"));
            } else {
                toast.error(t("magicLinkError"));
            }
        }
    };

    const requestOtp = async (email: string, turnstileToken?: string) => {
        try {
            const [data, err] = await otpRequestMutation.mutateAsync({ email, turnstileToken });

            if (err) {
                toast.error(err.message || t("otpError"));
                return null;
            }

            if (data) {
                return data.method;
            }
            return null;
        } catch (error) {
            if (error instanceof TypeError && error.message.includes("fetch")) {
                toast.error(t("serverError"));
            } else {
                toast.error(t("otpError"));
            }
            return null;
        }
    };

    const verifyOtp = async (email: string, code: string) => {
        try {
            const [data, err] = await otpVerifyMutation.mutateAsync({ email, code });

            if (err) {
                toast.error(err.message || t("otpVerifyError"));
                return false;
            }

            if (data) {
                toast.success(t("loginSuccess"));

                if (data.user.role === "ADMIN") {
                    router.push("/admin/planning");
                } else {
                    router.push("/dashboard");
                }
                return true;
            }
            return false;
        } catch (error) {
            if (error instanceof TypeError && error.message.includes("fetch")) {
                toast.error(t("serverError"));
            } else {
                toast.error(t("otpVerifyError"));
            }
            return false;
        }
    };

    return {
        login,
        requestMagicLink,
        requestOtp,
        verifyOtp,
        resetMagicLink: () => magicLinkMutation.reset(),
        isLoginPending: loginMutation.isPending,
        isMagicPending: magicLinkMutation.isPending,
        isMagicSuccess: magicLinkMutation.isSuccess,
        isOtpRequestPending: otpRequestMutation.isPending,
        isOtpVerifyPending: otpVerifyMutation.isPending,
    };
};
