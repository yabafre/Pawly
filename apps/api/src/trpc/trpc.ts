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
import { ACTIVE_SUBSCRIPTION_STATUSES, TIER_HIERARCHY } from '@pawly/validators';

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

/**
 * Subscription guard middleware - checks for active subscription
 * Routers compose locally: const subscribedProcedure = protectedProcedure.use(isSubscribed);
 */
export const isSubscribed = t.middleware(async ({ ctx, next }) => {
  const user = ctx.user as AuthenticatedUser;
  if (!user?.clinicId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const cacheKey = `sub:${user.clinicId}`;
  let subscription = await ctx.redis.get<{
    status: string;
    entitlementTier: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  }>(cacheKey);

  if (!subscription) {
    subscription = await ctx.prisma.subscription.findUnique({
      where: { clinicId: user.clinicId },
      select: {
        status: true,
        entitlementTier: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    });
    if (subscription) {
      await ctx.redis.set(cacheKey, subscription, 120); // 2 min
    }
  }

  if (!subscription || !(ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(subscription.status)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Active subscription required',
    });
  }

  return next({
    ctx: { ...ctx, user, subscription },
  });
});

/**
 * Entitlement tier guard middleware factory - checks subscription tier level
 * Must be chained after isSubscribed: protectedProcedure.use(isSubscribed).use(isEntitled('professional'))
 */
interface SubscriptionCtx {
  subscription?: { entitlementTier: string };
}

export const isEntitled = (requiredTier: string) =>
  t.middleware(async ({ ctx, next }) => {
    const subscription = (ctx as typeof ctx & SubscriptionCtx).subscription;

    if (!subscription) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Active subscription required (isEntitled must be chained after isSubscribed)',
      });
    }

    const currentIndex = TIER_HIERARCHY.indexOf(
      subscription.entitlementTier as (typeof TIER_HIERARCHY)[number],
    );
    const requiredIndex = TIER_HIERARCHY.indexOf(
      requiredTier as (typeof TIER_HIERARCHY)[number],
    );

    if (currentIndex === -1 || requiredIndex === -1 || currentIndex < requiredIndex) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Subscription tier '${requiredTier}' required`,
      });
    }

    return next({ ctx });
  });
