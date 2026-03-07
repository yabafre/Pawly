import { z } from "@pawly/zod";

export const requestOtpSchema = z.object({
  email: z.string().email("Email invalide"),
});

export const verifyOtpSchema = z.object({
  email: z.string().email("Email invalide"),
  code: z.string().regex(/^\d{6}$/, "Le code doit contenir exactement 6 chiffres"),
});

export const otpRequestResponseSchema = z.object({
  method: z.enum(["otp", "magic_link"]),
  message: z.string(),
});
