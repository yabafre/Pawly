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
  equityCounters: () => ["planning", "equity-counters"],
  equityQuarterlySummary: () => ["planning", "equity-quarterly"],
  clinic: () => ["clinic"],
  billing: () => ["billing"],
  checkout: () => ["checkout"],
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
