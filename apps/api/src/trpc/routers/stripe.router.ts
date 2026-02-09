import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed } from '../trpc';
import {
  createCheckoutSessionSchema,
  createBillingPortalSessionSchema,
} from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);

const DEFAULT_INVOICE_LIMIT = 10;

export const stripeRouter = router({
  createCheckoutSession: publicProcedure
    .input(createCheckoutSessionSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.stripeService.createCheckoutSession(input);
    }),

  getBillingOverview: protectedProcedure.query(async ({ ctx }) => {
    const subscription = await ctx.prisma.subscription.findUnique({
      where: { clinicId: ctx.user.clinicId },
    });

    if (!subscription) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No subscription found for this clinic',
      });
    }

    if (!subscription.stripeSubscriptionId) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Subscription is not fully initialized',
      });
    }

    const [details, invoices] = await Promise.all([
      ctx.stripeService.getSubscriptionWithDetails(
        subscription.stripeSubscriptionId,
      ),
      ctx.stripeService.listInvoices(
        subscription.stripeCustomerId,
        DEFAULT_INVOICE_LIMIT,
      ),
    ]);

    return {
      subscription: {
        ...details,
        promotionCodeId: subscription.promotionCodeId ?? null,
        couponId: subscription.couponId ?? null,
        discountType: subscription.discountType ?? null,
        discountValue: subscription.discountValue ?? null,
        couponMetadataType: subscription.couponMetadataType ?? null,
      },
      invoices,
    };
  }),

  createBillingPortalSession: protectedProcedure
    .input(createBillingPortalSessionSchema)
    .mutation(async ({ input, ctx }) => {
      const subscription = await ctx.prisma.subscription.findUnique({
        where: { clinicId: ctx.user.clinicId },
      });

      if (!subscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No subscription found for this clinic',
        });
      }

      return ctx.stripeService.createBillingPortalSession(
        subscription.stripeCustomerId,
        input.returnUrl,
        input.locale,
      );
    }),
});

export type StripeRouter = typeof stripeRouter;
