import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Review F1 (AC7): a shift mutation on a published month bumps the amendment
// counters, so invalidateSchedule() must also invalidate the publicationStatus
// query — otherwise the Health Bar "amended" badge stays stale in-session.
// This locks the invalidation so it cannot silently regress in CI (the live
// L2 journey is the end-to-end proof, this is the fast guard).
// ---------------------------------------------------------------------------

const { invalidateQueries, queryClientMock } = vi.hoisted(() => {
  const invalidateQueries = vi.fn();
  return {
    invalidateQueries,
    queryClientMock: {
      invalidateQueries,
      cancelQueries: vi.fn(),
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
    },
  };
});

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQueryClient: () => queryClientMock };
});

vi.mock('../_actions/shift-mutation-actions', () => ({
  moveShiftAction: vi.fn(),
  createManualShiftAction: vi.fn(),
  deleteShiftAction: vi.fn(),
}));

// Keep the real QueryKeyFactory (the keys under test); stub only the mutation
// wrapper so no server action is invoked.
vi.mock('@/lib/hooks/server-action-hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hooks/server-action-hooks')>();
  return {
    ...actual,
    useServerActionMutation: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useShiftMutations } from '../_hooks/useShiftMutations';

describe('useShiftMutations.invalidateSchedule (review F1, AC7)', () => {
  it('invalidates the publicationStatus query so the amended badge refreshes', () => {
    invalidateQueries.mockClear();
    const { result } = renderHook(() => useShiftMutations('2026-07'));
    result.current.invalidateSchedule();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['planning', 'publication-status', '2026-07'],
    });
  });
});
