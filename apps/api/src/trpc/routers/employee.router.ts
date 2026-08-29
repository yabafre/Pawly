import { z } from '@pawly/zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import { TIER_LIMITS, type EntitlementTier } from '@pawly/validators';
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
  createAbsenceRequestSchema,
  reviewAbsenceSchema,
  listAbsencesSchema,
  absenceIdSchema,
  adminCreateAbsenceSchema,
  checkAbsenceOverlapSchema,
} from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

export const employeeRouter = router({
  // Admin-only: the roster carries colleagues' emails, phone numbers and
  // contract hours. Nothing under /dashboard reads it — the employee screens
  // work from the caller's own record.
  list: subscribedProcedure
    .input(listEmployeesSchema)
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins can list the clinic roster',
        });
      }
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
      const tier = (ctx.subscription.entitlementTier || 'starter') as EntitlementTier;
      const limit = TIER_LIMITS[tier]?.maxEmployees ?? TIER_LIMITS.starter.maxEmployees;
      const currentCount = await ctx.prisma.employee.count({
        where: { clinicId: ctx.user.clinicId, isActive: true },
      });
      if (currentCount >= limit) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Employee limit reached (${limit}). Upgrade your plan to add more.`,
        });
      }
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

  // ==================== Absence Request Procedures ====================

  createAbsenceRequest: subscribedProcedure
    .input(createAbsenceRequestSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === 'EMPLOYEE') {
        try {
          await ctx.employeeService.validateEmployeeOwnership(ctx.user.sub, input.employeeId);
        } catch {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only manage your own absence requests' });
        }
      }
      return ctx.employeeService.createAbsenceRequest(ctx.user.clinicId, input.employeeId, input);
    }),

  reviewAbsence: subscribedProcedure
    .input(reviewAbsenceSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can review absence requests' });
      }
      const result = await ctx.employeeService.reviewAbsence(
        ctx.user.clinicId,
        ctx.user.sub,
        input.absenceId,
        input.action,
        input.rejectionReason,
      );
      await ctx.redis.del(`absences:pending:${ctx.user.clinicId}`);
      await ctx.redis.del(`dashboard:stats:${ctx.user.clinicId}`);
      return result;
    }),

  listAbsences: subscribedProcedure
    .input(listAbsencesSchema)
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === 'EMPLOYEE') {
        let employeeId: string;
        try {
          employeeId = await ctx.employeeService.resolveEmployeeId(ctx.user.sub);
        } catch {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No employee record found' });
        }
        return ctx.employeeService.listAbsences(ctx.user.clinicId, {
          ...input,
          employeeId,
        });
      }
      return ctx.employeeService.listAbsences(ctx.user.clinicId, input);
    }),

  getAbsence: subscribedProcedure
    .input(absenceIdSchema)
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === 'EMPLOYEE') {
        let employeeId: string;
        try {
          employeeId = await ctx.employeeService.resolveEmployeeId(ctx.user.sub);
        } catch {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No employee record found' });
        }
        const absence = await ctx.employeeService.getAbsenceById(ctx.user.clinicId, input.id);
        if (absence.employeeId !== employeeId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only view your own absence requests' });
        }
        return absence;
      }
      return ctx.employeeService.getAbsenceById(ctx.user.clinicId, input.id);
    }),

  adminCreateAbsence: subscribedProcedure
    .input(adminCreateAbsenceSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can create absences directly' });
      }
      const result = await ctx.employeeService.adminCreateAbsence(ctx.user.clinicId, ctx.user.sub, input);
      await ctx.redis.del(`absences:pending:${ctx.user.clinicId}`);
      await ctx.redis.del(`dashboard:stats:${ctx.user.clinicId}`);
      return result;
    }),

  countPendingAbsences: subscribedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can view pending absence count' });
      }
      const cacheKey = `absences:pending:${ctx.user.clinicId}`;
      const cached = await ctx.redis.get<number>(cacheKey);
      if (cached !== null) return cached;
      const result = await ctx.employeeService.countPendingAbsences(ctx.user.clinicId);
      await ctx.redis.set(cacheKey, result, 60);
      return result;
    }),

  checkAbsenceOverlap: subscribedProcedure
    .input(checkAbsenceOverlapSchema)
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === 'EMPLOYEE') {
        try {
          await ctx.employeeService.validateEmployeeOwnership(ctx.user.sub, input.employeeId);
        } catch {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only check your own absence overlaps' });
        }
      }
      return ctx.employeeService.checkOverlap(
        ctx.user.clinicId,
        input.employeeId,
        input.startDate,
        input.endDate,
      );
    }),
});

export type EmployeeRouter = typeof employeeRouter;
