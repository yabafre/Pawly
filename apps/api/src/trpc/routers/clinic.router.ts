import { publicProcedure, router, isAuthed } from '../trpc';
import {
  updateClinicNameSchema,
  updateClinicConfigSchema,
  createShiftTypesSchema,
  completeOnboardingSchema,
} from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);

export const clinicRouter = router({
  getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    return ctx.clinicService.getOnboardingStatus(ctx.user.clinicId);
  }),

  updateClinicName: protectedProcedure
    .input(updateClinicNameSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.clinicService.updateClinicName(ctx.user.clinicId, input);
    }),

  updateClinicConfig: protectedProcedure
    .input(updateClinicConfigSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.clinicService.upsertClinicConfig(ctx.user.clinicId, input);
    }),

  createShiftTypes: protectedProcedure
    .input(createShiftTypesSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.clinicService.createShiftTypes(ctx.user.clinicId, input);
    }),

  completeOnboarding: protectedProcedure
    .input(completeOnboardingSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.clinicService.completeOnboarding(ctx.user.clinicId, input);
    }),
});

export type ClinicRouter = typeof clinicRouter;
