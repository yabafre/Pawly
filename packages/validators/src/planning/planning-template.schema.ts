import { z } from "@pawly/zod";
import { JOB_TYPES } from "../employee/employee.schema";

// ── Template Slot schema ───────────────────────────────────────────────────

export const templateSlotSchema = z.object({
  shiftTypeCode: z.string().min(1, "Shift type code is required"),
  requiredStaff: z
    .number()
    .int("Required staff must be an integer")
    .min(1, "Required staff must be at least 1"),
  requiredJobTypes: z.array(z.enum(JOB_TYPES)).optional(),
});
export type TemplateSlot = z.infer<typeof templateSlotSchema>;

// ── Template Day schema ────────────────────────────────────────────────────

export const templateDaySchema = z.object({
  dayOfWeek: z
    .number()
    .int("Day of week must be an integer")
    .min(1, "Day of week must be between 1 (Monday) and 7 (Sunday)")
    .max(7, "Day of week must be between 1 (Monday) and 7 (Sunday)"),
  slots: z.array(templateSlotSchema),
});
export type TemplateDay = z.infer<typeof templateDaySchema>;

// ── Template Data schema (base + refined) ──────────────────────────────────
// CRITICAL: Zod .refine() creates ZodEffects — keep base schema separate
// for merge operations. Only add .refine() at final usage.

export const templateDataBaseSchema = z.object({
  days: z.array(templateDaySchema),
});

export const templateDataSchema = templateDataBaseSchema.refine(
  (data) => {
    const dayValues = data.days.map((d) => d.dayOfWeek);
    return new Set(dayValues).size === dayValues.length;
  },
  { message: "Each day of the week must be unique within a template" }
);
export type TemplateData = z.infer<typeof templateDataBaseSchema>;

// ── Create template schema ─────────────────────────────────────────────────

export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "Template name is required")
    .max(100, "Template name must be at most 100 characters"),
  data: templateDataSchema,
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// ── Update template schema ─────────────────────────────────────────────────

export const updateTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(1, "Template name is required")
    .max(100, "Template name must be at most 100 characters"),
  data: templateDataSchema,
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

// ── Duplicate template schema ──────────────────────────────────────────────

export const duplicateTemplateSchema = z.object({
  id: z.string().uuid(),
});
export type DuplicateTemplateInput = z.infer<typeof duplicateTemplateSchema>;

// ── Template ID schema ─────────────────────────────────────────────────────

export const templateIdSchema = z.object({
  id: z.string().uuid(),
});
export type TemplateIdInput = z.infer<typeof templateIdSchema>;

// ── List templates schema ──────────────────────────────────────────────────

export const listTemplatesSchema = z.object({});
export type ListTemplatesInput = z.infer<typeof listTemplatesSchema>;
