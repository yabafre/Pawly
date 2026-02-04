"use client";

import { QueryKeyFactory, useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { loginAction, requestMagicLinkAction } from "@/app/login/_actions/auth-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { z } from "@pawly/zod";
import { loginSchema, requestMagicLinkSchema } from "@pawly/validators";
import { useQueryClient } from "@tanstack/react-query";

type LoginFormValues = Omit<z.infer<typeof loginSchema>, "clinicId">;
type MagicLinkInput = z.infer<typeof requestMagicLinkSchema>;

export const useAuth = () => {
    const router = useRouter();
    const queryClient = useQueryClient();

    const getClinicId = () => {
        const fallbackClinicId = "00000000-0000-0000-0000-000000000001";
        const rawClinicId = process.env.NEXT_PUBLIC_CLINIC_ID?.trim();
        const parsed = loginSchema.shape.clinicId.safeParse(rawClinicId);
        return parsed.success ? parsed.data : fallbackClinicId;
    };

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

    const login = async (values: LoginFormValues) => {
        const clinicId = getClinicId();

        try {
            const [data, err] = await loginMutation.mutateAsync({ ...values, clinicId });

            if (err) {
                toast.error(err.message || "Email ou mot de passe incorrect");
                return;
            }

            if (data) {
                localStorage.setItem("token", data.access_token);
                localStorage.setItem("user", JSON.stringify(data.user));
                toast.success("Connexion réussie !");

                if (data.user.role === "ADMIN") {
                    router.push("/admin/planning");
                } else {
                    router.push("/dashboard");
                }
            }
        } catch (error) {
            toast.error("Une erreur inattendue est survenue");
        }
    };

    const requestMagicLink = async (email: string) => {
        const clinicId = getClinicId();

        try {
            const payload: MagicLinkInput = { email, clinicId };
            const [data, err] = await magicLinkMutation.mutateAsync(payload);

            if (err) {
                toast.error(err.message || "Une erreur est survenue");
                return;
            }

            if (data) {
                toast.success("Lien de connexion envoyé !");
            }
        } catch (error) {
            toast.error("Impossible d'envoyer le lien");
        }
    };

    return {
        login,
        requestMagicLink,
        resetMagicLink: () => magicLinkMutation.reset(),
        isLoginPending: loginMutation.isPending,
        isMagicPending: magicLinkMutation.isPending,
        isMagicSuccess: magicLinkMutation.isSuccess,
    };
};
