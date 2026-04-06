import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';

const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

export const dashboardRouter = router({
  getStats: subscribedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'ADMIN') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
    }
    const cacheKey = `dashboard:stats:${ctx.user.clinicId}`;
    type Stats = Awaited<ReturnType<typeof ctx.dashboardService.getStats>>;
    const cached = await ctx.redis.get<Stats>(cacheKey);
    if (cached) return cached;
    const result = await ctx.dashboardService.getStats(ctx.user.clinicId);
    await ctx.redis.set(cacheKey, result, 120);
    return result;
  }),
});
