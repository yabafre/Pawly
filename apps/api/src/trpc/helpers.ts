/**
 * Pawly tRPC Router Helpers
 *
 * Tenant-scoped and role-based authorization utilities for tRPC routers.
 * Provides consistent error handling, role checks, and clinic context validation
 * across all Pawly tRPC procedures.
 *
 * @module trpc/helpers
 */
import { TRPCError } from '@trpc/server';
import type { Context } from './context';
import type { Role } from '@pawly/types';

/**
 * Options for the withClinicContext helper
 */
interface ClinicContextOptions {
  /** Required role to execute this operation */
  role: Role;
  /** Custom error message for failures (optional) */
  errorMessage?: string;
}

/**
 * Context with guaranteed clinicId (after validation)
 */
interface ClinicContext extends Context {
  clinicId: string;
}

/**
 * Checks if the authenticated user has the required role.
 */
function hasRequiredRole(ctx: Context, role: Role): boolean {
  return ctx.user?.role === role;
}

/**
 * Wraps a router handler with clinic context validation and error handling.
 *
 * This helper eliminates the repetitive pattern of:
 * 1. Checking roles
 * 2. Validating clinicId exists
 * 3. Wrapping in try/catch with TRPCError mapping
 *
 * @example
 * ```typescript
 * // Before (repeated across routers):
 * async ({ input, ctx }) => {
 *   try {
 *     if (ctx.user?.role !== 'ADMIN') {
 *       throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
 *     }
 *     if (!ctx.user?.clinicId) {
 *       throw new TRPCError({ code: 'BAD_REQUEST', message: 'Clinic context required' });
 *     }
 *     return await someService.method(ctx.user.clinicId, input);
 *   } catch (error) {
 *     if (error instanceof TRPCError) throw error;
 *     throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '...' });
 *   }
 * }
 *
 * // After:
 * withClinicContext(
 *   { role: 'ADMIN', errorMessage: 'Failed to do something' },
 *   async (ctx, input) => someService.method(ctx.clinicId, input)
 * )
 * ```
 */
export function withClinicContext<TInput, TOutput>(
  options: ClinicContextOptions,
  handler: (ctx: ClinicContext, input: TInput) => Promise<TOutput>
): (params: { input: TInput; ctx: Context }) => Promise<TOutput> {
  return async ({ input, ctx }) => {
    try {
      // Check role
      if (!hasRequiredRole(ctx, options.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        });
      }

      // Validate clinic context
      if (!ctx.user?.clinicId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Clinic context required',
        });
      }

      const clinicCtx: ClinicContext = {
        ...ctx,
        clinicId: ctx.user.clinicId,
      };

      // Execute handler with validated context
      return await handler(clinicCtx, input);
    } catch (error) {
      // Re-throw TRPCErrors as-is
      if (error instanceof TRPCError) throw error;

      // Map NotFoundException to NOT_FOUND
      if (error instanceof Error && error.name === 'NotFoundException') {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: error.message,
        });
      }

      // Map ConflictException to CONFLICT
      if (error instanceof Error && error.name === 'ConflictException') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: error.message,
        });
      }

      // Map BadRequestException to BAD_REQUEST
      if (error instanceof Error && error.name === 'BadRequestException') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error.message,
        });
      }

      // Default to INTERNAL_SERVER_ERROR
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          error instanceof Error
            ? error.message
            : (options.errorMessage ?? 'An unexpected error occurred'),
      });
    }
  };
}

/**
 * Wraps a query handler (syntactic sugar for withClinicContext with read role pattern)
 */
export function clinicQuery<TInput, TOutput>(
  role: Role,
  handler: (ctx: ClinicContext, input: TInput) => Promise<TOutput>
): (params: { input: TInput; ctx: Context }) => Promise<TOutput> {
  return withClinicContext({ role }, handler);
}

/**
 * Wraps a mutation handler (syntactic sugar for withClinicContext with update role pattern)
 */
export function clinicMutation<TInput, TOutput>(
  role: Role,
  handler: (ctx: ClinicContext, input: TInput) => Promise<TOutput>
): (params: { input: TInput; ctx: Context }) => Promise<TOutput> {
  return withClinicContext({ role }, handler);
}

/**
 * Maps common service errors to appropriate TRPCError codes.
 * Use this for custom error handling when withClinicContext doesn't fit.
 */
export function mapServiceError(error: unknown, fallbackMessage: string): never {
  if (error instanceof TRPCError) throw error;

  const errorMessage = error instanceof Error ? error.message : fallbackMessage;

  // Check for specific error patterns
  if (errorMessage.includes('not found') || errorMessage.includes('Not found')) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: errorMessage,
    });
  }

  if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: errorMessage,
    });
  }

  if (errorMessage.includes('Invalid') || errorMessage.includes('invalid')) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: errorMessage,
    });
  }

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: errorMessage,
  });
}
