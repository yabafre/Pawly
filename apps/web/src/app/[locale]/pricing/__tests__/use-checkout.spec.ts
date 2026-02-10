import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCheckout } from '../_hooks/useCheckout';
import { useServerActionMutation } from '@/lib/hooks/server-action-hooks';

// Mock ZSA hooks
vi.mock('@/lib/hooks/server-action-hooks', () => ({
  QueryKeyFactory: {
    checkout: () => ['checkout'],
  },
  useServerActionMutation: vi.fn(),
  useServerActionQuery: vi.fn(),
  useServerActionInfiniteQuery: vi.fn(),
}));

describe('useCheckout', () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useServerActionMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
    });
  });

  it('returns checkout function, isPending, and error', () => {
    const { result } = renderHook(() => useCheckout());

    expect(result.current.checkout).toBe(mockMutate);
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('passes createCheckoutSessionAction to useServerActionMutation', () => {
    renderHook(() => useCheckout());

    expect(useServerActionMutation).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  it('reflects isPending state', () => {
    (useServerActionMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      error: null,
    });

    const { result } = renderHook(() => useCheckout());
    expect(result.current.isPending).toBe(true);
  });

  it('reflects error state', () => {
    const mockError = new Error('checkout failed');
    (useServerActionMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: mockError,
    });

    const { result } = renderHook(() => useCheckout());
    expect(result.current.error).toBe(mockError);
  });
});
