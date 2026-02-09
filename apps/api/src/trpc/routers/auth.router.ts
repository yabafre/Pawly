import { publicProcedure, router } from '../trpc';
import {
  loginSchema,
  requestMagicLinkSchema,
  validateMagicLinkSchema,
  activateAccountInputSchema,
} from '@pawly/validators';

export const authRouter = router({
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.authService.login(input);
    }),
  requestMagicLink: publicProcedure
    .input(requestMagicLinkSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.authService.requestMagicLink(input.email);
    }),
  validateMagicLink: publicProcedure
    .input(validateMagicLinkSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.authService.validateMagicLink(input.token);
    }),
  activateAccount: publicProcedure
    .input(activateAccountInputSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.authService.activateAccount(input.token, input.password);
    }),
});

export type AuthRouter = typeof authRouter;
