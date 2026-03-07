"use client";

import {
  QueryKeyFactory,
  useServerActionQuery,
  useServerActionMutation,
} from "@/lib/hooks/server-action-hooks";
import {
  publishPlanAction,
  getPublicationStatusAction,
  getPublishPreviewAction,
} from "../_actions/publish-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

type PublishPreview = {
  employees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    shiftCount: number;
    notifyOnPublish: boolean;
  }>;
  emailCount: number;
  disabledCount: number;
  totalWithShifts: number;
};

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

  const { data: rawPreview, isPending: isLoadingPreview } =
    useServerActionQuery(getPublishPreviewAction, {
      input: { month: month ?? "" },
      queryKey: QueryKeyFactory.publishPreview(month),
      enabled: !!month && month.length > 0,
    });

  const publishPreview = rawPreview as PublishPreview | undefined;

  const { mutate: publishPlan, isPending: isPublishing } =
    useServerActionMutation(publishPlanAction, {
      onSuccess: (result) => {
        const data = result as { totalWithShifts?: number } | undefined;
        const totalWithShifts = data?.totalWithShifts ?? 0;
        toast.success(t("publishSuccess", { count: totalWithShifts }));
        queryClient.invalidateQueries({
          queryKey: QueryKeyFactory.publicationStatus(month),
        });
        queryClient.invalidateQueries({
          queryKey: QueryKeyFactory.planningScheduleView(month),
        });
        queryClient.invalidateQueries({
          queryKey: QueryKeyFactory.publishPreview(),
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
    publishPreview,
    isLoadingPreview,
    publishPlan,
    isPublishing,
  };
};
