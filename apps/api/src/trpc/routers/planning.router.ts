import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import {
  createPlanningRuleSchema,
  updatePlanningRuleSchema,
  togglePlanningRuleSchema,
  planningRuleIdSchema,
  listPlanningRulesSchema,
  validateShiftsSchema,
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
});

export type PlanningRouter = typeof planningRouter;
