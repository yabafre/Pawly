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
    process.env.NEXT_PUBLIC_CLINIC_ID = '00000000-0000-4000-8000-000000000001';

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
      const mockData = {
        access_token: 'token123',
        refresh_token: 'refresh123',
        user: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          role: 'ADMIN',
          email: 'test@example.com',
          clinicId: '00000000-0000-4000-8000-000000000001',
        },
      };
      mockMutateAsync.mockResolvedValue([mockData, null]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' });
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
        clinicId: '00000000-0000-4000-8000-000000000001',
      });
      expect(localStorage.getItem('token')).toBe('token123');
      expect(toast.success).toHaveBeenCalledWith('Connexion réussie !');
    });

    it('should store user data in localStorage on success', async () => {
      const mockUser = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        role: 'ADMIN',
        email: 'test@example.com',
        clinicId: '00000000-0000-4000-8000-000000000001',
      };
      const mockData = {
        access_token: 'token123',
        refresh_token: 'refresh123',
        user: mockUser,
      };
      mockMutateAsync.mockResolvedValue([mockData, null]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' });
      });

      expect(localStorage.getItem('user')).toBe(JSON.stringify(mockUser));
    });

    it('should redirect ADMIN users to /admin/planning', async () => {
      const mockData = {
        access_token: 'token',
        refresh_token: 'refresh',
        user: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          role: 'ADMIN',
          email: 'admin@test.com',
          clinicId: '00000000-0000-4000-8000-000000000001',
        },
      };
      mockMutateAsync.mockResolvedValue([mockData, null]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'admin@test.com', password: 'pass' });
      });

      expect(mockPush).toHaveBeenCalledWith('/admin/planning');
    });

    it('should redirect non-ADMIN users to /dashboard', async () => {
      const mockData = {
        access_token: 'token',
        refresh_token: 'refresh',
        user: {
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          role: 'EMPLOYEE',
          email: 'employee@test.com',
          clinicId: '00000000-0000-4000-8000-000000000001',
        },
      };
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

    it('should use default error message when error has no message', async () => {
      mockMutateAsync.mockResolvedValue([null, {}]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@test.com', password: 'wrong' });
      });

      expect(toast.error).toHaveBeenCalledWith('Email ou mot de passe incorrect');
    });

    it('should show network error toast on TypeError with fetch', async () => {
      mockMutateAsync.mockRejectedValue(new TypeError('Failed to fetch'));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@test.com', password: 'pass' });
      });

      expect(toast.error).toHaveBeenCalledWith('Problème de connexion au serveur');
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('should show generic error toast on unexpected exceptions', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Something unexpected'));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@test.com', password: 'pass' });
      });

      expect(toast.error).toHaveBeenCalledWith('Une erreur inattendue est survenue');
    });

    it('should not redirect or store data when login returns error', async () => {
      mockMutateAsync.mockResolvedValue([null, { message: 'Nope' }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@test.com', password: 'wrong' });
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });

    it('should use fallback clinic ID when env variable is not set', async () => {
      delete process.env.NEXT_PUBLIC_CLINIC_ID;

      const mockData = {
        access_token: 'token',
        refresh_token: 'refresh',
        user: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          role: 'ADMIN',
          email: 'test@test.com',
          clinicId: '00000000-0000-4000-8000-000000000001',
        },
      };
      mockMutateAsync.mockResolvedValue([mockData, null]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@test.com', password: 'pass' });
      });

      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          clinicId: '00000000-0000-4000-8000-000000000001',
        }),
      );
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
        clinicId: '00000000-0000-4000-8000-000000000001',
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

    it('should use default error message when magic link error has no message', async () => {
      mockMutateAsync.mockResolvedValue([null, {}]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.requestMagicLink('test@test.com');
      });

      expect(toast.error).toHaveBeenCalledWith('Une erreur est survenue');
    });

    it('should show network error toast on TypeError with fetch for magic link', async () => {
      mockMutateAsync.mockRejectedValue(new TypeError('Failed to fetch'));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.requestMagicLink('test@test.com');
      });

      expect(toast.error).toHaveBeenCalledWith('Problème de connexion au serveur');
    });

    it('should show generic error toast on unexpected magic link exceptions', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Random failure'));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.requestMagicLink('test@test.com');
      });

      expect(toast.error).toHaveBeenCalledWith("Impossible d'envoyer le lien");
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

  describe('pending and success states', () => {
    it('should expose isLoginPending from login mutation', () => {
      (useServerActionMutation as any).mockReturnValueOnce({
        mutateAsync: mockMutateAsync,
        isPending: true,
        isSuccess: false,
        reset: mockReset,
      }).mockReturnValueOnce({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isSuccess: false,
        reset: mockReset,
      });

      const { result } = renderHook(() => useAuth());

      expect(result.current.isLoginPending).toBe(true);
    });

    it('should expose isMagicPending from magic link mutation', () => {
      (useServerActionMutation as any).mockReturnValueOnce({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isSuccess: false,
        reset: mockReset,
      }).mockReturnValueOnce({
        mutateAsync: mockMutateAsync,
        isPending: true,
        isSuccess: false,
        reset: mockReset,
      });

      const { result } = renderHook(() => useAuth());

      expect(result.current.isMagicPending).toBe(true);
    });

    it('should expose isMagicSuccess from magic link mutation', () => {
      (useServerActionMutation as any).mockReturnValueOnce({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isSuccess: false,
        reset: mockReset,
      }).mockReturnValueOnce({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isSuccess: true,
        reset: mockReset,
      });

      const { result } = renderHook(() => useAuth());

      expect(result.current.isMagicSuccess).toBe(true);
    });
  });
});
