import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useMagicLinkCallback } from './useMagicLinkCallback';
import { useServerActionMutation } from '@/lib/hooks/server-action-hooks';
import { useQueryClient } from '@tanstack/react-query';

// Mock ZSA hooks
vi.mock('@/lib/hooks/server-action-hooks', () => ({
  QueryKeyFactory: {
    auth: () => ['auth'],
  },
  useServerActionMutation: vi.fn(),
  useServerActionQuery: vi.fn(),
  useServerActionInfiniteQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(),
}));

// Mock the server action module to prevent "use server" issues
vi.mock('../_actions/magic-link-actions', () => ({
  validateMagicLinkAction: vi.fn(),
}));

describe('useMagicLinkCallback', () => {
  const mockMutateAsync = vi.fn();
  const mockInvalidateQueries = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useQueryClient as any).mockReturnValue({
      invalidateQueries: mockInvalidateQueries,
    });

    (useServerActionMutation as any).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    });
  });

  describe('initialization', () => {
    it('should call useServerActionMutation with validateMagicLinkAction', () => {
      renderHook(() => useMagicLinkCallback());

      expect(useServerActionMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          returnError: true,
          onSettled: expect.any(Function),
        }),
      );
    });

    it('should return the expected shape', () => {
      const { result } = renderHook(() => useMagicLinkCallback());

      expect(result.current).toEqual({
        validateMagicLink: expect.any(Function),
        isPending: false,
        isSuccess: false,
        isError: false,
        error: null,
      });
    });
  });

  describe('validateMagicLink', () => {
    it('should call mutateAsync with token object', async () => {
      const mockResponse = {
        access_token: 'jwt-token',
        refresh_token: 'refresh-token',
        user: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          email: 'vet@pawly.com',
          role: 'ADMIN',
          clinicId: '00000000-0000-4000-8000-000000000001',
        },
      };
      mockMutateAsync.mockResolvedValue([mockResponse, null]);

      const { result } = renderHook(() => useMagicLinkCallback());

      await act(async () => {
        await result.current.validateMagicLink('abc123def456');
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({ token: 'abc123def456' });
    });

    it('should return the mutation result', async () => {
      const mockResponse = [{ access_token: 'tok' }, null];
      mockMutateAsync.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useMagicLinkCallback());

      let returnValue: unknown;
      await act(async () => {
        returnValue = await result.current.validateMagicLink('token123');
      });

      expect(returnValue).toEqual(mockResponse);
    });

    it('should propagate errors from mutateAsync', async () => {
      const error = new Error('Token expired');
      mockMutateAsync.mockRejectedValue(error);

      const { result } = renderHook(() => useMagicLinkCallback());

      await expect(
        act(async () => {
          await result.current.validateMagicLink('expired-token');
        }),
      ).rejects.toThrow('Token expired');
    });
  });

  describe('onSettled callback', () => {
    it('should invalidate auth queries when onSettled is called', async () => {
      renderHook(() => useMagicLinkCallback());

      // Extract the onSettled callback that was passed to useServerActionMutation
      const callArgs = (useServerActionMutation as any).mock.calls[0];
      const options = callArgs[1];
      const onSettled = options.onSettled;

      await onSettled();

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['auth'],
      });
    });
  });

  describe('state exposure', () => {
    it('should expose isPending as true when mutation is pending', () => {
      (useServerActionMutation as any).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: true,
        isSuccess: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useMagicLinkCallback());

      expect(result.current.isPending).toBe(true);
    });

    it('should expose isSuccess as true when mutation succeeds', () => {
      (useServerActionMutation as any).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isSuccess: true,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useMagicLinkCallback());

      expect(result.current.isSuccess).toBe(true);
    });

    it('should expose isError as true when mutation fails', () => {
      (useServerActionMutation as any).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isSuccess: false,
        isError: true,
        error: { message: 'Something went wrong' },
      });

      const { result } = renderHook(() => useMagicLinkCallback());

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual({ message: 'Something went wrong' });
    });

    it('should expose error as null when there is no error', () => {
      const { result } = renderHook(() => useMagicLinkCallback());

      expect(result.current.error).toBeNull();
    });
  });
});
