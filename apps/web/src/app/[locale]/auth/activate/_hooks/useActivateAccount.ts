"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { activateAccountAction } from "../_actions/activate-actions";

export const useActivateAccount = () => {
    const router = useRouter();
    const t = useTranslations("auth.activate");

    const mutation = useServerActionMutation(activateAccountAction, {
        returnError: true,
    });

    const activateAccount = async (token: string, password: string) => {
        const [data, err] = await mutation.mutateAsync({ token, password });

        if (err) {
            toast.error(err.message || t("error"));
            return;
        }

        if (data) {
            toast.success(t("success"));
            router.replace("/admin/planning");
        }
    };

    return {
        activateAccount,
        isPending: mutation.isPending,
    };
};
