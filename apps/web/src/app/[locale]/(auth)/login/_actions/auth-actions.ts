"use server";

import { cookies } from "next/headers";
import { createServerAction, ZSAError } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
    authResponseSchema,
    loginSchema,
    magicLinkResponseSchema,
    requestMagicLinkSchema,
    requestOtpSchema,
    verifyOtpSchema,
    otpRequestResponseSchema,
} from "@pawly/validators";

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

const shapeError = (error: unknown) => ({
    code: getErrorCode(error) ?? "SERVER_ERROR",
    message: getErrorMessage(error),
});

async function setAuthCookie(token: string) {
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: AUTH_COOKIE_MAX_AGE,
        path: "/",
    });
}

export const loginAction = createServerAction()
    .input(loginSchema)
    .output(authResponseSchema)
    .experimental_shapeError(({ err }) => shapeError(err))
    .handler(async ({ input }) => {
        const result = await trpc.auth.login.mutate(input);
        const parsed = authResponseSchema.parse(result);
        await setAuthCookie(parsed.access_token);
        return parsed;
    });

export async function logoutAction() {
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 0,
        path: "/",
    });
}

export const requestMagicLinkAction = createServerAction()
    .input(requestMagicLinkSchema)
    .output(magicLinkResponseSchema)
    .experimental_shapeError(({ err }) => shapeError(err))
    .handler(async ({ input }) => {
        const result = await trpc.auth.requestMagicLink.mutate(input);
        return magicLinkResponseSchema.parse(result);
    });

export const requestOtpAction = createServerAction()
    .input(requestOtpSchema)
    .output(otpRequestResponseSchema)
    .experimental_shapeError(({ err }) => shapeError(err))
    .handler(async ({ input }) => {
        const result = await trpc.auth.requestOtp.mutate(input);
        return otpRequestResponseSchema.parse(result);
    });

export const verifyOtpAction = createServerAction()
    .input(verifyOtpSchema)
    .output(authResponseSchema)
    .experimental_shapeError(({ err }) => shapeError(err))
    .handler(async ({ input }) => {
        const result = await trpc.auth.verifyOtp.mutate(input);
        const parsed = authResponseSchema.parse(result);
        await setAuthCookie(parsed.access_token);
        return parsed;
    });
