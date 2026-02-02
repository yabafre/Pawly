import { z } from "@pawly/zod";

// Base schemas for multi-tenancy
export const clinicIdSchema = z.string().uuid();

// Example shared schema
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  clinicId: clinicIdSchema,
});
