'use client';

import { useCallback } from 'react';
import {
  QueryKeyFactory,
  useServerActionMutation,
  useServerActionQuery,
} from '@/lib/hooks/server-action-hooks';
import {
  generatePlanAction,
  listShiftsForMonthAction,
  deleteGeneratedShiftsAction,
} from '../_actions/generation-actions';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { SolverOutcome } from '@pawly/validators';

// Story 13-6 (KON-137) — map the served-plan solver outcome to its i18n key.
const OUTCOME_MESSAGE_KEY: Record<Exclude<SolverOutcome, 'served'>, string> = {
  'engine-unavailable': 'engineUnavailable',
  infeasible: 'infeasible',
  'budget-exhausted': 'budgetExhausted',
  'no-improvement': 'noImprovement',
  'rejected-revalidation': 'rejectedRevalidation',
};

export const useGeneration = (month?: string) => {
  const queryClient = useQueryClient();
  const t = useTranslations('admin.planningGeneration.toast');
  const tOutcome = useTranslations('admin.planningGeneration.engine.solverOutcome');
  const shiftsQueryKey = QueryKeyFactory.planningShifts(month);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['planning', 'shifts'],
    });
    queryClient.invalidateQueries({
      queryKey: ['planning', 'schedule-view'],
    });
    queryClient.invalidateQueries({
      queryKey: ['planning', 'equity-counters'],
    });
    queryClient.invalidateQueries({
      queryKey: QueryKeyFactory.planningGeneration(),
    });
    // Story 11-1 — an acknowledged bulk change on a published month bumps
    // amendedAt/amendmentCount; refresh the Health Bar "amended" badge.
    queryClient.invalidateQueries({
      queryKey: QueryKeyFactory.publicationStatus(month),
    });
  }, [queryClient, month]);

  const {
    data: shifts,
    isPending: isLoadingShifts,
    isFetching: isFetchingShifts,
    refetch: refetchShifts,
  } = useServerActionQuery(listShiftsForMonthAction, {
    input: { month: month ?? '' },
    queryKey: shiftsQueryKey,
    enabled: !!month && month.length > 0,
    placeholderData: (prev: unknown) => prev,
  });

  const { mutate: generatePlan, isPending: isGenerating } = useServerActionMutation(
    generatePlanAction,
    {
      onSuccess: (
        result:
          | { stats?: { engine?: 'greedy' | 'cpsat'; solverOutcome?: SolverOutcome } }
          | undefined,
        variables: { engine?: 'greedy' | 'cpsat' }
      ) => {
        invalidateAll();
        // Story 13-6 (KON-137) — served-engine transparency WITH the reason. When the
        // admin requested cpsat but greedy was served, surface WHY (System Never Lies).
        const outcome = result?.stats?.solverOutcome;
        if (result?.stats?.engine === 'cpsat') {
          toast.success(t('generatedCpsat'));
        } else if (variables?.engine === 'cpsat' && outcome && outcome !== 'served') {
          toast.info(tOutcome(OUTCOME_MESSAGE_KEY[outcome]));
        } else {
          toast.success(t('generated'));
        }
      },
      onError: (err: { message?: string }) => {
        if (err?.message === 'PUBLISHED_CHANGE_REQUIRES_ACK') {
          toast.error(t('publishedChangeRequired'));
        } else {
          toast.error(t('generateFailed'), { description: err?.message });
        }
      },
    }
  );

  const { mutate: deleteGenerated, isPending: isDeleting } = useServerActionMutation(
    deleteGeneratedShiftsAction,
    {
      onSuccess: () => {
        invalidateAll();
        toast.success(t('deleted'));
      },
      onError: (err: { message?: string }) => {
        if (err?.message === 'PUBLISHED_CHANGE_REQUIRES_ACK') {
          toast.error(t('publishedChangeRequired'));
        } else {
          toast.error(t('deleteFailed'), { description: err?.message });
        }
      },
    }
  );

  return {
    shifts: shifts ?? [],
    isLoadingShifts,
    isFetchingShifts,
    refetchShifts,
    generatePlan,
    isGenerating,
    deleteGenerated,
    isDeleting,
    invalidateAll,
  };
};
