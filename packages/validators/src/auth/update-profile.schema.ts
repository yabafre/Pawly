import { z } from "@pawly/zod";

export const updateAdminProfileSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  locale: z.enum(["fr", "en"]).optional(),
});

export type UpdateAdminProfileInput = z.infer<typeof updateAdminProfileSchema>;
