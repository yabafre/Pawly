"use server";

import { cookies } from "next/headers";
import { createServerAction, ZSAError } from "zsa";
import { trpc } from "@/lib/trpc/client";
import { registerAdminInputSchema, authResponseSchema } from "@pawly/validators";
import { verifyTurnstileToken } from "@/lib/turnstile-verify";
import { z } from "@pawly/zod";

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

const registerWithLocaleSchema = z.object({
  clinicName: z.string().min(2).max(100),
  adminName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  turnstileToken: z.string(),
  locale: z.enum(["fr", "en"]).optional(),
});

export const registerAction = createServerAction()
  .input(registerWithLocaleSchema)
  .output(authResponseSchema)
  .experimental_shapeError(({ err }) => {
    if (err instanceof ZSAError) return { code: err.code, message: err.message };
    // Preserve the API error message (e.g. EMAIL_ALREADY_EXISTS) for client-side translation
    const message = err instanceof Error ? err.message : "An error occurred";
    return { code: "SERVER_ERROR", message };
  })
  .handler(async ({ input }) => {
    const { turnstileToken, locale, ...registerInput } = input;

    const valid = await verifyTurnstileToken(turnstileToken);
    if (!valid) throw new ZSAError("FORBIDDEN", "Turnstile verification failed");

    const result = await trpc.auth.register.mutate({
      ...registerInput,
      email: registerInput.email.trim().toLowerCase(),
      clinicName: registerInput.clinicName.trim(),
      adminName: registerInput.adminName.trim(),
      locale,
    });
    const parsed = authResponseSchema.parse(result);
    await setAuthCookie(parsed.access_token);
    return parsed;
  });
