import { publicProcedure, router } from '../trpc';
import {
  loginSchema,
  requestMagicLinkSchema,
  validateMagicLinkSchema,
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
});

export type AuthRouter = typeof authRouter;
