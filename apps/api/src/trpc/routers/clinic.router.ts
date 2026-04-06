import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from '@pawly/zod';
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
    type Profile = Awaited<ReturnType<typeof ctx.clinicService.getProfile>>;
    const cacheKey = `clinic:profile:${ctx.user.clinicId}`;
    const cached = await ctx.redis.get<Profile>(cacheKey);
    if (cached) return cached;
    const result = await ctx.clinicService.getProfile(ctx.user.clinicId);
    await ctx.redis.set(cacheKey, result, 300);
    return result;
  }),

  // getOnboardingStatus stays as protectedProcedure — must work before subscription exists
  getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    return ctx.clinicService.getOnboardingStatus(ctx.user.clinicId);
  }),

  saveOnboardingDraft: protectedProcedure
    .input(z.object({ step: z.number(), values: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.clinicService.saveOnboardingDraft(ctx.user.clinicId, {
        step: input.step,
        values: input.values,
      });
    }),

  getOperationalConfig: subscribedProcedure.query(async ({ ctx }) => {
    type Config = Awaited<ReturnType<typeof ctx.clinicService.getOperationalConfig>>;
    const cacheKey = `clinic:ops:${ctx.user.clinicId}`;
    const cached = await ctx.redis.get<Config>(cacheKey);
    if (cached) return cached;
    const result = await ctx.clinicService.getOperationalConfig(ctx.user.clinicId);
    await ctx.redis.set(cacheKey, result, 300);
    return result;
  }),

  updateClinicName: subscribedProcedure
    .input(updateClinicNameSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.clinicService.updateClinicName(ctx.user.clinicId, input);
      await ctx.redis.del(`clinic:profile:${ctx.user.clinicId}`);
      return result;
    }),

  updateClinicConfig: subscribedProcedure
    .input(updateClinicConfigSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.clinicService.upsertClinicConfig(ctx.user.clinicId, input);
    }),

  createShiftTypes: subscribedProcedure
    .input(createShiftTypesSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.clinicService.createShiftTypes(ctx.user.clinicId, input);
    }),

  updateOperationalConfig: subscribedProcedure
    .input(updateClinicOperationalConfigSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.clinicService.updateOperationalConfig(ctx.user.clinicId, input);
      await ctx.redis.del(`clinic:ops:${ctx.user.clinicId}`);
      return result;
    }),

  // ─── Shift Type CRUD ──────────────────────────────────────────────
  listShiftTypes: subscribedProcedure
    .input(listShiftTypesSchema)
    .query(async ({ ctx }) => {
      type ShiftTypes = Awaited<ReturnType<typeof ctx.clinicService.listShiftTypes>>;
      const cacheKey = `clinic:st:${ctx.user.clinicId}`;
      const cached = await ctx.redis.get<ShiftTypes>(cacheKey);
      if (cached) return cached;
      const result = await ctx.clinicService.listShiftTypes(ctx.user.clinicId);
      await ctx.redis.set(cacheKey, result, 300);
      return result;
    }),

  createShiftType: subscribedProcedure
    .input(createShiftTypeSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.clinicService.createSingleShiftType(ctx.user.clinicId, input);
      await ctx.redis.del(`clinic:st:${ctx.user.clinicId}`);
      return result;
    }),

  updateShiftType: subscribedProcedure
    .input(updateShiftTypeSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const { id, ...data } = input;
      const result = await ctx.clinicService.updateSingleShiftType(ctx.user.clinicId, id, data);
      await ctx.redis.del(`clinic:st:${ctx.user.clinicId}`);
      return result;
    }),

  deleteShiftType: subscribedProcedure
    .input(deleteShiftTypeSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.clinicService.deleteSingleShiftType(ctx.user.clinicId, input.id);
      await ctx.redis.del(`clinic:st:${ctx.user.clinicId}`);
      return result;
    }),

  // completeOnboarding uses protectedProcedure — must work before subscription is active (onboarding deadlock fix)
  completeOnboarding: protectedProcedure
    .input(completeOnboardingSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.clinicService.completeOnboarding(ctx.user.clinicId, input);
    }),
});

export type ClinicRouter = typeof clinicRouter;
