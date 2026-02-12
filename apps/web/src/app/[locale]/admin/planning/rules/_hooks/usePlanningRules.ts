"use client";

import {
  QueryKeyFactory,
  useServerActionMutation,
  useServerActionQuery,
} from "@/lib/hooks/server-action-hooks";
import {
  listPlanningRulesAction,
  createPlanningRuleAction,
  updatePlanningRuleAction,
  deletePlanningRuleAction,
  togglePlanningRuleAction,
} from "../_actions/planning-rule-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type {
  ListPlanningRulesInput,
  PlanningRuleCategory,
} from "@pawly/validators";

export type PlanningRuleRecord = {
  id: string;
  name: string;
  description: string | null;
  ruleType: "HARD" | "SOFT";
  category: PlanningRuleCategory;
  isActive: boolean;
  config: unknown;
  priority: number;
};

export const usePlanningRules = (filters?: ListPlanningRulesInput) => {
  const queryClient = useQueryClient();
  const t = useTranslations("admin.planningRules.toast");
  const queryKey = QueryKeyFactory.planningRules();

  const { data, isPending, isLoading, isFetching, error, refetch } =
    useServerActionQuery(listPlanningRulesAction, {
      input: filters ?? {},
      queryKey,
      placeholderData: (prev: unknown) => prev,
    });

  const invalidateRules = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: QueryKeyFactory.planning() });
  };

  const { mutate: createRule, isPending: isCreating } =
    useServerActionMutation(createPlanningRuleAction, {
      onSuccess: () => {
        invalidateRules();
        toast.success(t("created"));
      },
      onError: () => {
        toast.error(t("createFailed"));
      },
    });

  const { mutate: updateRule, isPending: isUpdating } =
    useServerActionMutation(updatePlanningRuleAction, {
      onSuccess: () => {
        invalidateRules();
        toast.success(t("updated"));
      },
      onError: () => {
        toast.error(t("updateFailed"));
      },
    });

  const { mutate: deleteRule, isPending: isDeleting } =
    useServerActionMutation(deletePlanningRuleAction, {
      onSuccess: () => {
        invalidateRules();
        toast.success(t("deleted"));
      },
      onError: () => {
        toast.error(t("deleteFailed"));
      },
    });

  const { mutate: toggleRule, isPending: isToggling } =
    useServerActionMutation(togglePlanningRuleAction, {
      onSuccess: () => {
        invalidateRules();
        toast.success(t("toggled"));
      },
      onError: () => {
        toast.error(t("toggleFailed"));
      },
    });

  return {
    rules: data ?? [],
    isPending: isPending || isLoading,
    isFetching,
    error,
    refetch,
    createRule,
    isCreating,
    updateRule,
    isUpdating,
    deleteRule,
    isDeleting,
    toggleRule,
    isToggling,
  };
};
