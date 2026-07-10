import { publicProcedure, router, isAuthed } from '../trpc';
import { saveTourProgressSchema, completeTourSchema } from '@pawly/validators';

// protectedProcedure (NOT subscribedProcedure) — tour must work before/without
// an active subscription, avoiding the onboarding-deadlock (Lesson L2).
const protectedProcedure = publicProcedure.use(isAuthed);

export const tourRouter = router({
  getState: protectedProcedure.query(async ({ ctx }) => {
    return ctx.tourService.getState(ctx.user.sub);
  }),

  saveProgress: protectedProcedure
    .input(saveTourProgressSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.tourService.saveProgress(
        ctx.user.sub,
        input.tourKey,
        input.step,
      );
    }),

  complete: protectedProcedure
    .input(completeTourSchema)
    .mutation(async ({ ctx }) => {
      return ctx.tourService.complete(ctx.user.sub);
    }),
});

export type TourRouter = typeof tourRouter;
