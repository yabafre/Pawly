import { z } from "@pawly/zod";
import { authUserSchema } from "./user.schema";

export const authResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  user: authUserSchema,
});

export const magicLinkResponseSchema = z.object({
  message: z.string(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
export type MagicLinkResponse = z.infer<typeof magicLinkResponseSchema>;
