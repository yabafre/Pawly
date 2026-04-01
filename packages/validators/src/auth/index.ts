export { loginSchema } from "./login.schema";
export { requestMagicLinkSchema, validateMagicLinkSchema } from "./magic-link.schema";
export { activateAccountSchema, activateAccountBaseSchema, activateAccountInputSchema } from "./activation.schema";
export { userSchema, authUserSchema } from "./user.schema";
export { authResponseSchema, magicLinkResponseSchema } from "./response.schema";
export type { AuthResponse, MagicLinkResponse } from "./response.schema";
export { requestOtpSchema, verifyOtpSchema, otpRequestResponseSchema } from "./otp.schema";
export {
  requestPasswordResetSchema,
  resetPasswordInputSchema,
  resetPasswordFormSchema,
} from "./password-reset.schema";
export type { RequestPasswordResetInput, ResetPasswordInput } from "./password-reset.schema";
export { changePasswordSchema } from "./change-password.schema";
export type { ChangePasswordInput } from "./change-password.schema";
export { updateAdminProfileSchema } from "./update-profile.schema";
export type { UpdateAdminProfileInput } from "./update-profile.schema";
