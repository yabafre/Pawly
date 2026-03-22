import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  updateClinicNameSchema,
  updateClinicConfigSchema,
  createShiftTypesSchema,
  completeOnboardingSchema,
  updateClinicOperationalConfigSchema,
  createShiftTypeSchema,
  updateShiftTypeSchema,
  deleteShiftTypeSchema,
  listShiftTypesSchema,
} from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

const adminOnly = (role: string) => {
  if (role !== 'ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only admins can manage shift types',
    });
  }
};

export const clinicRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.clinicService.getProfile(ctx.user.clinicId);
  }),

  // getOnboardingStatus stays as protectedProcedure — must work before subscription exists
  getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    return ctx.clinicService.getOnboardingStatus(ctx.user.clinicId);
  }),

  getOperationalConfig: subscribedProcedure.query(async ({ ctx }) => {
    return ctx.clinicService.getOperationalConfig(ctx.user.clinicId);
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

  updateOperationalConfig: subscribedProcedure
    .input(updateClinicOperationalConfigSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.clinicService.updateOperationalConfig(ctx.user.clinicId, input);
    }),

  // ─── Shift Type CRUD ──────────────────────────────────────────────
  listShiftTypes: subscribedProcedure
    .input(listShiftTypesSchema)
    .query(async ({ ctx }) => {
      return ctx.clinicService.listShiftTypes(ctx.user.clinicId);
    }),

  createShiftType: subscribedProcedure
    .input(createShiftTypeSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.clinicService.createSingleShiftType(ctx.user.clinicId, input);
    }),

  updateShiftType: subscribedProcedure
    .input(updateShiftTypeSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const { id, ...data } = input;
      return ctx.clinicService.updateSingleShiftType(ctx.user.clinicId, id, data);
    }),

  deleteShiftType: subscribedProcedure
    .input(deleteShiftTypeSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.clinicService.deleteSingleShiftType(ctx.user.clinicId, input.id);
    }),

  // completeOnboarding uses protectedProcedure — must work before subscription is active (onboarding deadlock fix)
  completeOnboarding: protectedProcedure
    .input(completeOnboardingSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.clinicService.completeOnboarding(ctx.user.clinicId, input);
    }),
});

export type ClinicRouter = typeof clinicRouter;
