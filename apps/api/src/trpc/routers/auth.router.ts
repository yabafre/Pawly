import { publicProcedure, router, isAuthed } from '../trpc';
import { z } from '@pawly/zod';
import {
  loginSchema,
  requestMagicLinkSchema,
  validateMagicLinkSchema,
  activateAccountInputSchema,
  requestOtpSchema,
  verifyOtpSchema,
  otpRequestResponseSchema,
  authResponseSchema,
  requestPasswordResetSchema,
  resetPasswordInputSchema,
  changePasswordSchema,
  updateAdminProfileSchema,
  registerAdminInputSchema,
} from '@pawly/validators';
import { TRPCError } from '@trpc/server';
import { UnauthorizedException } from '@nestjs/common';

/** Convert NestJS UnauthorizedException to TRPCError for proper client propagation */
function rethrowAsTRPC(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof UnauthorizedException) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: (error as Error).message });
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' });
}

const protectedProcedure = publicProcedure.use(isAuthed);

export const authRouter = router({
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.sub },
      select: { name: true, locale: true, employee: { select: { id: true, jobType: true } } },
    });
    return {
      role: ctx.user.role,
      clinicId: ctx.user.clinicId,
      email: ctx.user.email,
      name: user?.name ?? null,
      locale: user?.locale ?? 'fr',
      employeeId: user?.employee?.id ?? null,
      jobType: user?.employee?.jobType ?? null,
    };
  }),

  register: publicProcedure
    .input(registerAdminInputSchema.omit({ turnstileToken: true }).extend({ locale: z.enum(['fr', 'en']).optional() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.authService.registerAdmin(input);
      } catch (error) { rethrowAsTRPC(error); }
    }),

  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.authService.login(input);
      } catch (error) { rethrowAsTRPC(error); }
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
      try {
        return await ctx.authService.requestOtp(input.email);
      } catch (error) { rethrowAsTRPC(error); }
    }),
  verifyOtp: publicProcedure
    .input(verifyOtpSchema)
    .output(authResponseSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.authService.verifyOtp(input.email, input.code);
      } catch (error) { rethrowAsTRPC(error); }
    }),
  requestPasswordReset: publicProcedure
    .input(requestPasswordResetSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.authService.requestPasswordReset(input.email);
    }),
  resetPassword: publicProcedure
    .input(resetPasswordInputSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.authService.resetPassword(input.token, input.password);
    }),
  changePassword: protectedProcedure
    .input(changePasswordSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can change password' });
      }
      return ctx.authService.changePassword(ctx.user.sub, input.currentPassword, input.newPassword);
    }),
  updateProfile: protectedProcedure
    .input(updateAdminProfileSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update profile' });
      }
      return ctx.authService.updateAdminProfile(ctx.user.sub, input);
    }),
});

export type AuthRouter = typeof authRouter;
