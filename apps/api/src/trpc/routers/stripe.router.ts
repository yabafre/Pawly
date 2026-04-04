import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed } from '../trpc';
import {
  createCheckoutSessionSchema,
  createBillingPortalSessionSchema,
} from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);

const DEFAULT_INVOICE_LIMIT = 10;

export const stripeRouter = router({
  getSubscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const subscription = await ctx.prisma.subscription.findUnique({
      where: { clinicId: ctx.user.clinicId },
      select: {
        status: true,
        entitlementTier: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
      },
    });

    if (!subscription) {
      return null;
    }

    return {
      status: subscription.status,
      entitlementTier: subscription.entitlementTier,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? subscription.currentPeriodEnd.toISOString()
        : null,
    };
  }),

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

    if (!subscription.stripeCustomerId || !subscription.stripeSubscriptionId) {
      return {
        subscription: {
          status: subscription.status,
          planKey: subscription.planKey,
          entitlementTier: subscription.entitlementTier,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          promotionCodeId: null,
          couponId: null,
          discountType: null as 'percent' | 'amount' | null,
          discountValue: null,
          couponMetadataType: null as 'partner' | 'internal' | 'lifetime' | null,
        },
        invoices: [],
      };
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
        discountType: (subscription.discountType ?? null) as
          | 'percent'
          | 'amount'
          | null,
        discountValue: subscription.discountValue ?? null,
        couponMetadataType: (subscription.couponMetadataType ?? null) as
          | 'partner'
          | 'internal'
          | 'lifetime'
          | null,
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

      // Validate returnUrl against allowed origins to prevent open redirect
      const webAppUrl = process.env.WEB_APP_URL ?? '';
      if (webAppUrl) {
        const allowedOrigins = webAppUrl.split(',').map((o) => o.trim());
        const returnOrigin = new URL(input.returnUrl).origin;
        if (!allowedOrigins.includes(returnOrigin)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'returnUrl must match an allowed application origin',
          });
        }
      }

      if (!subscription.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No Stripe customer found — upgrade to Professional first',
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
