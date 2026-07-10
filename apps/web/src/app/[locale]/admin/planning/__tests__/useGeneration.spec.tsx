import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Story 11-1 (AC6): the guard error PUBLISHED_CHANGE_REQUIRES_ACK must map to a
// dedicated translated toast, never the raw code. The web GenerationPanel spec
// mocks useGeneration wholesale, so this hook-level test is the only automated
// proof of the onError → toast mapping (the live toast text is confirmed in the
// aped-review L2 journey). We keep the real QueryKeyFactory and stub only the
// zsa mutation/query wrappers, capturing the options object so the test can
// drive onError directly.
// ---------------------------------------------------------------------------

vi.mock('../_actions/generation-actions', () => ({
  generatePlanAction: vi.fn(),
  listShiftsForMonthAction: vi.fn(),
  deleteGeneratedShiftsAction: vi.fn(),
}));

type MutationOptions = {
  onSuccess?: () => void;
  onError?: (err: { message?: string }) => void;
};

const captured = vi.hoisted(() => ({
  generate: undefined as MutationOptions | undefined,
  delete: undefined as MutationOptions | undefined,
}));

vi.mock('@/lib/hooks/server-action-hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hooks/server-action-hooks')>();
  const { generatePlanAction, deleteGeneratedShiftsAction } =
    await import('../_actions/generation-actions');
  return {
    ...actual,
    useServerActionQuery: () => ({
      data: [],
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    }),
    useServerActionMutation: (action: unknown, options: MutationOptions) => {
      if (action === generatePlanAction) captured.generate = options;
      else if (action === deleteGeneratedShiftsAction) captured.delete = options;
      return { mutate: vi.fn(), isPending: false };
    },
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useGeneration } from '../_hooks/useGeneration';
import { toast } from 'sonner';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('useGeneration — published-change guard toast (story 11-1, AC6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.generate = undefined;
    captured.delete = undefined;
  });

  it('maps PUBLISHED_CHANGE_REQUIRES_ACK to the dedicated toast on generate', () => {
    renderHook(() => useGeneration('2026-07'), { wrapper });
    captured.generate?.onError?.({ message: 'PUBLISHED_CHANGE_REQUIRES_ACK' });
    // next-intl is globally mocked to echo the key.
    expect(toast.error).toHaveBeenCalledWith('publishedChangeRequired');
  });

  it('maps PUBLISHED_CHANGE_REQUIRES_ACK to the dedicated toast on delete', () => {
    renderHook(() => useGeneration('2026-07'), { wrapper });
    captured.delete?.onError?.({ message: 'PUBLISHED_CHANGE_REQUIRES_ACK' });
    expect(toast.error).toHaveBeenCalledWith('publishedChangeRequired');
  });

  it('falls back to the generic error toast (with description) for other errors', () => {
    renderHook(() => useGeneration('2026-07'), { wrapper });
    captured.generate?.onError?.({ message: 'boom' });
    expect(toast.error).toHaveBeenCalledWith('generateFailed', {
      description: 'boom',
    });
  });
});
