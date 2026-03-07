import { TRPCError } from '@trpc/server';
import type { EquityCounterType } from '@prisma/client';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
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
      return ctx.planningService.createRule(ctx.user.clinicId, input);
    }),

  updateRule: subscribedProcedure
    .input(updatePlanningRuleSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningService.updateRule(ctx.user.clinicId, input);
    }),

  deleteRule: subscribedProcedure
    .input(planningRuleIdSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningService.deleteRule(ctx.user.clinicId, input.id);
    }),

  toggleRule: subscribedProcedure
    .input(togglePlanningRuleSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
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

  // Equity counter procedures
  getEquityCounters: subscribedProcedure
    .input(getEquityCountersSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
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
      return ctx.planningTemplateService.listTemplates(ctx.user.clinicId);
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
      return ctx.planningTemplateService.createTemplate(
        ctx.user.clinicId,
        input,
      );
    }),

  updateTemplate: subscribedProcedure
    .input(updateTemplateSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningTemplateService.updateTemplate(
        ctx.user.clinicId,
        input,
      );
    }),

  deleteTemplate: subscribedProcedure
    .input(templateIdSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningTemplateService.deleteTemplate(
        ctx.user.clinicId,
        input.id,
      );
    }),

  duplicateTemplate: subscribedProcedure
    .input(duplicateTemplateSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningTemplateService.duplicateTemplate(
        ctx.user.clinicId,
        input.id,
      );
    }),

  // Generation procedures
  generatePlan: subscribedProcedure
    .input(generatePlanSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningGenerationService.generateMonthlyPlan(
        ctx.user.clinicId,
        input.month,
        input.templateId,
      );
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
      return ctx.planningGenerationService.deleteGeneratedShifts(
        ctx.user.clinicId,
        input.month,
      );
    }),

  // Schedule view procedure
  getScheduleView: subscribedProcedure
    .input(scheduleViewInputSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningGenerationService.getScheduleViewForMonth(
        ctx.user.clinicId,
        input.month,
      );
    }),

  // Shift mutation procedures (Story 7.1: Manual Schedule Adjustment)
  moveShift: subscribedProcedure
    .input(moveShiftInputSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningGenerationService.moveShift(
        ctx.user.clinicId,
        input.shiftId,
        { targetEmployeeId: input.targetEmployeeId, targetDate: input.targetDate },
      );
    }),

  createManualShift: subscribedProcedure
    .input(createManualShiftInputSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningGenerationService.createManualShift(
        ctx.user.clinicId,
        input,
      );
    }),

  deleteShift: subscribedProcedure
    .input(deleteShiftInputSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningGenerationService.deleteShift(
        ctx.user.clinicId,
        input.shiftId,
      );
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
      return ctx.planningGenerationService.publishPlan(
        ctx.user.clinicId,
        input.month,
        ctx.user.sub,
      );
    }),

  getPublicationStatus: subscribedProcedure
    .input(publishPlanInputSchema)
    .query(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      return ctx.planningGenerationService.getPublicationStatus(
        ctx.user.clinicId,
        input.month,
      );
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
      const undeclared = await ctx.apprenticeDeclarationService.getUndeclaredApprentices(
        ctx.user.clinicId,
        input.month,
      );
      return { allDeclared: undeclared.length === 0, undeclaredCount: undeclared.length };
    }),
});

export type PlanningRouter = typeof planningRouter;
