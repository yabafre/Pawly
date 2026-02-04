"use server";

import { createServerAction, ZSAError } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
    authResponseSchema,
    loginSchema,
    magicLinkResponseSchema,
    requestMagicLinkSchema,
} from "@pawly/validators";

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message;
    }
    return "Une erreur est survenue";
};

const getErrorCode = (error: unknown) => {
    if (error instanceof ZSAError) {
        return error.code;
    }
    if (typeof error === "object" && error) {
        const err = error as { code?: string; data?: { code?: string }; shape?: { code?: string } };
        return err.code ?? err.data?.code ?? err.shape?.code;
    }
    return undefined;
};

const shapeError = (error: unknown) => ({
    code: getErrorCode(error) ?? "SERVER_ERROR",
    message: getErrorMessage(error),
});

export const loginAction = createServerAction()
    .input(loginSchema)
    .output(authResponseSchema)
    .experimental_shapeError(({ err }) => shapeError(err))
    .handler(async ({ input }) => {
        const result = await trpc.auth.login.mutate(input);
        return authResponseSchema.parse(result);
    });

export const requestMagicLinkAction = createServerAction()
    .input(requestMagicLinkSchema)
    .output(magicLinkResponseSchema)
    .experimental_shapeError(({ err }) => shapeError(err))
    .handler(async ({ input }) => {
        const result = await trpc.auth.requestMagicLink.mutate(input);
        return magicLinkResponseSchema.parse(result);
    });
