import { z } from "@pawly/zod";

/** DB-storable statuses (match Prisma ApprenticeMonthStatus enum) */
export const APPRENTICE_MONTH_DB_STATUSES = [
  "SCHOOL_DAYS_PROVIDED",
  "NO_SCHOOL_THIS_MONTH",
] as const;
export type ApprenticeMonthDbStatus =
  (typeof APPRENTICE_MONTH_DB_STATUSES)[number];

/** All statuses including derived UI-only "MISSING" (not stored in DB) */
export const APPRENTICE_MONTH_STATUSES = [
  ...APPRENTICE_MONTH_DB_STATUSES,
  "MISSING",
] as const;
export type ApprenticeMonthStatusType =
  (typeof APPRENTICE_MONTH_STATUSES)[number];

export const monthFormatSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM format");

export const listApprenticeDeclarationsSchema = z.object({
  month: monthFormatSchema,
});
export type ListApprenticeDeclarationsInput = z.infer<
  typeof listApprenticeDeclarationsSchema
>;

export const upsertNoSchoolSchema = z.object({
  employeeId: z.string().uuid(),
  month: monthFormatSchema,
});
export type UpsertNoSchoolInput = z.infer<typeof upsertNoSchoolSchema>;

export const deleteDeclarationSchema = z.object({
  employeeId: z.string().uuid(),
  month: monthFormatSchema,
});
export type DeleteDeclarationInput = z.infer<typeof deleteDeclarationSchema>;

export const getDeclarationStatusSchema = z.object({
  month: monthFormatSchema,
});
export type GetDeclarationStatusInput = z.infer<
  typeof getDeclarationStatusSchema
>;

export const apprenticeDeclarationRowSchema = z.object({
  employeeId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  status: z.enum(APPRENTICE_MONTH_STATUSES),
});
export type ApprenticeDeclarationRow = z.infer<
  typeof apprenticeDeclarationRowSchema
>;
