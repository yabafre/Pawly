import { z } from "@pawly/zod";

export const registerAdminInputSchema = z.object({
  clinicName: z
    .string()
    .min(2, "Le nom de la clinique doit contenir au moins 2 caractères")
    .max(100, "Le nom de la clinique ne peut pas dépasser 100 caractères")
    .transform((v) => v.trim()),
  adminName: z
    .string()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(100, "Le nom ne peut pas dépasser 100 caractères")
    .transform((v) => v.trim()),
  email: z
    .string()
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.string().email("Email invalide")),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
    .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
    .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre"),
  turnstileToken: z.string().min(1, "Le token CAPTCHA est requis"),
});

export type RegisterAdminInput = z.infer<typeof registerAdminInputSchema>;

export const registerAdminFormSchema = z
  .object({
    clinicName: z
      .string()
      .min(2, "Le nom de la clinique doit contenir au moins 2 caractères")
      .max(100, "Le nom de la clinique ne peut pas dépasser 100 caractères")
      .transform((v) => v.trim()),
    adminName: z
      .string()
      .min(2, "Le nom doit contenir au moins 2 caractères")
      .max(100, "Le nom ne peut pas dépasser 100 caractères")
      .transform((v) => v.trim()),
    email: z
      .string()
      .email("Email invalide")
      .transform((v) => v.trim().toLowerCase()),
    password: z
      .string()
      .min(8, "Le mot de passe doit contenir au moins 8 caractères")
      .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
      .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
      .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre"),
    passwordConfirm: z.string(),
    turnstileToken: z.string().min(1, "Le token CAPTCHA est requis"),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Les mots de passe ne correspondent pas",
    path: ["passwordConfirm"],
  });
