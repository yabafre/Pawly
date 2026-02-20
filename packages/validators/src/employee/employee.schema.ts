import { z } from "@pawly/zod";

export const JOB_TYPES = ["VET", "ASV", "APPRENTICE"] as const;
export const CONTRACT_TYPES = ["CDI", "CDD", "APPRENTICESHIP"] as const;

export type JobType = (typeof JOB_TYPES)[number];
export type ContractType = (typeof CONTRACT_TYPES)[number];

const employeeFieldsSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  jobType: z.enum(JOB_TYPES),
  contractType: z.enum(CONTRACT_TYPES),
  contractHours: z.number().int().min(1, "Hours must be at least 1").max(48, "Hours must be at most 48"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"),
  hireDate: z.string().datetime().optional().or(z.literal("")),
  endDate: z.string().datetime().optional().or(z.literal("")),
});

export { employeeFieldsSchema };

export const createEmployeeSchema = employeeFieldsSchema.refine(
  (data) => {
    if (data.contractType !== "CDI" && data.endDate && data.hireDate && data.endDate !== "" && data.hireDate !== "") {
      return new Date(data.endDate) > new Date(data.hireDate);
    }
    return true;
  },
  { message: "End date must be after hire date", path: ["endDate"] },
);

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = employeeFieldsSchema.partial().extend({
  id: z.string().uuid(),
});

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const employeeIdSchema = z.object({
  id: z.string().uuid(),
});

export type EmployeeIdInput = z.infer<typeof employeeIdSchema>;

export const listEmployeesSchema = z.object({
  includeInactive: z.boolean().optional(),
  jobType: z.enum(JOB_TYPES).optional(),
  search: z.string().optional(),
}).optional();

export type ListEmployeesInput = z.infer<typeof listEmployeesSchema>;
