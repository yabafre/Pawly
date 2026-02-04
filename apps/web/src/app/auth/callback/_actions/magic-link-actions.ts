"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import { authResponseSchema, validateMagicLinkSchema } from "@pawly/validators";

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message;
    }
    return "Une erreur est survenue";
};

export const validateMagicLinkAction = createServerAction()
    .input(validateMagicLinkSchema)
    .output(authResponseSchema)
    .experimental_shapeError(({ err }) => ({
        code: "SERVER_ERROR",
        message: getErrorMessage(err),
    }))
    .handler(async ({ input }) => {
        try {
            const result = await trpc.auth.validateMagicLink.mutate(input);
            return authResponseSchema.parse(result);
        } catch (error) {
            throw new Error(getErrorMessage(error));
        }
    });
