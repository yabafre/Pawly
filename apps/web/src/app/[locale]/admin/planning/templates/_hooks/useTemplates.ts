"use client";

import {
  QueryKeyFactory,
  useServerActionMutation,
  useServerActionQuery,
} from "@/lib/hooks/server-action-hooks";
import {
  listTemplatesAction,
  createTemplateAction,
  updateTemplateAction,
  deleteTemplateAction,
  duplicateTemplateAction,
} from "../_actions/template-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export const useTemplates = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("admin.planningTemplates.toast");
  const queryKey = QueryKeyFactory.planningTemplates();

  const { data, isPending, isLoading, isFetching, error, refetch } =
    useServerActionQuery(listTemplatesAction, {
      input: {},
      queryKey,
      placeholderData: (prev: unknown) => prev,
    });

  const invalidateTemplates = () => {
    queryClient.invalidateQueries({ queryKey });
  };

  const { mutate: createTemplate, isPending: isCreating } =
    useServerActionMutation(createTemplateAction, {
      onSuccess: () => {
        invalidateTemplates();
        toast.success(t("created"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("createFailed"), { description: err?.message });
      },
    });

  const { mutate: updateTemplate, isPending: isUpdating } =
    useServerActionMutation(updateTemplateAction, {
      onSuccess: () => {
        invalidateTemplates();
        toast.success(t("updated"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("updateFailed"), { description: err?.message });
      },
    });

  const { mutate: deleteTemplate, isPending: isDeleting } =
    useServerActionMutation(deleteTemplateAction, {
      onSuccess: () => {
        invalidateTemplates();
        toast.success(t("deleted"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("deleteFailed"), { description: err?.message });
      },
    });

  const { mutate: duplicateTemplate, isPending: isDuplicating } =
    useServerActionMutation(duplicateTemplateAction, {
      onSuccess: () => {
        invalidateTemplates();
        toast.success(t("duplicated"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("duplicateFailed"), { description: err?.message });
      },
    });

  return {
    templates: data ?? [],
    isPending: isPending || isLoading,
    isFetching,
    error,
    refetch,
    createTemplate,
    isCreating,
    updateTemplate,
    isUpdating,
    deleteTemplate,
    isDeleting,
    duplicateTemplate,
    isDuplicating,
    invalidateTemplates,
  };
};
