import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import { confirmShiftSchema } from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

export const presenceConfirmationRouter = router({
  confirmMyShift: subscribedProcedure
    .input(confirmShiftSchema)
    .mutation(async ({ input, ctx }) => {
      // Resolve employeeId from authenticated user (no employeeId in JWT)
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

      return ctx.presenceConfirmationService.confirmPresence(
        ctx.user.clinicId,
        user.employee.id,
        input.shiftId,
        input.actualStartTime,
      );
    }),
});
