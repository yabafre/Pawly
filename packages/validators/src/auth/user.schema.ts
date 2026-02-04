import { z } from "@pawly/zod";
import { clinicIdSchema } from "../common";

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  clinicId: clinicIdSchema,
});

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["ADMIN", "EMPLOYEE"]),
  clinicId: clinicIdSchema,
});
