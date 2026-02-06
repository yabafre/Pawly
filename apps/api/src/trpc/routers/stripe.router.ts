import { publicProcedure, router } from '../trpc';
import { createCheckoutSessionSchema } from '@pawly/validators';

export const stripeRouter = router({
  createCheckoutSession: publicProcedure
    .input(createCheckoutSessionSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.stripeService.createCheckoutSession(input);
    }),
});

export type StripeRouter = typeof stripeRouter;
