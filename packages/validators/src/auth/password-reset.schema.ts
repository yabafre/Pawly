import { z } from "@pawly/zod";

export const requestPasswordResetSchema = z.object({
  email: z.string().email("Email invalide"),
});

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

const passwordRules = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
  .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre");

export const resetPasswordInputSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Format de token invalide"),
  password: passwordRules,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const resetPasswordFormSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/, "Format de token invalide"),
    password: passwordRules,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Les mots de passe ne correspondent pas",
    path: ["passwordConfirm"],
  });
