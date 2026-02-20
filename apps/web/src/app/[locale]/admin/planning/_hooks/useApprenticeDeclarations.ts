"use client";

import {
  QueryKeyFactory,
  useServerActionMutation,
  useServerActionQuery,
} from "@/lib/hooks/server-action-hooks";
import {
  listApprenticeDeclarationsAction,
  upsertNoSchoolAction,
  deleteApprenticeDeclarationAction,
} from "../_actions/declaration-actions";
import { useQueryClient } from "@tanstack/react-query";
import type { ApprenticeDeclarationRow } from "@pawly/validators";

export const useApprenticeDeclarations = (month?: string) => {
  const queryClient = useQueryClient();
  const queryKey = QueryKeyFactory.apprenticeDeclarations(month);

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["planning", "apprentice-declarations"],
    });
  };

  const {
    data: declarations,
    isPending: isLoading,
  } = useServerActionQuery(listApprenticeDeclarationsAction, {
    input: { month: month ?? "" },
    queryKey,
    enabled: !!month && month.length > 0,
    placeholderData: (prev: unknown) => prev,
  });

  const { mutate: confirmNoSchool, isPending: isConfirming } =
    useServerActionMutation(upsertNoSchoolAction, {
      onSuccess: invalidate,
    });

  const { mutate: removeDeclaration, isPending: isRemoving } =
    useServerActionMutation(deleteApprenticeDeclarationAction, {
      onSuccess: invalidate,
    });

  const allDeclared =
    declarations && declarations.length > 0
      ? declarations.every((d: ApprenticeDeclarationRow) => d.status !== "MISSING")
      : true;

  return {
    declarations: declarations ?? [],
    isLoading,
    confirmNoSchool,
    isConfirming,
    removeDeclaration,
    isRemoving,
    allDeclared,
  };
};
