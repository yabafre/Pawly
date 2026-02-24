import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';

const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

export const dashboardRouter = router({
  getStats: subscribedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'ADMIN') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
    }
    return ctx.dashboardService.getStats(ctx.user.clinicId);
  }),
});
