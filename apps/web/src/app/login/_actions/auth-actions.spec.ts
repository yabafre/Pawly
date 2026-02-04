import { vi, describe, it, expect, beforeEach } from 'vitest';

// Use vi.hoisted so that mock functions are available inside hoisted vi.mock factories
const {
  mockCookieSet,
  mockLoginMutate,
  mockRequestMagicLinkMutate,
  capturedHandlers,
  capturedShapeErrors,
} = vi.hoisted(() => {
  const capturedHandlers: Record<string, (args: any) => any> = {};
  const capturedShapeErrors: Record<string, (args: any) => any> = {};

  // createServerAction builder that captures the handler/shapeError for direct testing
  const createMockServerAction = (name: string) => {
    const builder: any = {
      input: () => builder,
      output: () => builder,
      experimental_shapeError: (fn: any) => {
        capturedShapeErrors[name] = fn;
        return builder;
      },
      handler: (fn: any) => {
        capturedHandlers[name] = fn;
        // Return a callable that mimics ZSA's [data, error] tuple pattern
        const action = async (input: any) => {
          try {
            const result = await fn({ input });
            return [result, null];
          } catch (err) {
            const shapeFn = capturedShapeErrors[name];
            const shaped = shapeFn ? shapeFn({ err }) : { code: 'ERROR', message: String(err) };
            return [null, shaped];
          }
        };
        return action;
      },
    };
    return builder;
  };

  let actionCounter = 0;
  return {
    mockCookieSet: vi.fn(),
    mockLoginMutate: vi.fn(),
    mockRequestMagicLinkMutate: vi.fn(),
    capturedHandlers,
    capturedShapeErrors,
    createMockServerAction,
    getActionCounter: () => actionCounter++,
  };
});

// Mock "next/headers"
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: mockCookieSet,
    get: vi.fn(),
  }),
}));

// Mock the tRPC client
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    auth: {
      login: { mutate: mockLoginMutate },
      requestMagicLink: { mutate: mockRequestMagicLinkMutate },
    },
  },
}));

// Mock ZSA to capture handlers and provide controllable behavior
vi.mock('zsa', async () => {
  const actual = await vi.importActual('zsa');
  let actionIndex = 0;
  const actionNames = ['login', 'requestMagicLink'];

  return {
    ...actual,
    createServerAction: () => {
      const name = actionNames[actionIndex] || `action_${actionIndex}`;
      actionIndex++;

      const builder: any = {
        input: () => builder,
        output: () => builder,
        experimental_shapeError: (fn: any) => {
          capturedShapeErrors[name] = fn;
          return builder;
        },
        handler: (fn: any) => {
          capturedHandlers[name] = fn;
          const action = async (input: any) => {
            try {
              const result = await fn({ input });
              return [result, null];
            } catch (err: unknown) {
              const shapeFn = capturedShapeErrors[name];
              const shaped = shapeFn ? shapeFn({ err }) : { code: 'ERROR', message: String(err) };
              return [null, shaped];
            }
          };
          return action;
        },
      };
      return builder;
    },
  };
});

// Import after mocks are set up
import { loginAction, requestMagicLinkAction } from './auth-actions';

describe('auth-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export loginAction', () => {
      expect(loginAction).toBeDefined();
      expect(typeof loginAction).toBe('function');
    });

    it('should export requestMagicLinkAction', () => {
      expect(requestMagicLinkAction).toBeDefined();
      expect(typeof requestMagicLinkAction).toBe('function');
    });
  });

  describe('loginAction', () => {
    const validInput = {
      email: 'vet@pawly.com',
      password: 'SecurePass123!',
      clinicId: '00000000-0000-4000-8000-000000000001',
    };

    const validResponse = {
      access_token: 'jwt-token-abc',
      refresh_token: 'refresh-token-xyz',
      user: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        email: 'vet@pawly.com',
        role: 'ADMIN' as const,
        clinicId: '00000000-0000-4000-8000-000000000001',
      },
    };

    it('should call trpc.auth.login.mutate and set auth cookie on success', async () => {
      mockLoginMutate.mockResolvedValue(validResponse);

      const [result, error] = await loginAction(validInput);

      expect(mockLoginMutate).toHaveBeenCalledWith(validInput);
      expect(error).toBeNull();
      expect(result).toEqual(validResponse);
      expect(mockCookieSet).toHaveBeenCalledWith(
        'auth-token',
        'jwt-token-abc',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 86400,
          path: '/',
        }),
      );
    });

    it('should return shaped error when trpc mutation fails with Error', async () => {
      mockLoginMutate.mockRejectedValue(new Error('Invalid credentials'));

      const [data, error] = await loginAction(validInput);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error).toEqual(
        expect.objectContaining({
          message: 'Invalid credentials',
        }),
      );
    });

    it('should return SERVER_ERROR code for non-Error thrown values', async () => {
      mockLoginMutate.mockRejectedValue('string error');

      const [data, error] = await loginAction(validInput);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error).toEqual(
        expect.objectContaining({
          code: 'SERVER_ERROR',
          message: 'Une erreur est survenue',
        }),
      );
    });

    it('should extract error code from object with code property', async () => {
      mockLoginMutate.mockRejectedValue({ code: 'UNAUTHORIZED', message: 'Bad creds' });

      const [, error] = await loginAction(validInput);

      expect(error).not.toBeNull();
      expect(error).toEqual(
        expect.objectContaining({
          code: 'UNAUTHORIZED',
        }),
      );
    });

    it('should extract error code from object with data.code property', async () => {
      mockLoginMutate.mockRejectedValue({
        data: { code: 'NOT_FOUND' },
        message: 'Not found',
      });

      const [, error] = await loginAction(validInput);

      expect(error).not.toBeNull();
      expect(error).toEqual(
        expect.objectContaining({
          code: 'NOT_FOUND',
        }),
      );
    });

    it('should extract error code from object with shape.code property', async () => {
      mockLoginMutate.mockRejectedValue({
        shape: { code: 'BAD_REQUEST' },
        message: 'Bad request',
      });

      const [, error] = await loginAction(validInput);

      expect(error).not.toBeNull();
      expect(error).toEqual(
        expect.objectContaining({
          code: 'BAD_REQUEST',
        }),
      );
    });

    it('should not set auth cookie when trpc call fails', async () => {
      mockLoginMutate.mockRejectedValue(new Error('Fail'));

      await loginAction(validInput);

      expect(mockCookieSet).not.toHaveBeenCalled();
    });

    it('should set cookie with secure=false in non-production', async () => {
      mockLoginMutate.mockResolvedValue(validResponse);

      await loginAction(validInput);

      expect(mockCookieSet).toHaveBeenCalledWith(
        'auth-token',
        expect.any(String),
        expect.objectContaining({
          secure: process.env.NODE_ENV === 'production',
        }),
      );
    });
  });

  describe('requestMagicLinkAction', () => {
    const validInput = {
      email: 'vet@pawly.com',
      clinicId: '00000000-0000-4000-8000-000000000001',
    };

    it('should call trpc.auth.requestMagicLink.mutate on success', async () => {
      mockRequestMagicLinkMutate.mockResolvedValue({ message: 'Magic link sent' });

      const [result, error] = await requestMagicLinkAction(validInput);

      expect(mockRequestMagicLinkMutate).toHaveBeenCalledWith(validInput);
      expect(error).toBeNull();
      expect(result).toEqual({ message: 'Magic link sent' });
    });

    it('should return shaped error on mutation failure', async () => {
      mockRequestMagicLinkMutate.mockRejectedValue(new Error('User not found'));

      const [data, error] = await requestMagicLinkAction(validInput);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error).toEqual(
        expect.objectContaining({
          message: 'User not found',
        }),
      );
    });

    it('should return SERVER_ERROR for non-Error thrown values', async () => {
      mockRequestMagicLinkMutate.mockRejectedValue(42);

      const [, error] = await requestMagicLinkAction(validInput);

      expect(error).toEqual(
        expect.objectContaining({
          code: 'SERVER_ERROR',
          message: 'Une erreur est survenue',
        }),
      );
    });

    it('should not set any cookie on magic link request', async () => {
      mockRequestMagicLinkMutate.mockResolvedValue({ message: 'sent' });

      await requestMagicLinkAction(validInput);

      expect(mockCookieSet).not.toHaveBeenCalled();
    });
  });

  describe('error shaping (via shapeError)', () => {
    it('should have registered shapeError for login action', () => {
      expect(capturedShapeErrors['login']).toBeDefined();
      expect(typeof capturedShapeErrors['login']).toBe('function');
    });

    it('should shape Error instances correctly', () => {
      const shapeFn = capturedShapeErrors['login'];
      const result = shapeFn({ err: new Error('test error') });

      expect(result).toEqual({
        code: 'SERVER_ERROR',
        message: 'test error',
      });
    });

    it('should shape non-Error values with default message', () => {
      const shapeFn = capturedShapeErrors['login'];
      const result = shapeFn({ err: null });

      expect(result).toEqual({
        code: 'SERVER_ERROR',
        message: 'Une erreur est survenue',
      });
    });

    it('should extract code from error object with code property', () => {
      const shapeFn = capturedShapeErrors['login'];
      const result = shapeFn({ err: { code: 'UNAUTHORIZED', message: 'denied' } });

      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should extract code from error object with data.code property', () => {
      const shapeFn = capturedShapeErrors['login'];
      const result = shapeFn({ err: { data: { code: 'NOT_FOUND' } } });

      expect(result.code).toBe('NOT_FOUND');
    });

    it('should extract code from error object with shape.code property', () => {
      const shapeFn = capturedShapeErrors['login'];
      const result = shapeFn({ err: { shape: { code: 'BAD_REQUEST' } } });

      expect(result.code).toBe('BAD_REQUEST');
    });

    it('should prioritize code over data.code over shape.code', () => {
      const shapeFn = capturedShapeErrors['login'];
      const result = shapeFn({
        err: {
          code: 'TOP_LEVEL',
          data: { code: 'DATA_LEVEL' },
          shape: { code: 'SHAPE_LEVEL' },
        },
      });

      expect(result.code).toBe('TOP_LEVEL');
    });

    it('should fallback to data.code when code is undefined', () => {
      const shapeFn = capturedShapeErrors['login'];
      const result = shapeFn({
        err: {
          data: { code: 'DATA_LEVEL' },
          shape: { code: 'SHAPE_LEVEL' },
        },
      });

      expect(result.code).toBe('DATA_LEVEL');
    });

    it('should use SERVER_ERROR when no code found anywhere', () => {
      const shapeFn = capturedShapeErrors['login'];
      const result = shapeFn({ err: {} });

      expect(result.code).toBe('SERVER_ERROR');
    });

    it('should have registered shapeError for requestMagicLink action', () => {
      expect(capturedShapeErrors['requestMagicLink']).toBeDefined();
      expect(typeof capturedShapeErrors['requestMagicLink']).toBe('function');
    });
  });
});
