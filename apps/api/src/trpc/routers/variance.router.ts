import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import {
  listVarianceEventsSchema,
  reviewVarianceSchema,
  getVarianceStatsSchema,
  exportVarianceSchema,
} from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

export const varianceRouter = router({
  list: subscribedProcedure
    .input(listVarianceEventsSchema)
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can view variance events' });
      }
      return ctx.varianceService.listVarianceEvents(ctx.user.clinicId, input);
    }),

  review: subscribedProcedure
    .input(reviewVarianceSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can review variance events' });
      }
      return ctx.varianceService.reviewVariance(
        ctx.user.clinicId,
        ctx.user.sub,
        input.varianceId,
        input.action,
        input.exceptionNote,
      );
    }),

  getStats: subscribedProcedure
    .input(getVarianceStatsSchema)
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can view variance statistics' });
      }
      return ctx.varianceService.getVarianceStats(ctx.user.clinicId, input);
    }),

  countPending: subscribedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can view pending variance count' });
      }
      return ctx.varianceService.countPendingVarianceEvents(ctx.user.clinicId);
    }),

  exportCsv: subscribedProcedure
    .input(exportVarianceSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can export variance data' });
      }
      return ctx.varianceService.exportVarianceCsv(ctx.user.clinicId, input);
    }),
});
