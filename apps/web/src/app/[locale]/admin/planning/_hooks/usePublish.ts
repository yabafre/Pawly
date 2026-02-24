"use client";

import {
  QueryKeyFactory,
  useServerActionQuery,
  useServerActionMutation,
} from "@/lib/hooks/server-action-hooks";
import {
  publishPlanAction,
  getPublicationStatusAction,
} from "../_actions/publish-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

type UsePublishOptions = {
  onPublishSuccess?: () => void;
};

export const usePublish = (month?: string, options?: UsePublishOptions) => {
  const queryClient = useQueryClient();
  const t = useTranslations("admin.publication");

  const { data: publicationStatus, isPending: isLoadingStatus } =
    useServerActionQuery(getPublicationStatusAction, {
      input: { month: month ?? "" },
      queryKey: QueryKeyFactory.publicationStatus(month),
      enabled: !!month && month.length > 0,
    });

  const { mutate: publishPlan, isPending: isPublishing } =
    useServerActionMutation(publishPlanAction, {
      onSuccess: () => {
        toast.success(t("publishSuccess"));
        queryClient.invalidateQueries({
          queryKey: QueryKeyFactory.publicationStatus(month),
        });
        queryClient.invalidateQueries({
          queryKey: QueryKeyFactory.planningScheduleView(month),
        });
        options?.onPublishSuccess?.();
      },
      onError: (err: { message?: string }) => {
        toast.error(t("publishError"), { description: err?.message });
      },
    });

  return {
    publicationStatus: publicationStatus as
      | { status: "DRAFT" | "PUBLISHED"; publishedAt: string | null; publishedBy: string | null }
      | undefined,
    isLoadingStatus,
    publishPlan,
    isPublishing,
  };
};
