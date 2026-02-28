import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import { getEmployeeScheduleSchema } from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

export const employeeScheduleRouter = router({
  getMySchedule: subscribedProcedure
    .input(getEmployeeScheduleSchema)
    .query(async ({ input, ctx }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.sub },
        select: { employee: { select: { id: true } } },
      });

      if (!user?.employee?.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'No linked employee account',
        });
      }

      return ctx.employeeScheduleService.getEmployeeSchedule(
        ctx.user.clinicId,
        user.employee.id,
        input.month,
      );
    }),

  getMyShiftTypes: subscribedProcedure.query(async ({ ctx }) => {
    return ctx.employeeScheduleService.getEmployeeShiftTypes(
      ctx.user.clinicId,
    );
  }),
});
