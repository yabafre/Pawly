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
// Mock @/i18n/navigation (next-intl navigation wrappers)
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  redirect: vi.fn(),
  Link: vi.fn(),
}));

describe('useAuth', () => {
  const mockMutateAsync = vi.fn();
  const mockReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue({
      invalidateQueries: vi.fn(),
    });

    (useServerActionMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isSuccess: false,
      reset: mockReset,
    });
  });

  describe('login', () => {
    it('should call login mutation and show success toast', async () => {
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
      });
      expect(localStorage.getItem('token')).toBeNull();
      // Mock returns just the key (useTranslations mock behavior)
      expect(toast.success).toHaveBeenCalledWith('loginSuccess');
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
      expect(localStorage.getItem('user')).toBeNull();
    });

    it('should use default error message when error has no message', async () => {
      mockMutateAsync.mockResolvedValue([null, {}]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@test.com', password: 'wrong' });
      });

      // Mock returns just the key (useTranslations mock behavior)
      expect(toast.error).toHaveBeenCalledWith('loginError');
    });

    it('should show network error toast on TypeError with fetch', async () => {
      mockMutateAsync.mockRejectedValue(new TypeError('Failed to fetch'));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@test.com', password: 'pass' });
      });

      // Mock returns just the key (useTranslations mock behavior)
      expect(toast.error).toHaveBeenCalledWith('serverError');
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('should show generic error toast on unexpected exceptions', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Something unexpected'));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@test.com', password: 'pass' });
      });

      // Mock returns just the key (useTranslations mock behavior)
      expect(toast.error).toHaveBeenCalledWith('unexpectedError');
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
      });
      // Mock returns just the key (useTranslations mock behavior)
      expect(toast.success).toHaveBeenCalledWith('magicLinkSent');
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

      // Mock returns just the key (useTranslations mock behavior)
      expect(toast.error).toHaveBeenCalledWith('magicLinkError');
    });

    it('should show network error toast on TypeError with fetch for magic link', async () => {
      mockMutateAsync.mockRejectedValue(new TypeError('Failed to fetch'));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.requestMagicLink('test@test.com');
      });

      // Mock returns just the key (useTranslations mock behavior)
      expect(toast.error).toHaveBeenCalledWith('serverError');
    });

    it('should show generic error toast on unexpected magic link exceptions', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Random failure'));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.requestMagicLink('test@test.com');
      });

      // Mock returns just the key (useTranslations mock behavior)
      expect(toast.error).toHaveBeenCalledWith('magicLinkError');
    });
  });

  describe('requestOtp', () => {
    it('should return method on successful OTP request', async () => {
      mockMutateAsync.mockResolvedValue([{ method: 'otp', message: 'sent' }, null]);

      const { result } = renderHook(() => useAuth());

      let method: string | null = null;
      await act(async () => {
        method = await result.current.requestOtp('employee@clinic.fr');
      });

      expect(method).toBe('otp');
    });

    it('should return magic_link method when in fallback mode', async () => {
      mockMutateAsync.mockResolvedValue([{ method: 'magic_link', message: 'sent' }, null]);

      const { result } = renderHook(() => useAuth());

      let method: string | null = null;
      await act(async () => {
        method = await result.current.requestOtp('employee@clinic.fr');
      });

      expect(method).toBe('magic_link');
    });

    it('should show error toast on OTP request failure', async () => {
      mockMutateAsync.mockResolvedValue([null, { message: 'Send failed' }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.requestOtp('employee@clinic.fr');
      });

      expect(toast.error).toHaveBeenCalledWith('Send failed');
    });

    it('should show network error toast on TypeError', async () => {
      mockMutateAsync.mockRejectedValue(new TypeError('Failed to fetch'));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.requestOtp('employee@clinic.fr');
      });

      expect(toast.error).toHaveBeenCalledWith('serverError');
    });

    it('should return null on error', async () => {
      mockMutateAsync.mockResolvedValue([null, { message: 'Error' }]);

      const { result } = renderHook(() => useAuth());

      let method: string | null = 'not-null';
      await act(async () => {
        method = await result.current.requestOtp('employee@clinic.fr');
      });

      expect(method).toBeNull();
    });
  });

  describe('verifyOtp', () => {
    it('should redirect EMPLOYEE to /dashboard on success', async () => {
      const mockData = {
        access_token: 'token',
        refresh_token: 'refresh',
        user: { id: 'u1', role: 'EMPLOYEE', email: 'e@c.fr', clinicId: 'c1' },
      };
      mockMutateAsync.mockResolvedValue([mockData, null]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.verifyOtp('e@c.fr', '428715');
      });

      expect(toast.success).toHaveBeenCalledWith('loginSuccess');
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });

    it('should redirect ADMIN to /admin/planning on success', async () => {
      const mockData = {
        access_token: 'token',
        refresh_token: 'refresh',
        user: { id: 'u1', role: 'ADMIN', email: 'a@c.fr', clinicId: 'c1' },
      };
      mockMutateAsync.mockResolvedValue([mockData, null]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.verifyOtp('a@c.fr', '428715');
      });

      expect(mockPush).toHaveBeenCalledWith('/admin/planning');
    });

    it('should show error toast on invalid code', async () => {
      mockMutateAsync.mockResolvedValue([null, { message: 'Invalid code' }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.verifyOtp('e@c.fr', '000000');
      });

      expect(toast.error).toHaveBeenCalledWith('Invalid code');
    });

    it('should return false on error', async () => {
      mockMutateAsync.mockResolvedValue([null, { message: 'Error' }]);

      const { result } = renderHook(() => useAuth());

      let success = true;
      await act(async () => {
        success = await result.current.verifyOtp('e@c.fr', '000000');
      });

      expect(success).toBe(false);
    });

    it('should return true on success', async () => {
      const mockData = {
        access_token: 'token',
        refresh_token: 'refresh',
        user: { id: 'u1', role: 'EMPLOYEE', email: 'e@c.fr', clinicId: 'c1' },
      };
      mockMutateAsync.mockResolvedValue([mockData, null]);

      const { result } = renderHook(() => useAuth());

      let success = false;
      await act(async () => {
        success = await result.current.verifyOtp('e@c.fr', '428715');
      });

      expect(success).toBe(true);
    });

    it('should show network error toast on TypeError', async () => {
      mockMutateAsync.mockRejectedValue(new TypeError('Failed to fetch'));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.verifyOtp('e@c.fr', '428715');
      });

      expect(toast.error).toHaveBeenCalledWith('serverError');
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
      (useServerActionMutation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
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
      (useServerActionMutation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
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
      (useServerActionMutation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
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
