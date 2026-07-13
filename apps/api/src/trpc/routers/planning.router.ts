import { Logger } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import type { EquityCounterType } from '@prisma/client';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import { TIER_HIERARCHY } from '@pawly/validators';
import {
  createPlanningRuleSchema,
  updatePlanningRuleSchema,
  togglePlanningRuleSchema,
  planningRuleIdSchema,
  listPlanningRulesSchema,
  validateShiftsSchema,
  getEquityCountersSchema,
  getQuarterlySummarySchema,
  recalculateCountersSchema,
  createTemplateSchema,
  updateTemplateSchema,
  duplicateTemplateSchema,
  templateIdSchema,
  listTemplatesSchema,
  generatePlanSchema,
  listShiftsForMonthSchema,
  deleteGeneratedShiftsSchema,
  scheduleViewInputSchema,
  moveShiftInputSchema,
  createManualShiftInputSchema,
  deleteShiftInputSchema,
  preValidateMoveInputSchema,
  listApprenticeDeclarationsSchema,
  upsertNoSchoolSchema,
  deleteDeclarationSchema,
  getDeclarationStatusSchema,
  publishPlanInputSchema,
} from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

const adminOnly = (role: string) => {
  if (role !== 'ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only admins can manage planning rules',
    });
  }
};

const requireProfessional = (tier: string) => {
  const currentIndex = TIER_HIERARCHY.indexOf(
    tier as (typeof TIER_HIERARCHY)[number],
  );
  const requiredIndex = TIER_HIERARCHY.indexOf('professional');
  if (currentIndex === -1 || currentIndex < requiredIndex) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: "Subscription tier 'professional' required",
    });
  }
};

// Story 11-6 — best-effort schedule cache invalidation. Runs in a `finally` on
// every shift-mutation procedure so a stale `schedule:*` / `planning:pub:*` /
// `dashboard:stats` entry is never left behind when the handler throws
// mid-way. Swallows its own Redis errors: a failed invalidation self-heals
// within the 30s getScheduleView TTL and must never mask the handler result.
const planningRouterLogger = new Logger('PlanningRouter');

const invalidateScheduleCaches = async (
  redis: {
    invalidatePattern: (pattern: string) => Promise<unknown>;
    del: (key: string) => Promise<unknown>;
  },
  clinicId: string,
): Promise<void> => {
  try {
    await redis.invalidatePattern(`schedule:${clinicId}:*`);
    await redis.invalidatePattern(`planning:pub:${clinicId}:*`);
    await redis.del(`dashboard:stats:${clinicId}`);
  } catch (err) {
    planningRouterLogger.error(
      `schedule cache invalidation failed for clinic ${clinicId}: ${
        (err as Error).message
      }`,
    );
  }
};

export const planningRouter = router({
  listRules: subscribedProcedure
    .input(listPlanningRulesSchema)
    .query(async ({ input, ctx }) => {
      return ctx.planningService.listRules(ctx.user.clinicId, input);
    }),

  getRuleById: subscribedProcedure
    .input(planningRuleIdSchema)
    .query(async ({ input, ctx }) => {
      return ctx.planningService.getRuleById(ctx.user.clinicId, input.id);
    }),

  createRule: subscribedProcedure
    .input(createPlanningRuleSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      requireProfessional(ctx.subscription.entitlementTier);
      return ctx.planningService.createRule(ctx.user.clinicId, input);
    }),

  updateRule: subscribedProcedure
    .input(updatePlanningRuleSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      requireProfessional(ctx.subscription.entitlementTier);
      return ctx.planningService.updateRule(ctx.user.clinicId, input);
    }),

  deleteRule: subscribedProcedure
    .input(planningRuleIdSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      requireProfessional(ctx.subscription.entitlementTier);
      return ctx.planningService.deleteRule(ctx.user.clinicId, input.id);
    }),

  toggleRule: subscribedProcedure
    .input(togglePlanningRuleSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      requireProfessional(ctx.subscription.entitlementTier);
      return ctx.planningService.toggleRule(ctx.user.clinicId, input);
    }),

  validateShifts: subscribedProcedure
    .input(validateShiftsSchema)
    .query(async ({ input, ctx }) => {
      return ctx.planningService.validateShiftsAgainstRules(
        ctx.user.clinicId,
        input,
      );
    }),

  // Equity counter procedures (Professional tier only)
  getEquityCounters: subscribedProcedure
    .input(getEquityCountersSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      requireProfessional(ctx.subscription.entitlementTier);
      return ctx.equityCounterService.getCountersForPeriod(
        ctx.user.clinicId,
        input.year,
        input.months,
        input.counterTypes as EquityCounterType[] | undefined,
      );
    }),

  getQuarterlySummary: subscribedProcedure
    .input(getQuarterlySummarySchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      requireProfessional(ctx.subscription.entitlementTier);
      return ctx.equityCounterService.getQuarterlySummary(
        ctx.user.clinicId,
        input.year,
        input.quarter,
      );
    }),

  recalculateCounters: subscribedProcedure
    .input(recalculateCountersSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      requireProfessional(ctx.subscription.entitlementTier);
      return ctx.equityCounterService.recalculateForPeriod(
        ctx.user.clinicId,
        input.year,
        input.month,
      );
    }),

  // Template procedures
  listTemplates: subscribedProcedure
    .input(listTemplatesSchema)
    .query(async ({ ctx }) => {
      adminOnly(ctx.user.role);
      type Templates = Awaited<
        ReturnType<typeof ctx.planningTemplateService.listTemplates>
      >;
      const cacheKey = `planning:templates:${ctx.user.clinicId}`;
      const cached = await ctx.redis.get<Templates>(cacheKey);
      if (cached) return cached;
      const result = await ctx.planningTemplateService.listTemplates(
        ctx.user.clinicId,
      );
      await ctx.redis.set(cacheKey, result, 300);
      return result;
    }),

  getTemplateById: subscribedProcedure
    .input(templateIdSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningTemplateService.getTemplateById(
        ctx.user.clinicId,
        input.id,
      );
    }),

  createTemplate: subscribedProcedure
    .input(createTemplateSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.planningTemplateService.createTemplate(
        ctx.user.clinicId,
        input,
      );
      await ctx.redis.del(`planning:templates:${ctx.user.clinicId}`);
      return result;
    }),

  updateTemplate: subscribedProcedure
    .input(updateTemplateSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.planningTemplateService.updateTemplate(
        ctx.user.clinicId,
        input,
      );
      await ctx.redis.del(`planning:templates:${ctx.user.clinicId}`);
      return result;
    }),

  deleteTemplate: subscribedProcedure
    .input(templateIdSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.planningTemplateService.deleteTemplate(
        ctx.user.clinicId,
        input.id,
      );
      await ctx.redis.del(`planning:templates:${ctx.user.clinicId}`);
      return result;
    }),

  duplicateTemplate: subscribedProcedure
    .input(duplicateTemplateSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.planningTemplateService.duplicateTemplate(
        ctx.user.clinicId,
        input.id,
      );
      await ctx.redis.del(`planning:templates:${ctx.user.clinicId}`);
      return result;
    }),

  // Generation procedures
  generatePlan: subscribedProcedure
    .input(generatePlanSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      try {
        return await ctx.planningGenerationService.generateMonthlyPlan(
          ctx.user.clinicId,
          input.month,
          input.templateId,
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
      } finally {
        await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
      }
    }),

  listShiftsForMonth: subscribedProcedure
    .input(listShiftsForMonthSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningGenerationService.listShiftsForMonth(
        ctx.user.clinicId,
        input.month,
      );
    }),

  deleteGeneratedShifts: subscribedProcedure
    .input(deleteGeneratedShiftsSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      try {
        return await ctx.planningGenerationService.deleteGeneratedShifts(
          ctx.user.clinicId,
          input.month,
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
      } finally {
        await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
      }
    }),

  // Schedule view procedure (cached 30s, invalidated on shift mutations)
  getScheduleView: subscribedProcedure
    .input(scheduleViewInputSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      type ScheduleView = Awaited<
        ReturnType<typeof ctx.planningGenerationService.getScheduleViewForMonth>
      >;
      const cacheKey = `schedule:${ctx.user.clinicId}:${input.month}`;
      const cached = await ctx.redis.get<ScheduleView>(cacheKey);
      if (cached) return cached;
      const result =
        await ctx.planningGenerationService.getScheduleViewForMonth(
          ctx.user.clinicId,
          input.month,
        );
      await ctx.redis.set(cacheKey, result, 30);
      return result;
    }),

  // Shift mutation procedures (Story 7.1: Manual Schedule Adjustment)
  moveShift: subscribedProcedure
    .input(moveShiftInputSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      try {
        return await ctx.planningGenerationService.moveShift(
          ctx.user.clinicId,
          input.shiftId,
          {
            targetEmployeeId: input.targetEmployeeId,
            targetDate: input.targetDate,
          },
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
      } finally {
        await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
      }
    }),

  createManualShift: subscribedProcedure
    .input(createManualShiftInputSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      try {
        return await ctx.planningGenerationService.createManualShift(
          ctx.user.clinicId,
          input,
        );
      } finally {
        await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
      }
    }),

  deleteShift: subscribedProcedure
    .input(deleteShiftInputSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      try {
        return await ctx.planningGenerationService.deleteShift(
          ctx.user.clinicId,
          input.shiftId,
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
      } finally {
        await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
      }
    }),

  preValidateMove: subscribedProcedure
    .input(preValidateMoveInputSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningGenerationService.preValidateMove(
        ctx.user.clinicId,
        input,
      );
    }),

  // Publication procedures (Story 7.2)
  publishPlan: subscribedProcedure
    .input(publishPlanInputSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.planningGenerationService.publishPlan(
        ctx.user.clinicId,
        input.month,
        ctx.user.sub,
      );
      await ctx.redis.del(`planning:pub:${ctx.user.clinicId}:${input.month}`);
      return result;
    }),

  getPublicationStatus: subscribedProcedure
    .input(publishPlanInputSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      type PubStatus = Awaited<
        ReturnType<typeof ctx.planningGenerationService.getPublicationStatus>
      >;
      const cacheKey = `planning:pub:${ctx.user.clinicId}:${input.month}`;
      const cached = await ctx.redis.get<PubStatus>(cacheKey);
      if (cached) return cached;
      const result = await ctx.planningGenerationService.getPublicationStatus(
        ctx.user.clinicId,
        input.month,
      );
      await ctx.redis.set(cacheKey, result, 300);
      return result;
    }),

  getPublishPreview: subscribedProcedure
    .input(publishPlanInputSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningGenerationService.getPublishPreview(
        ctx.user.clinicId,
        input.month,
      );
    }),

  // Apprentice declaration procedures
  listApprenticeDeclarations: subscribedProcedure
    .input(listApprenticeDeclarationsSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.apprenticeDeclarationService.listForMonth(
        ctx.user.clinicId,
        input.month,
      );
    }),

  upsertNoSchool: subscribedProcedure
    .input(upsertNoSchoolSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.apprenticeDeclarationService.upsertNoSchool(
        ctx.user.clinicId,
        input.employeeId,
        input.month,
      );
    }),

  deleteApprenticeDeclaration: subscribedProcedure
    .input(deleteDeclarationSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.apprenticeDeclarationService.deleteDeclaration(
        ctx.user.clinicId,
        input.employeeId,
        input.month,
      );
    }),

  getDeclarationStatus: subscribedProcedure
    .input(getDeclarationStatusSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const undeclared =
        await ctx.apprenticeDeclarationService.getUndeclaredApprentices(
          ctx.user.clinicId,
          input.month,
        );
      return {
        allDeclared: undeclared.length === 0,
        undeclaredCount: undeclared.length,
      };
    }),
});

export type PlanningRouter = typeof planningRouter;
