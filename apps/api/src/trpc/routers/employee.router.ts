import { z } from '@pawly/zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeIdSchema,
  listEmployeesSchema,
  createUnavailabilitySchema,
  updateUnavailabilitySchema,
  unavailabilityIdSchema,
  listUnavailabilitiesSchema,
  hardRuleRangeSchema,
  declareSchoolDaysSchema,
  listSchoolDaysSchema,
} from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

export const employeeRouter = router({
  list: subscribedProcedure
    .input(listEmployeesSchema)
    .query(async ({ input, ctx }) => {
      return ctx.employeeService.findAll(ctx.user.clinicId, input ?? undefined);
    }),

  getById: subscribedProcedure
    .input(employeeIdSchema)
    .query(async ({ input, ctx }) => {
      return ctx.employeeService.findById(ctx.user.clinicId, input.id);
    }),

  create: subscribedProcedure
    .input(createEmployeeSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.employeeService.create(ctx.user.clinicId, input);
    }),

  update: subscribedProcedure
    .input(updateEmployeeSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.employeeService.update(ctx.user.clinicId, input);
    }),

  toggleActive: subscribedProcedure
    .input(employeeIdSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.employeeService.toggleActive(ctx.user.clinicId, input.id);
    }),

  resendInvitation: subscribedProcedure
    .input(employeeIdSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.employeeService.resendInvitation(ctx.user.clinicId, input.id);
    }),

  listConstraints: subscribedProcedure
    .input(listUnavailabilitiesSchema)
    .query(async ({ input, ctx }) => {
      return ctx.employeeService.listConstraints(ctx.user.clinicId, input);
    }),

  createConstraint: subscribedProcedure
    .input(createUnavailabilitySchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.employeeService.createConstraint(ctx.user.clinicId, input);
    }),

  updateConstraint: subscribedProcedure
    .input(updateUnavailabilitySchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.employeeService.updateConstraint(ctx.user.clinicId, input);
    }),

  deleteConstraint: subscribedProcedure
    .input(unavailabilityIdSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.employeeService.deleteConstraint(ctx.user.clinicId, input.id);
    }),

  listHardRules: subscribedProcedure
    .input(hardRuleRangeSchema)
    .query(async ({ input, ctx }) => {
      return ctx.employeeService.listHardRules(ctx.user.clinicId, input);
    }),

  declareSchoolDays: subscribedProcedure
    .input(declareSchoolDaysSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === 'EMPLOYEE') {
        try {
          await ctx.employeeService.validateEmployeeOwnership(ctx.user.sub, input.employeeId);
        } catch {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only manage your own employee record' });
        }
      }
      return ctx.employeeService.declareSchoolDays(
        ctx.user.clinicId,
        input.employeeId,
        input,
      );
    }),

  listSchoolDays: subscribedProcedure
    .input(listSchoolDaysSchema)
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === 'EMPLOYEE') {
        try {
          await ctx.employeeService.validateEmployeeOwnership(ctx.user.sub, input.employeeId);
        } catch {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only manage your own employee record' });
        }
      }
      return ctx.employeeService.listSchoolDays(ctx.user.clinicId, input);
    }),

  listUndeclaredApprentices: subscribedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }))
    .query(async ({ input, ctx }) => {
      return ctx.employeeService.listUndeclaredApprentices(
        ctx.user.clinicId,
        input.month,
      );
    }),
});

export type EmployeeRouter = typeof employeeRouter;
