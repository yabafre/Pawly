import { z } from "@pawly/zod";

export const activateAccountBaseSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Format de token d'activation invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
    .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
    .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre"),
  passwordConfirm: z.string(),
});

export const activateAccountSchema = activateAccountBaseSchema.refine(
  (data) => data.password === data.passwordConfirm,
  {
    message: "Les mots de passe ne correspondent pas",
    path: ["passwordConfirm"],
  },
);

export const activateAccountInputSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Format de token d'activation invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
    .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
    .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre"),
});
