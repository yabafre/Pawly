import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeIdSchema,
  listEmployeesSchema,
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
});

export type EmployeeRouter = typeof employeeRouter;
