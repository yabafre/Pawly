import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { toast } from 'sonner';
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

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('useAuth', () => {
  const mockMutateAsync = vi.fn();
  const mockReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    process.env.NEXT_PUBLIC_CLINIC_ID = '00000000-0000-0000-0000-000000000001';

    (useQueryClient as any).mockReturnValue({
      invalidateQueries: vi.fn(),
    });

    (useServerActionMutation as any).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isSuccess: false,
      reset: mockReset,
    });
  });

  describe('login', () => {
    it('should call login mutation and store tokens on success', async () => {
      const mockData = { access_token: 'token123', user: { role: 'ADMIN', email: 'test@example.com' } };
      mockMutateAsync.mockResolvedValue([mockData, null]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' });
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
        clinicId: '00000000-0000-0000-0000-000000000001',
      });
      expect(localStorage.getItem('token')).toBe('token123');
      expect(toast.success).toHaveBeenCalledWith('Connexion réussie !');
    });

    it('should redirect ADMIN users to /admin/planning', async () => {
      const mockData = { access_token: 'token', user: { role: 'ADMIN' } };
      mockMutateAsync.mockResolvedValue([mockData, null]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'admin@test.com', password: 'pass' });
      });

      expect(mockPush).toHaveBeenCalledWith('/admin/planning');
    });

    it('should redirect non-ADMIN users to /dashboard', async () => {
      const mockData = { access_token: 'token', user: { role: 'EMPLOYEE' } };
      mockMutateAsync.mockResolvedValue([mockData, null]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'employee@test.com', password: 'pass' });
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });

    it('should show error toast on login failure', async () => {
      mockMutateAsync.mockResolvedValue([null, { message: 'Invalid credentials' }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@test.com', password: 'wrong' });
      });

      expect(toast.error).toHaveBeenCalledWith('Invalid credentials');
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('requestMagicLink', () => {
    it('should show success toast on magic link request', async () => {
      mockMutateAsync.mockResolvedValue([{ message: 'sent' }, null]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.requestMagicLink('test@example.com');
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({
        email: 'test@example.com',
        clinicId: '00000000-0000-0000-0000-000000000001',
      });
      expect(toast.success).toHaveBeenCalledWith('Lien de connexion envoyé !');
    });

    it('should show error toast on magic link failure', async () => {
      mockMutateAsync.mockResolvedValue([null, { message: 'User not found' }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.requestMagicLink('unknown@test.com');
      });

      expect(toast.error).toHaveBeenCalledWith('User not found');
    });
  });

  describe('resetMagicLink', () => {
    it('should call reset on magic link mutation', () => {
      const { result } = renderHook(() => useAuth());

      act(() => {
        result.current.resetMagicLink();
      });

      expect(mockReset).toHaveBeenCalled();
    });
  });
});
