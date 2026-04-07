import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { MailService } from '@/modules/mail/mail.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import type { EnvConfig } from '@/config/index';
import type { User } from '@prisma/client';
import { authRequestCounter } from '@/common/metrics';
import type { MailLocale } from '@/modules/mail/mail-i18n';
import { generateSlug } from '@/common/utils/slug';
import type { RegisterAdminInput } from '@pawly/validators';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_TTL_DAYS = 7;
const MAGIC_LINK_TTL_MINUTES = 15;
const MAGIC_LINK_CLEANUP_HOURS = 24;
const MIN_RESPONSE_MS = 300;
const ACTIVATION_TOKEN_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_HOURS = 1;
const WELCOME_MAGIC_LINK_TTL_HOURS = 24;
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_FALLBACK_HOURS = 48;
const OTP_CLEANUP_HOURS = 24;

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private mailService: MailService,
        private configService: ConfigService<EnvConfig, true>,
    ) { }

    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    private hashOtp(code: string): string {
        const secret = this.configService.get('JWT_SECRET', { infer: true });
        return crypto.createHmac('sha256', secret).update(code).digest('hex');
    }

    private sanitizeUser(user: User | Omit<User, 'password'>): Omit<User, 'password'> {
        if ('password' in user) {
            const { password: _password, ...safeUser } = user;
            return safeUser;
        }
        return user;
    }

    async validateUser(email: string, pass: string): Promise<Omit<User, 'password'> | null> {
        const user = await this.prisma.user.findUnique({ where: { email } });

        // Always run bcrypt.compare to prevent timing-based user enumeration
        const dummyHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiGWxYLx.UPi';
        const isValid = await bcrypt.compare(pass, user?.password ?? dummyHash);

        if (user && user.password && isValid) {
            const { password: _password, ...result } = user;
            return result;
        }
        return null;
    }

    async registerAdmin(input: Omit<RegisterAdminInput, 'turnstileToken'> & { locale?: string }) {
        const startTime = Date.now();

        const existingUser = await this.prisma.user.findUnique({
            where: { email: input.email },
        });

        if (existingUser) {
            await this.delayToMinimumResponse(startTime);
            throw new UnauthorizedException('EMAIL_ALREADY_EXISTS');
        }

        const hashedPassword = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

        const user = await this.prisma.$transaction(async (tx) => {
            const clinic = await tx.clinic.create({
                data: {
                    name: input.clinicName,
                    slug: generateSlug(input.clinicName),
                    onboardingCompleted: false,
                },
            });

            const createdUser = await tx.user.create({
                data: {
                    email: input.email,
                    name: input.adminName,
                    password: hashedPassword,
                    role: 'ADMIN',
                    clinicId: clinic.id,
                    locale: input.locale === 'en' ? 'en' : 'fr',
                },
            });

            await tx.subscription.create({
                data: {
                    clinicId: clinic.id,
                    status: 'active',
                    planKey: 'starter_free',
                    entitlementTier: 'starter',
                },
            });

            return createdUser;
        });

        authRequestCounter.add(1, { method: 'register', outcome: 'success' });

        const tokens = await this.generateToken(user);

        // Welcome email (fire-and-forget — user is already logged in)
        const mailLocale = (input.locale === 'en' ? 'en' : 'fr') as import('@/modules/mail/mail-i18n').MailLocale;
        this.mailService.sendWelcomeEmail(input.email, input.adminName, mailLocale).catch((err) =>
            this.logger.warn('Failed to send welcome email', err),
        );

        await this.delayToMinimumResponse(startTime);

        return tokens;
    }

    async login(loginDto: LoginDto) {
        const user = await this.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return this.generateToken(user);
    }

    private async generateToken(user: User | Omit<User, 'password'>, family?: string) {
        const safeUser = this.sanitizeUser(user);
        const payload = { email: safeUser.email, sub: safeUser.id, role: safeUser.role, clinicId: safeUser.clinicId };

        const accessToken = this.jwtService.sign(payload);

        // Generate opaque refresh token and store hash in DB
        const rawRefreshToken = crypto.randomBytes(48).toString('base64url');
        const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
        const tokenFamily = family ?? crypto.randomUUID();

        await this.prisma.refreshToken.create({
            data: {
                tokenHash,
                family: tokenFamily,
                userId: safeUser.id,
                expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
            },
        });

        return {
            access_token: accessToken,
            refresh_token: rawRefreshToken,
            user: safeUser,
        };
    }

    async requestMagicLink(email: string) {
        const startTime = Date.now();
        const user = await this.prisma.user.findUnique({ where: { email } });

        // Prevent user enumeration — consistent response AND consistent timing
        if (!user) {
            await this.delayToMinimumResponse(startTime);
            return { message: 'If an account exists, a magic link has been sent' };
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = this.hashToken(rawToken);
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + MAGIC_LINK_TTL_MINUTES);

        // Note: user.clinicId read from same request context. If atomicity becomes
        // a concern (e.g., bulk user migrations), wrap user lookup + create in $transaction.
        await this.prisma.magicLink.create({
            data: {
                token: hashedToken,
                expiresAt,
                userId: user.id,
                clinicId: user.clinicId,
            },
        });

        const baseUrl = this.configService.get('WEB_APP_URL', { infer: true });
        const callbackUrl = `${baseUrl}/auth/callback?token=${rawToken}`;
        const locale = (user.locale as MailLocale) ?? 'fr';
        await this.mailService.sendMagicLink(user.email, callbackUrl, locale);

        authRequestCounter.add(1, { method: 'magic_link', outcome: 'sent' });
        return { message: 'If an account exists, a magic link has been sent' };
    }

    async validateMagicLink(token: string) {
        const hashedToken = this.hashToken(token);

        const user = await this.prisma.$transaction(async (tx) => {
            const magicLink = await tx.magicLink.findUnique({
                where: { token: hashedToken },
                include: { user: true },
            });

            // Combine all checks to prevent timing attacks - single error path
            const isInvalid = !magicLink || magicLink.used || magicLink.expiresAt < new Date();
            if (isInvalid) {
                throw new UnauthorizedException('Invalid or expired magic link');
            }

            // Optimistic lock: only update if still unused
            const updated = await tx.magicLink.updateMany({
                where: { token: hashedToken, used: false },
                data: { used: true },
            });

            if (updated.count === 0) {
                throw new UnauthorizedException('Invalid or expired magic link');
            }

            return magicLink.user;
        });

        authRequestCounter.add(1, { method: 'magic_link', outcome: 'validated' });

        // Cleanup expired magic links in background (non-blocking)
        // TODO: Replace with scheduled cron job (e.g., @nestjs/schedule) for reliable cleanup.
        // If this consistently fails, MagicLink table will grow unbounded.
        this.cleanupExpiredMagicLinks().catch((err) =>
            this.logger.warn('Failed to cleanup expired magic links', err),
        );

        return this.generateToken(user);
    }

    private async delayToMinimumResponse(startTime: number, minMs = MIN_RESPONSE_MS): Promise<void> {
        const remaining = minMs - (Date.now() - startTime);
        if (remaining > 0) {
            await new Promise(resolve => setTimeout(resolve, remaining));
        }
    }

    private async cleanupExpiredMagicLinks() {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - MAGIC_LINK_CLEANUP_HOURS);
        await this.prisma.magicLink.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: cutoff } },
                    { used: true, createdAt: { lt: cutoff } },
                ],
            },
        });
    }

    async requestOtp(email: string) {
        const startTime = Date.now();
        const user = await this.prisma.user.findUnique({ where: { email } });

        if (!user) {
            await this.delayToMinimumResponse(startTime);
            return { method: 'otp' as const, message: 'If account exists, code sent' };
        }

        // Admin accounts must use password login, not OTP
        if (user.role === 'ADMIN') {
            await this.delayToMinimumResponse(startTime);
            throw new UnauthorizedException('ADMIN_USE_PASSWORD');
        }

        // Check if user is in Magic Link fallback mode
        if (user.otpFallbackUntil && user.otpFallbackUntil > new Date()) {
            await this.requestMagicLink(email);
            await this.delayToMinimumResponse(startTime);
            return { method: 'magic_link' as const, message: 'If account exists, link sent' };
        }

        // Invalidate any existing unused OTP for this user
        await this.prisma.otpCode.updateMany({
            where: { userId: user.id, used: false },
            data: { used: true },
        });

        // Generate 6-digit code
        const rawCode = crypto.randomInt(100000, 1000000).toString();
        const hashedCode = this.hashOtp(rawCode);

        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + OTP_TTL_MINUTES);

        await this.prisma.otpCode.create({
            data: {
                code: hashedCode,
                expiresAt,
                userId: user.id,
                clinicId: user.clinicId,
            },
        });

        const locale = (user.locale as MailLocale) ?? 'fr';
        await this.mailService.sendOtpCode(email, rawCode, locale);

        authRequestCounter.add(1, { method: 'otp', outcome: 'sent' });
        await this.delayToMinimumResponse(startTime);
        return { method: 'otp' as const, message: 'If account exists, code sent' };
    }

    async verifyOtp(email: string, code: string) {
        const startTime = Date.now();
        const hashedCode = this.hashOtp(code);

        let user: User | null = null;
        try {
            user = await this.prisma.$transaction(async (tx) => {
                const foundUser = await tx.user.findUnique({ where: { email } });
                if (!foundUser) {
                    return null;
                }

                const otpCode = await tx.otpCode.findFirst({
                    where: {
                        userId: foundUser.id,
                        used: false,
                        expiresAt: { gt: new Date() },
                    },
                    orderBy: { createdAt: 'desc' },
                });

                if (!otpCode) {
                    return null;
                }

                // Check max attempts
                if (otpCode.attempts >= OTP_MAX_ATTEMPTS) {
                    await tx.user.update({
                        where: { id: foundUser.id },
                        data: {
                            otpFallbackUntil: new Date(Date.now() + OTP_FALLBACK_HOURS * 60 * 60 * 1000),
                        },
                    });
                    await tx.otpCode.updateMany({
                        where: { id: otpCode.id, used: false },
                        data: { used: true },
                    });
                    throw new UnauthorizedException('Too many attempts. Check email for login link.');
                }

                // Verify code
                if (hashedCode !== otpCode.code) {
                    // Optimistic lock increment
                    const updated = await tx.otpCode.updateMany({
                        where: { id: otpCode.id, attempts: otpCode.attempts },
                        data: { attempts: { increment: 1 } },
                    });

                    if (updated.count === 0) {
                        throw new UnauthorizedException('Invalid code');
                    }

                    // Check if this increment reaches max
                    if (otpCode.attempts + 1 >= OTP_MAX_ATTEMPTS) {
                        await tx.user.update({
                            where: { id: foundUser.id },
                            data: {
                                otpFallbackUntil: new Date(Date.now() + OTP_FALLBACK_HOURS * 60 * 60 * 1000),
                            },
                        });
                        await tx.otpCode.updateMany({
                            where: { id: otpCode.id, used: false },
                            data: { used: true },
                        });
                        throw new UnauthorizedException('Too many attempts. Check email for login link.');
                    }

                    throw new UnauthorizedException('Invalid code');
                }

                // Code matches — optimistic lock mark as used
                const usedUpdate = await tx.otpCode.updateMany({
                    where: { id: otpCode.id, used: false },
                    data: { used: true },
                });

                if (usedUpdate.count === 0) {
                    throw new UnauthorizedException('Invalid code');
                }

                return foundUser;
            });
        } catch (error) {
            // Enforce minimum response time on ALL error paths to prevent timing attacks
            await this.delayToMinimumResponse(startTime);
            throw error;
        }

        if (!user) {
            authRequestCounter.add(1, { method: 'otp', outcome: 'invalid' });
            await this.delayToMinimumResponse(startTime);
            throw new UnauthorizedException('Invalid or expired code');
        }

        // Cleanup in background
        this.cleanupExpiredOtpCodes().catch((err) =>
            this.logger.warn('Failed to cleanup expired OTP codes', err),
        );

        authRequestCounter.add(1, { method: 'otp', outcome: 'validated' });
        await this.delayToMinimumResponse(startTime);
        return this.generateToken(user);
    }

    async createWelcomeMagicLink(email: string): Promise<string | null> {
        const user = await this.prisma.user.findUnique({ where: { email } });

        if (!user) {
            return null;
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = this.hashToken(rawToken);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + WELCOME_MAGIC_LINK_TTL_HOURS);

        await this.prisma.magicLink.create({
            data: {
                token: hashedToken,
                expiresAt,
                userId: user.id,
                clinicId: user.clinicId,
            },
        });

        const baseUrl = this.configService.get('WEB_APP_URL', { infer: true });
        return `${baseUrl}/auth/callback?token=${rawToken}`;
    }

    async createActivationTokenAndGetUrl(email: string): Promise<string | null> {
        const user = await this.prisma.user.findUnique({ where: { email } });

        if (!user) {
            return null;
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = this.hashToken(rawToken);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + ACTIVATION_TOKEN_TTL_HOURS);

        await this.prisma.activationToken.create({
            data: {
                token: hashedToken,
                expiresAt,
                userId: user.id,
                clinicId: user.clinicId,
            },
        });

        const baseUrl = this.configService.get('WEB_APP_URL', { infer: true });
        return `${baseUrl}/auth/activate?token=${rawToken}`;
    }

    async createActivationToken(email: string, adminName?: string) {
        const startTime = Date.now();
        const activateUrl = await this.createActivationTokenAndGetUrl(email);

        if (!activateUrl) {
            await this.delayToMinimumResponse(startTime);
            return { message: 'If an account exists, an activation email has been sent' };
        }

        await this.mailService.sendActivationEmail(email, activateUrl, adminName);

        return { message: 'If an account exists, an activation email has been sent' };
    }

    async activateAccount(token: string, password: string) {
        const hashedToken = this.hashToken(token);

        const user = await this.prisma.$transaction(async (tx) => {
            const activationToken = await tx.activationToken.findUnique({
                where: { token: hashedToken },
                include: { user: true },
            });

            const isInvalid = !activationToken || activationToken.used || activationToken.expiresAt < new Date();
            if (isInvalid) {
                throw new UnauthorizedException('Invalid or expired activation token');
            }

            const updated = await tx.activationToken.updateMany({
                where: { token: hashedToken, used: false },
                data: { used: true },
            });

            if (updated.count === 0) {
                throw new UnauthorizedException('Invalid or expired activation token');
            }

            const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
            await tx.user.update({
                where: { id: activationToken.userId },
                data: { password: hashedPassword },
            });

            return activationToken.user;
        });

        this.cleanupExpiredActivationTokens().catch((err) =>
            this.logger.warn('Failed to cleanup expired activation tokens', err),
        );

        return this.generateToken(user);
    }

    // ── Password Reset ────────────────────────────────────────────────

    async requestPasswordReset(email: string) {
        const startTime = Date.now();

        const user = await this.prisma.user.findUnique({ where: { email } });

        // Only admin users have passwords — employees use OTP
        if (!user || user.role !== 'ADMIN') {
            await this.delayToMinimumResponse(startTime);
            return { message: 'If an account exists, a reset link has been sent' };
        }

        // Invalidate previous unused tokens for this user
        await this.prisma.passwordResetToken.updateMany({
            where: { userId: user.id, used: false },
            data: { used: true },
        });

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = this.hashToken(rawToken);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + PASSWORD_RESET_TTL_HOURS);

        await this.prisma.passwordResetToken.create({
            data: {
                token: hashedToken,
                expiresAt,
                userId: user.id,
                clinicId: user.clinicId,
            },
        });

        const baseUrl = this.configService.get('WEB_APP_URL', { infer: true });
        const locale = (user.locale ?? 'fr') as 'fr' | 'en';
        const prefix = locale === 'fr' ? '' : `/${locale}`;
        const resetUrl = `${baseUrl}${prefix}/reset-password?token=${rawToken}`;

        await this.mailService.sendPasswordResetEmail(email, resetUrl, locale);
        await this.delayToMinimumResponse(startTime);

        return { message: 'If an account exists, a reset link has been sent' };
    }

    async resetPassword(token: string, password: string) {
        const hashedToken = this.hashToken(token);

        const user = await this.prisma.$transaction(async (tx) => {
            const resetToken = await tx.passwordResetToken.findUnique({
                where: { token: hashedToken },
                include: { user: true },
            });

            const isInvalid = !resetToken || resetToken.used || resetToken.expiresAt < new Date();
            if (isInvalid) {
                throw new UnauthorizedException('Invalid or expired reset token');
            }

            const updated = await tx.passwordResetToken.updateMany({
                where: { token: hashedToken, used: false },
                data: { used: true },
            });

            if (updated.count === 0) {
                throw new UnauthorizedException('Invalid or expired reset token');
            }

            const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
            await tx.user.update({
                where: { id: resetToken.userId },
                data: { password: hashedPassword },
            });

            return resetToken.user;
        });

        this.cleanupExpiredPasswordResetTokens().catch((err) =>
            this.logger.warn('Failed to cleanup expired password reset tokens', err),
        );

        return this.generateToken(user);
    }

    // ── Change Password (authenticated) ────────────────────────────────

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if (!user || !user.password || user.role !== 'ADMIN') {
            throw new UnauthorizedException('Cannot change password');
        }

        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            throw new UnauthorizedException('Current password is incorrect');
        }

        const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await this.prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });

        return { success: true };
    }

    async updateAdminProfile(userId: string, data: { name?: string; locale?: string }) {
        const updated = await this.prisma.user.update({
            where: { id: userId },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.locale !== undefined && { locale: data.locale }),
            },
            select: { id: true, name: true, email: true, locale: true },
        });

        return updated;
    }

    private async cleanupExpiredPasswordResetTokens() {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - PASSWORD_RESET_TTL_HOURS);
        await this.prisma.passwordResetToken.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: cutoff } },
                    { used: true, createdAt: { lt: cutoff } },
                ],
            },
        });
    }

    private async cleanupExpiredOtpCodes() {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - OTP_CLEANUP_HOURS);
        await this.prisma.otpCode.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: cutoff } },
                    { used: true, createdAt: { lt: cutoff } },
                ],
            },
        });
    }

    private async cleanupExpiredActivationTokens() {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - ACTIVATION_TOKEN_TTL_HOURS);
        await this.prisma.activationToken.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: cutoff } },
                    { used: true, createdAt: { lt: cutoff } },
                ],
            },
        });
    }

    async refreshToken(token: string) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const storedToken = await this.prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });

        if (!storedToken) {
            this.logger.warn('Refresh token not found in DB');
            throw new UnauthorizedException('Invalid refresh token');
        }

        if (storedToken.revokedAt) {
            // Reuse detected — revoke entire family (potential theft)
            this.logger.warn(`Refresh token reuse detected for family=${storedToken.family}, revoking all`);
            await this.prisma.refreshToken.updateMany({
                where: { family: storedToken.family, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            throw new UnauthorizedException('Refresh token reuse detected — all sessions revoked');
        }

        if (storedToken.expiresAt < new Date()) {
            this.logger.warn('Refresh token expired');
            throw new UnauthorizedException('Refresh token expired');
        }

        // Revoke current token (single-use rotation)
        await this.prisma.refreshToken.update({
            where: { id: storedToken.id },
            data: { revokedAt: new Date() },
        });

        // Issue new token pair in the same family
        return this.generateToken(storedToken.user, storedToken.family);
    }

    async revokeAllUserTokens(userId: string) {
        await this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }
}
