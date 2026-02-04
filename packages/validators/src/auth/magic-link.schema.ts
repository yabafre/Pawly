import { z } from "@pawly/zod";
import { clinicIdSchema } from "../common";

export const requestMagicLinkSchema = z.object({
  email: z.string().email("Email invalide"),
  clinicId: clinicIdSchema,
});

export const validateMagicLinkSchema = z.object({
  token: z.string().min(1, "Le token est requis"),
});
