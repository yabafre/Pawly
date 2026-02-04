import { z } from "@pawly/zod";

export const requestMagicLinkSchema = z.object({
  email: z.string().email("Email invalide"),
});

export const validateMagicLinkSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Format de token magic link invalide"),
});
