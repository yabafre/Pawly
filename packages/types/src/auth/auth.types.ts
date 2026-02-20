// Re-export auth response types from validators (single source of truth)
export type { AuthResponse, MagicLinkResponse } from "@pawly/validators";

// Standalone types that don't have validator schemas
export type Role = "ADMIN" | "EMPLOYEE";

export interface User {
  id: string;
  email: string;
  role: Role;
  clinicId: string;
}

export interface AuthenticatedUser {
  email: string;
  sub: string;
  role: Role;
  clinicId: string;
}
