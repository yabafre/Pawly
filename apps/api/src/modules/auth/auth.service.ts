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

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_EXPIRY = '7d';
const MAGIC_LINK_TTL_MINUTES = 15;
const MAGIC_LINK_CLEANUP_HOURS = 24;
const MAGIC_LINK_MIN_RESPONSE_MS = 300;
const ACTIVATION_TOKEN_TTL_HOURS = 24;

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

    async login(loginDto: LoginDto) {
        const user = await this.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return this.generateToken(user);
    }

    private generateToken(user: User | Omit<User, 'password'>) {
        const safeUser = this.sanitizeUser(user);
        const payload = { email: safeUser.email, sub: safeUser.id, role: safeUser.role, clinicId: safeUser.clinicId };
        return {
            access_token: this.jwtService.sign(payload),
            refresh_token: this.jwtService.sign(payload, { expiresIn: REFRESH_TOKEN_EXPIRY }),
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
        await this.mailService.sendMagicLink(user.email, callbackUrl);

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

        // Cleanup expired magic links in background (non-blocking)
        // TODO: Replace with scheduled cron job (e.g., @nestjs/schedule) for reliable cleanup.
        // If this consistently fails, MagicLink table will grow unbounded.
        this.cleanupExpiredMagicLinks().catch((err) =>
            this.logger.warn('Failed to cleanup expired magic links', err),
        );

        return this.generateToken(user);
    }

    private async delayToMinimumResponse(startTime: number): Promise<void> {
        const remaining = MAGIC_LINK_MIN_RESPONSE_MS - (Date.now() - startTime);
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

    async createActivationToken(email: string, adminName?: string) {
        const startTime = Date.now();
        const user = await this.prisma.user.findUnique({ where: { email } });

        if (!user) {
            await this.delayToMinimumResponse(startTime);
            return { message: 'If an account exists, an activation email has been sent' };
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
        const activateUrl = `${baseUrl}/auth/activate?token=${rawToken}`;
        await this.mailService.sendActivationEmail(user.email, activateUrl, adminName);

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

    // NOTE: Refresh tokens are stateless JWTs (7d expiry). This means:
    // - Cannot revoke individual tokens if compromised
    // - Cannot implement "logout from all devices"
    // TODO: For production, migrate to database-backed refresh tokens with family chain for theft detection
    async refreshToken(token: string) {
        try {
            const payload = this.jwtService.verify(token);
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
            });
            if (!user) {
                this.logger.warn(`Refresh token: user not found for sub=${payload.sub}`);
                throw new UnauthorizedException('Invalid refresh token');
            }
            return this.generateToken(user);
        } catch (error) {
            if (error instanceof UnauthorizedException) throw error;
            this.logger.warn('Refresh token verification failed', error instanceof Error ? error.message : error);
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
    }
}
