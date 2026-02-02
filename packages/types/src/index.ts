// Shared TypeScript types for Pawly
export type Role = "ADMIN" | "EMPLOYEE";

export interface User {
  id: string;
  email: string;
  role: Role;
  clinicId: string;
}

export interface ClinicContext {
  clinicId: string;
}
