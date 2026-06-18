import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed } from '../trpc';
import {
  createCheckoutSessionSchema,
  createBillingPortalSessionSchema,
} from '@pawly/validators';
import { z } from '@pawly/zod';
import { deriveEntitlementTier } from '@/modules/stripe/stripe.utils';

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

  createUpgradeSession: protectedProcedure
    .input(
      z.object({
        priceId: z.string(),
        locale: z.enum(['fr', 'en']).optional(),
        successPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.sub },
        include: { clinic: true },
      });
      if (!user || !user.clinic) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User or clinic not found',
        });
      }
      const locale = input.locale ?? 'fr';
      const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000';
      const successUrl = input.successPath
        ? `${webAppUrl}/${locale}${input.successPath}`
        : `${webAppUrl}/${locale}/admin/billing?upgraded=true`;
      const cancelUrl = input.successPath
        ? `${webAppUrl}/${locale}/pricing`
        : `${webAppUrl}/${locale}/admin/billing`;
      const session = await ctx.stripeService.stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_collection: 'if_required',
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: user.email,
        allow_promotion_codes: true,
        metadata: {
          clinicName: user.clinic.name,
          adminName: user.name ?? '',
          adminEmail: user.email,
        },
        subscription_data: {
          metadata: {
            clinicName: user.clinic.name,
            adminName: user.name ?? '',
            adminEmail: user.email,
          },
        },
      });
      if (!session.url) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Stripe session created without URL',
        });
      }
      return { sessionId: session.id, url: session.url };
    }),

  setupStarterSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const subscription = await ctx.prisma.subscription.findUnique({
      where: { clinicId: ctx.user.clinicId },
    });

    if (!subscription) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No subscription found',
      });
    }

    // Already has Stripe IDs or already upgraded to Pro — nothing to do
    if (subscription.stripeCustomerId && subscription.stripeSubscriptionId) {
      return { alreadySetup: true };
    }
    if (subscription.entitlementTier !== 'starter') {
      return { alreadySetup: true };
    }

    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.sub },
      include: { clinic: true },
    });
    if (!user || !user.clinic) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User or clinic not found',
      });
    }

    const starterPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER;
    if (!starterPriceId) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Starter price not configured',
      });
    }

    // Create Stripe customer
    const customer = await ctx.stripeService.stripe.customers.create({
      email: user.email,
      name: user.clinic.name,
      metadata: { clinicId: user.clinicId, adminEmail: user.email },
    });

    // Create free subscription
    const stripeSub = await ctx.stripeService.stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: starterPriceId }],
      payment_behavior: 'default_incomplete',
      metadata: {
        clinicName: user.clinic.name,
        adminName: user.name ?? '',
        adminEmail: user.email,
      },
    });

    // Update DB subscription with Stripe IDs
    await ctx.prisma.subscription.update({
      where: { clinicId: ctx.user.clinicId },
      data: {
        stripeCustomerId: customer.id,
        stripeSubscriptionId: stripeSub.id,
        currentPeriodEnd: stripeSub.items.data[0]
          ? new Date(stripeSub.items.data[0].current_period_end * 1000)
          : null,
      },
    });

    // Send plan confirmation email (fire-and-forget)
    ctx.mailService
      .sendPlanConfirmationEmail(
        user.email,
        'starter',
        user.name ?? undefined,
        undefined,
        (user.locale as 'fr' | 'en') ?? 'fr',
      )
      .catch(() => {});

    return { alreadySetup: false };
  }),

  // Fallback sync: check Stripe for latest subscription state when webhook hasn't fired yet
  syncAfterCheckout: protectedProcedure.mutation(async ({ ctx }) => {
    const subscription = await ctx.prisma.subscription.findUnique({
      where: { clinicId: ctx.user.clinicId },
    });

    if (!subscription) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No subscription found',
      });
    }

    // Already synced by webhook (has Stripe IDs and is not starter_free)
    if (
      subscription.stripeSubscriptionId &&
      subscription.entitlementTier !== 'starter'
    ) {
      // Still send plan confirmation email (webhook doesn't send it)
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.sub },
        select: { email: true, name: true, locale: true },
      });
      if (user) {
        let invoiceUrl: string | undefined;
        try {
          const invoices = await ctx.stripeService.stripe.invoices.list({
            customer: subscription.stripeCustomerId!,
            subscription: subscription.stripeSubscriptionId,
            limit: 1,
          });
          invoiceUrl = invoices.data[0]?.hosted_invoice_url ?? undefined;
        } catch {
          /* ignore */
        }

        ctx.mailService
          .sendPlanConfirmationEmail(
            user.email,
            subscription.entitlementTier as 'starter' | 'professional',
            user.name ?? undefined,
            invoiceUrl,
            (user.locale as 'fr' | 'en') ?? 'fr',
          )
          .catch(() => {});
      }
      return { synced: true, tier: subscription.entitlementTier };
    }

    // Find the user's email to look up Stripe customer
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.sub },
      select: { email: true, name: true, locale: true },
    });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    // Search for recent checkout sessions for this email
    const sessions = await ctx.stripeService.stripe.checkout.sessions.list({
      customer_details: { email: user.email },
      limit: 5,
      status: 'complete',
    });

    const proSession = sessions.data.find(
      (s) => s.metadata?.adminEmail === user.email && s.subscription,
    );

    if (!proSession || !proSession.subscription || !proSession.customer) {
      return { synced: false, tier: subscription.entitlementTier };
    }

    const stripeSubscriptionId = proSession.subscription as string;
    const stripeCustomerId = proSession.customer as string;

    const stripeSub =
      await ctx.stripeService.stripe.subscriptions.retrieve(
        stripeSubscriptionId,
      );
    const firstItem = stripeSub.items.data[0];
    if (!firstItem) {
      return { synced: false, tier: subscription.entitlementTier };
    }

    const tier = deriveEntitlementTier(stripeSub);

    await ctx.prisma.subscription.update({
      where: { clinicId: ctx.user.clinicId },
      data: {
        stripeCustomerId,
        stripeSubscriptionId,
        status: stripeSub.status === 'active' ? 'active' : 'unpaid',
        planKey: firstItem.price.lookup_key ?? 'default',
        entitlementTier: tier,
        currentPeriodEnd: new Date(firstItem.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
    });

    // Get invoice URL for Pro plan confirmation email
    let invoiceUrl: string | undefined;
    try {
      const invoices = await ctx.stripeService.stripe.invoices.list({
        customer: stripeCustomerId,
        subscription: stripeSubscriptionId,
        limit: 1,
      });
      invoiceUrl = invoices.data[0]?.hosted_invoice_url ?? undefined;
    } catch {
      /* ignore */
    }

    // Send plan confirmation email (fire-and-forget)
    ctx.mailService
      .sendPlanConfirmationEmail(
        user.email,
        tier as 'starter' | 'professional',
        user.name ?? undefined,
        invoiceUrl,
        (user.locale as 'fr' | 'en') ?? 'fr',
      )
      .catch(() => {});

    return { synced: true, tier };
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

    if (!subscription.stripeCustomerId || !subscription.stripeSubscriptionId) {
      return {
        subscription: {
          status: subscription.status,
          planKey: subscription.planKey,
          planName:
            subscription.planKey === 'starter_free'
              ? 'Starter'
              : subscription.planKey,
          entitlementTier: subscription.entitlementTier,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          trialEnd: null,
          priceAmount: 0,
          priceCurrency: 'eur',
          priceInterval: 'month' as const,
          promotionCodeId: null,
          couponId: null,
          discountType: null as 'percent' | 'amount' | null,
          discountValue: null,
          couponMetadataType: null as
            | 'partner'
            | 'internal'
            | 'lifetime'
            | null,
        },
        invoices: [],
      };
    }

    try {
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
    } catch (err) {
      // Stripe unreachable or stale IDs — degrade to DB-known data instead of a
      // hard 500 (which otherwise triggers a client retry storm and shows
      // "unable to load billing"). The portal/upgrade actions still work.
      console.error(
        'getBillingOverview: Stripe fetch failed, serving DB-only data',
        err,
      );
      return {
        subscription: {
          status: subscription.status,
          planKey: subscription.planKey,
          planName:
            subscription.planKey === 'starter_free'
              ? 'Starter'
              : subscription.planKey,
          entitlementTier: subscription.entitlementTier,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          trialEnd: null,
          priceAmount: 0,
          priceCurrency: 'eur',
          priceInterval: 'month' as const,
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
        invoices: [],
      };
    }
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
