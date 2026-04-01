import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import {
  createServerActionsKeyFactory,
  setupServerActionHooks,
} from "zsa-react-query";

export const QueryKeyFactory = createServerActionsKeyFactory({
  auth: () => ["auth"],
  planning: () => ["planning"],
  planningRules: () => ["planning", "rules"],
  equityThresholds: () => ["planning", "rules", "equity-thresholds"],
  employees: () => ["employees"],
  employeeById: (employeeId: string) => ["employees", "detail", employeeId],
  employeeConstraints: (employeeId?: string) => [
    "employees",
    "constraints",
    employeeId ?? "all",
  ],
  schoolDays: (month?: string) => ["employees", "school-days", month ?? "all"],
  undeclaredApprentices: (month?: string) => ["employees", "undeclared-apprentices", month ?? "all"],
  apprenticeDeclarations: (month?: string) => ["planning", "apprentice-declarations", month ?? "all"],
  clinicOperationalConfig: () => ["clinic", "operational-config"],
  clinicShiftTypes: () => ["clinic", "shift-types"],
  planningTemplates: () => ["planning", "templates"],
  planningShifts: (month?: string) => ["planning", "shifts", month ?? "all"],
  planningGeneration: () => ["planning", "generation"],
  planningScheduleView: (month?: string) => ["planning", "schedule-view", month ?? "all"],
  publicationStatus: (month?: string) => ["planning", "publication-status", month ?? "all"],
  equityCounters: (year?: number, months?: number[]) => ["planning", "equity-counters", String(year ?? "all"), months?.join("-") ?? "all"],
  equityQuarterlySummary: (year?: number, quarter?: number) => ["planning", "equity-quarterly", String(year ?? "all"), String(quarter ?? "all")],
  absences: (employeeId?: string) => ["absences", employeeId ?? "all"],
  adminAbsences: (filter?: string) => ["admin-absences", filter ?? "all"],
  pendingAbsenceCount: () => ["absences", "pending-count"],
  varianceEvents: (filter?: string) => ["variance-events", filter ?? "all"],
  pendingVarianceCount: () => ["variance-events", "pending-count"],
  varianceStats: (month?: string) => ["variance-events", "stats", month ?? "all"],
  mySchedule: (month?: string) => ["my-schedule", month ?? "current"],
  myShiftTypes: () => ["my-shift-types"],
  dashboardStats: () => ["dashboard", "stats"],
  clinic: () => ["clinic"],
  billing: () => ["billing"],
  checkout: () => ["checkout"],
  publishPreview: (month?: string) => ["publish-preview", month ?? "all"],
  myNotificationPreferences: () => ["my-notification-preferences"],
  myPushSubscription: () => ["my-push-subscription"],
  adminMe: () => ["admin-me"],
  clinicProfile: () => ["clinic-profile"],
});

export const {
  useServerActionQuery,
  useServerActionMutation,
  useServerActionInfiniteQuery,
} = setupServerActionHooks({
  hooks: {
    useQuery,
    useMutation,
    useInfiniteQuery,
  },
  queryKeyFactory: QueryKeyFactory,
});
