import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import { z } from '@pawly/zod';
import {
  getEmployeeScheduleSchema,
  updateNotificationPreferencesSchema,
} from '@pawly/validators';
import type { TRPCContext } from '../context';

const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

async function resolveEmployeeId(ctx: TRPCContext): Promise<string> {
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.user!.sub },
    select: { employee: { select: { id: true } } },
  });

  if (!user?.employee?.id) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No linked employee account',
    });
  }

  return user.employee.id;
}

export const employeeScheduleRouter = router({
  getMySchedule: subscribedProcedure
    .input(getEmployeeScheduleSchema)
    .query(async ({ input, ctx }) => {
      const employeeId = await resolveEmployeeId(ctx);

      return ctx.employeeScheduleService.getEmployeeSchedule(
        ctx.user.clinicId,
        employeeId,
        input.month,
      );
    }),

  getMyShiftTypes: subscribedProcedure.query(async ({ ctx }) => {
    return ctx.employeeScheduleService.getEmployeeShiftTypes(
      ctx.user.clinicId,
    );
  }),

  getMyNotificationPreferences: subscribedProcedure.query(async ({ ctx }) => {
    const employeeId = await resolveEmployeeId(ctx);

    return ctx.employeeService.getNotificationPreferences(
      ctx.user.clinicId,
      employeeId,
    );
  }),

  updateMyNotificationPreferences: subscribedProcedure
    .input(updateNotificationPreferencesSchema)
    .mutation(async ({ input, ctx }) => {
      const employeeId = await resolveEmployeeId(ctx);

      return ctx.employeeService.updateNotificationPreferences(
        ctx.user.clinicId,
        employeeId,
        input,
      );
    }),

  subscribePush: subscribedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string().min(1),
          auth: z.string().min(1),
        }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const employeeId = await resolveEmployeeId(ctx);

      await ctx.pushNotificationService.subscribe(
        employeeId,
        ctx.user.clinicId,
        input,
      );
      return { success: true };
    }),

  unsubscribePush: subscribedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      const employeeId = await resolveEmployeeId(ctx);

      await ctx.pushNotificationService.unsubscribe(input.endpoint, employeeId);
      return { success: true };
    }),

  getMyPushSubscription: subscribedProcedure.query(async ({ ctx }) => {
    const employeeId = await resolveEmployeeId(ctx);

    const subscription = await ctx.pushNotificationService.getSubscription(employeeId);
    return subscription
      ? { subscribed: true as const, endpoint: subscription.endpoint }
      : { subscribed: false as const };
  }),
});
