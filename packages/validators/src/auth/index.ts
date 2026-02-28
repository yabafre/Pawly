export { loginSchema } from "./login.schema";
export { requestMagicLinkSchema, validateMagicLinkSchema } from "./magic-link.schema";
export { activateAccountSchema, activateAccountBaseSchema, activateAccountInputSchema } from "./activation.schema";
export { userSchema, authUserSchema } from "./user.schema";
export { authResponseSchema, magicLinkResponseSchema } from "./response.schema";
export type { AuthResponse, MagicLinkResponse } from "./response.schema";
export { requestOtpSchema, verifyOtpSchema, otpRequestResponseSchema } from "./otp.schema";
