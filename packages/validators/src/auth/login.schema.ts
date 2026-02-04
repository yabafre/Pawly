import { z } from "@pawly/zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Le mot de passe est requis"),
});
