import { z } from "@pawly/zod";

const YYYY_MM_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

function datesFallWithinMonth(dates: string[], month: string): boolean {
  if (!YYYY_MM_REGEX.test(month)) return false;
  const [year, m] = month.split("-").map(Number);
  for (const d of dates) {
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return false;
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== m) return false;
  }
  return true;
}

function hasNoDuplicates(dates: string[]): boolean {
  return new Set(dates).size === dates.length;
}

const declareSchoolDaysBaseSchema = z.object({
  month: z.string().regex(YYYY_MM_REGEX, "Month must be in YYYY-MM format"),
  dates: z.array(z.string().date()).min(0).max(31),
  employeeId: z.string().uuid(),
});

export const declareSchoolDaysSchema = declareSchoolDaysBaseSchema
  .refine((data) => hasNoDuplicates(data.dates), {
    path: ["dates"],
    message: "Duplicate dates are not allowed",
  })
  .refine((data) => datesFallWithinMonth(data.dates, data.month), {
    path: ["dates"],
    message: "All dates must fall within the declared month",
  });

export type DeclareSchoolDaysInput = z.infer<typeof declareSchoolDaysSchema>;

export const listSchoolDaysSchema = z.object({
  month: z.string().regex(YYYY_MM_REGEX, "Month must be in YYYY-MM format"),
  employeeId: z.string().uuid(),
});

export type ListSchoolDaysInput = z.infer<typeof listSchoolDaysSchema>;
