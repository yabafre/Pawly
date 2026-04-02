"use server";

import { cookies } from "next/headers";
import { createServerAction, ZSAError } from "zsa";
import { trpc } from "@/lib/trpc/client";
import { authResponseSchema, activateAccountInputSchema } from "@pawly/validators";

const AUTH_COOKIE_NAME = "auth-token";
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message;
    }
    return "An error occurred";
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

async function setAuthCookie(token: string) {
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: AUTH_COOKIE_MAX_AGE,
        path: "/",
    });
}

export const activateAccountAction = createServerAction()
    .input(activateAccountInputSchema)
    .output(authResponseSchema)
    .experimental_shapeError(({ err }) => ({
        code: getErrorCode(err) ?? "SERVER_ERROR",
        message: getErrorMessage(err),
    }))
    .handler(async ({ input }) => {
        const result = await trpc.auth.activateAccount.mutate(input);
        const parsed = authResponseSchema.parse(result);
        await setAuthCookie(parsed.access_token);
        return parsed;
    });
