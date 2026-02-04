"use client";

import { QueryKeyFactory, useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { loginAction, requestMagicLinkAction } from "@/app/login/_actions/auth-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { z } from "@pawly/zod";
import { loginSchema } from "@pawly/validators";
import { useQueryClient } from "@tanstack/react-query";

type LoginFormValues = z.infer<typeof loginSchema>;

export const useAuth = () => {
    const router = useRouter();
    const queryClient = useQueryClient();

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
        try {
            const [data, err] = await loginMutation.mutateAsync(values);

            if (err) {
                toast.error(err.message || "Email ou mot de passe incorrect");
                return;
            }

            if (data) {
                toast.success("Connexion réussie !");

                if (data.user.role === "ADMIN") {
                    router.push("/admin/planning");
                } else {
                    router.push("/dashboard");
                }
            }
        } catch (error) {
            if (error instanceof TypeError && error.message.includes("fetch")) {
                toast.error("Problème de connexion au serveur");
            } else {
                toast.error("Une erreur inattendue est survenue");
            }
        }
    };

    const requestMagicLink = async (email: string) => {
        try {
            const [data, err] = await magicLinkMutation.mutateAsync({ email });

            if (err) {
                toast.error(err.message || "Une erreur est survenue");
                return;
            }

            if (data) {
                toast.success("Lien de connexion envoyé !");
            }
        } catch (error) {
            if (error instanceof TypeError && error.message.includes("fetch")) {
                toast.error("Problème de connexion au serveur");
            } else {
                toast.error("Impossible d'envoyer le lien");
            }
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
