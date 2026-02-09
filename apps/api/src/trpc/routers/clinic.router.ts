import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import {
  updateClinicNameSchema,
  updateClinicConfigSchema,
  createShiftTypesSchema,
  completeOnboardingSchema,
} from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

export const clinicRouter = router({
  // getOnboardingStatus stays as protectedProcedure — must work before subscription exists
  getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    return ctx.clinicService.getOnboardingStatus(ctx.user.clinicId);
  }),

  updateClinicName: subscribedProcedure
    .input(updateClinicNameSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.clinicService.updateClinicName(ctx.user.clinicId, input);
    }),

  updateClinicConfig: subscribedProcedure
    .input(updateClinicConfigSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.clinicService.upsertClinicConfig(ctx.user.clinicId, input);
    }),

  createShiftTypes: subscribedProcedure
    .input(createShiftTypesSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.clinicService.createShiftTypes(ctx.user.clinicId, input);
    }),

  // completeOnboarding uses protectedProcedure — must work before subscription is active (onboarding deadlock fix)
  completeOnboarding: protectedProcedure
    .input(completeOnboardingSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.clinicService.completeOnboarding(ctx.user.clinicId, input);
    }),
});

export type ClinicRouter = typeof clinicRouter;
