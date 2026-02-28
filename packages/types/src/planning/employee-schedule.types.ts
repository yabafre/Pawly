import type { Employee } from "../employee/employee.types";

export interface EmployeeScheduleData {
  month: string;
  employee: Pick<Employee, "id" | "firstName" | "lastName" | "jobType" | "contractHours" | "color">;
  shifts: EmployeeShift[];
  unavailabilities: EmployeeUnavailability[];
  publicationStatus: {
    status: "DRAFT" | "PUBLISHED";
    publishedAt: string | null;
  };
  weeklySummary: EmployeeWeeklySummary[];
  shiftTypes: EmployeeShiftTypeInfo[];
}

export interface EmployeeShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftTypeCode: string;
  breakMinutes: number;
  isConfirmed: boolean;
  source: "GENERATED" | "MANUAL";
}

export interface EmployeeUnavailability {
  date: string;
  type: "VACATION" | "SICK" | "SCHOOL" | "OTHER";
  reason?: string;
}

export interface EmployeeWeeklySummary {
  weekNumber: number;
  totalMinutes: number;
  shiftCount: number;
  contractMinutes: number;
}

export interface EmployeeShiftTypeInfo {
  code: string;
  label: string;
  color: string;
  breakMinutes: number;
}
