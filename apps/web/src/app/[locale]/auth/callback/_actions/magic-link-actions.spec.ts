import { vi, describe, it, expect, beforeEach } from 'vitest';

// Use vi.hoisted so that mock functions are available inside hoisted vi.mock factories
const {
  mockCookieSet,
  mockValidateMagicLinkMutate,
  capturedHandlers,
  capturedShapeErrors,
} = vi.hoisted(() => {
  const capturedHandlers: Record<string, (args: { input: unknown }) => unknown> = {};
  const capturedShapeErrors: Record<string, (args: { err: unknown }) => unknown> = {};

  return {
    mockCookieSet: vi.fn(),
    mockValidateMagicLinkMutate: vi.fn(),
    capturedHandlers,
    capturedShapeErrors,
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
      validateMagicLink: { mutate: mockValidateMagicLinkMutate },
    },
  },
}));

// Mock ZSA to capture handlers and provide controllable behavior
vi.mock('zsa', async () => {
  const actual = await vi.importActual('zsa');

  return {
    ...actual,
    createServerAction: () => {
      const name = 'validateMagicLink';

      const builder: Record<string, unknown> = {
        input: () => builder,
        output: () => builder,
        experimental_shapeError: (fn: (args: { err: unknown }) => unknown) => {
          capturedShapeErrors[name] = fn;
          return builder;
        },
        handler: (fn: (args: { input: unknown }) => Promise<unknown>) => {
          capturedHandlers[name] = fn;
          const action = async (input: unknown) => {
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
import { validateMagicLinkAction } from './magic-link-actions';

describe('magic-link-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export validateMagicLinkAction', () => {
      expect(validateMagicLinkAction).toBeDefined();
      expect(typeof validateMagicLinkAction).toBe('function');
    });
  });

  describe('validateMagicLinkAction', () => {
    const validToken = 'a'.repeat(64);

    const validResponse = {
      access_token: 'jwt-magic-token',
      refresh_token: 'refresh-magic-token',
      user: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        email: 'vet@pawly.com',
        role: 'ADMIN' as const,
        clinicId: '00000000-0000-4000-8000-000000000001',
      },
    };

    it('should call trpc.auth.validateMagicLink.mutate and set auth cookie on success', async () => {
      mockValidateMagicLinkMutate.mockResolvedValue(validResponse);

      const [result, error] = await validateMagicLinkAction({ token: validToken });

      expect(mockValidateMagicLinkMutate).toHaveBeenCalledWith({ token: validToken });
      expect(error).toBeNull();
      expect(result).toEqual(validResponse);
      expect(mockCookieSet).toHaveBeenCalledWith(
        'auth-token',
        'jwt-magic-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 86400,
          path: '/',
        }),
      );
    });

    it('should return shaped error with Error message when trpc mutation fails', async () => {
      mockValidateMagicLinkMutate.mockRejectedValue(new Error('Token expired'));

      const [data, error] = await validateMagicLinkAction({ token: validToken });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error).toEqual(
        expect.objectContaining({
          message: 'Token expired',
        }),
      );
    });

    it('should return SERVER_ERROR code for non-Error thrown values', async () => {
      mockValidateMagicLinkMutate.mockRejectedValue('unexpected');

      const [data, error] = await validateMagicLinkAction({ token: validToken });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error).toEqual(
        expect.objectContaining({
          code: 'SERVER_ERROR',
          message: 'An error occurred',
        }),
      );
    });

    it('should extract error code from object with code property', async () => {
      mockValidateMagicLinkMutate.mockRejectedValue({
        code: 'UNAUTHORIZED',
        message: 'Invalid token',
      });

      const [, error] = await validateMagicLinkAction({ token: validToken });

      expect(error).not.toBeNull();
      expect(error).toEqual(
        expect.objectContaining({
          code: 'UNAUTHORIZED',
        }),
      );
    });

    it('should extract error code from object with data.code property', async () => {
      mockValidateMagicLinkMutate.mockRejectedValue({
        data: { code: 'EXPIRED' },
        message: 'Link expired',
      });

      const [, error] = await validateMagicLinkAction({ token: validToken });

      expect(error).not.toBeNull();
      expect(error).toEqual(
        expect.objectContaining({
          code: 'EXPIRED',
        }),
      );
    });

    it('should extract error code from object with shape.code property', async () => {
      mockValidateMagicLinkMutate.mockRejectedValue({
        shape: { code: 'RATE_LIMITED' },
        message: 'Too many attempts',
      });

      const [, error] = await validateMagicLinkAction({ token: validToken });

      expect(error).not.toBeNull();
      expect(error).toEqual(
        expect.objectContaining({
          code: 'RATE_LIMITED',
        }),
      );
    });

    it('should not set auth cookie when trpc call fails', async () => {
      mockValidateMagicLinkMutate.mockRejectedValue(new Error('Fail'));

      await validateMagicLinkAction({ token: validToken });

      expect(mockCookieSet).not.toHaveBeenCalled();
    });

    it('should set cookie with secure flag based on NODE_ENV', async () => {
      mockValidateMagicLinkMutate.mockResolvedValue(validResponse);

      await validateMagicLinkAction({ token: validToken });

      expect(mockCookieSet).toHaveBeenCalledWith(
        'auth-token',
        expect.any(String),
        expect.objectContaining({
          secure: process.env.NODE_ENV === 'production',
        }),
      );
    });
  });

  describe('error shaping (via shapeError)', () => {
    it('should have registered shapeError for validateMagicLink action', () => {
      expect(capturedShapeErrors['validateMagicLink']).toBeDefined();
      expect(typeof capturedShapeErrors['validateMagicLink']).toBe('function');
    });

    it('should shape Error instances with their message', () => {
      const shapeFn = capturedShapeErrors['validateMagicLink'];
      const result = shapeFn({ err: new Error('expired token') });

      expect(result).toEqual({
        code: 'SERVER_ERROR',
        message: 'expired token',
      });
    });

    it('should shape non-Error values with default message', () => {
      const shapeFn = capturedShapeErrors['validateMagicLink'];
      const result = shapeFn({ err: null });

      expect(result).toEqual({
        code: 'SERVER_ERROR',
        message: 'An error occurred',
      });
    });

    it('should extract code from error object with code property', () => {
      const shapeFn = capturedShapeErrors['validateMagicLink'];
      const result = shapeFn({ err: { code: 'UNAUTHORIZED', message: 'no access' } }) as { code: string };

      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should extract code from error object with data.code property', () => {
      const shapeFn = capturedShapeErrors['validateMagicLink'];
      const result = shapeFn({ err: { data: { code: 'TOKEN_EXPIRED' } } }) as { code: string };

      expect(result.code).toBe('TOKEN_EXPIRED');
    });

    it('should extract code from error object with shape.code property', () => {
      const shapeFn = capturedShapeErrors['validateMagicLink'];
      const result = shapeFn({ err: { shape: { code: 'INTERNAL_ERROR' } } }) as { code: string };

      expect(result.code).toBe('INTERNAL_ERROR');
    });

    it('should prioritize code over data.code over shape.code', () => {
      const shapeFn = capturedShapeErrors['validateMagicLink'];
      const result = shapeFn({
        err: {
          code: 'TOP_CODE',
          data: { code: 'DATA_CODE' },
          shape: { code: 'SHAPE_CODE' },
        },
      }) as { code: string };

      expect(result.code).toBe('TOP_CODE');
    });

    it('should use SERVER_ERROR when no code found anywhere', () => {
      const shapeFn = capturedShapeErrors['validateMagicLink'];
      const result = shapeFn({ err: {} }) as { code: string };

      expect(result.code).toBe('SERVER_ERROR');
    });

    it('should handle undefined error gracefully', () => {
      const shapeFn = capturedShapeErrors['validateMagicLink'];
      const result = shapeFn({ err: undefined });

      expect(result).toEqual({
        code: 'SERVER_ERROR',
        message: 'An error occurred',
      });
    });
  });
});
