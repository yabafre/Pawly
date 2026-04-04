"use server";

import { cookies } from "next/headers";
import { createServerAction, ZSAError } from "zsa";
import { trpc } from "@/lib/trpc/client";
import { registerAdminInputSchema, authResponseSchema } from "@pawly/validators";
import { verifyTurnstileToken } from "@/lib/turnstile-verify";

const AUTH_COOKIE_NAME = "auth-token";
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

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

export const registerAction = createServerAction()
  .input(registerAdminInputSchema)
  .output(authResponseSchema)
  .experimental_shapeError(({ err }) => ({
    code: err instanceof ZSAError ? err.code : "SERVER_ERROR",
    message: err instanceof Error ? err.message : "An error occurred",
  }))
  .handler(async ({ input }) => {
    const { turnstileToken, ...registerInput } = input;

    const valid = await verifyTurnstileToken(turnstileToken);
    if (!valid) throw new ZSAError("FORBIDDEN", "Turnstile verification failed");

    const result = await trpc.auth.register.mutate(registerInput);
    const parsed = authResponseSchema.parse(result);
    await setAuthCookie(parsed.access_token);
    return parsed;
  });
