"use client";

import { useQueryClient } from "@tanstack/react-query";
import { QueryKeyFactory, useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { validateMagicLinkAction } from "../_actions/magic-link-actions";

export const useMagicLinkCallback = () => {
    const queryClient = useQueryClient();

    const invalidateAuthQueries = async () => {
        await queryClient.invalidateQueries({ queryKey: QueryKeyFactory.auth() });
    };

    const mutation = useServerActionMutation(validateMagicLinkAction, {
        returnError: true,
        onSettled: invalidateAuthQueries,
    });

    const validateMagicLink = async (token: string) => {
        return mutation.mutateAsync({ token });
    };

    return {
        validateMagicLink,
        isPending: mutation.isPending,
        isSuccess: mutation.isSuccess,
        isError: mutation.isError,
        error: mutation.error,
    };
};
