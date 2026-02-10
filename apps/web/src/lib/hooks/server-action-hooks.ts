import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import {
  createServerActionsKeyFactory,
  setupServerActionHooks,
} from "zsa-react-query";

export const QueryKeyFactory = createServerActionsKeyFactory({
  auth: () => ["auth"],
  planning: () => ["planning"],
  employees: () => ["employees"],
  employeeById: (employeeId: string) => ["employees", "detail", employeeId],
  employeeConstraints: (employeeId?: string) => [
    "employees",
    "constraints",
    employeeId ?? "all",
  ],
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
