/**
 * tRPC initialization and base configuration
 *
 * This is the main entry point for tRPC server setup.
 * All routers should import from this file.
 *
 * @see https://trpc.io/docs/server/routers
 */
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context';
import type { AuthenticatedUser } from '@pawly/types';

/**
 * Initialize tRPC with context and superjson transformer
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof Error ? error.cause.message : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/**
 * Auth middleware - checks for authenticated user
 */
export const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user as AuthenticatedUser,
    },
  });
});

/**
 * Protected procedure - requires valid JWT session
 * Use publicProcedure.use(isAuthed) in routers to avoid type portability issues
 */
export const createProtectedProcedure = () => t.procedure.use(isAuthed);
