import { publicProcedure, router, isAuthed } from '../trpc';
import {
  loginSchema,
  requestMagicLinkSchema,
  validateMagicLinkSchema,
  activateAccountInputSchema,
  requestOtpSchema,
  verifyOtpSchema,
  otpRequestResponseSchema,
  authResponseSchema,
} from '@pawly/validators';

const protectedProcedure = publicProcedure.use(isAuthed);

export const authRouter = router({
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.sub },
      select: { employee: { select: { id: true, jobType: true } } },
    });
    return {
      role: ctx.user.role,
      clinicId: ctx.user.clinicId,
      email: ctx.user.email,
      employeeId: user?.employee?.id ?? null,
      jobType: user?.employee?.jobType ?? null,
    };
  }),

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
  requestOtp: publicProcedure
    .input(requestOtpSchema)
    .output(otpRequestResponseSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.authService.requestOtp(input.email);
    }),
  verifyOtp: publicProcedure
    .input(verifyOtpSchema)
    .output(authResponseSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.authService.verifyOtp(input.email, input.code);
    }),
});

export type AuthRouter = typeof authRouter;
