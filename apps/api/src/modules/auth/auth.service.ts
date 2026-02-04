import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { MailService } from '@/modules/mail/mail.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { EnvConfig } from '@/config/index';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_EXPIRY = '7d';
const MAGIC_LINK_TTL_MINUTES = 15;
const MAGIC_LINK_CLEANUP_HOURS = 24;

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

    private sanitizeUser(user: any) {
        if (!user || typeof user !== 'object') {
            return user;
        }
        const { password, ...safeUser } = user;
        return safeUser;
    }

    async validateUser(email: string, pass: string, clinicId: string): Promise<any> {
        const user = await this.prisma.user.findFirst({ where: { email, clinicId } });

        // Always run bcrypt.compare to prevent timing-based user enumeration
        const dummyHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiGWxYLx.UPi';
        const isValid = await bcrypt.compare(pass, user?.password ?? dummyHash);

        if (user && user.password && isValid) {
            const { password, ...result } = user;
            return result;
        }
        return null;
    }

    async login(loginDto: LoginDto) {
        const user = await this.validateUser(loginDto.email, loginDto.password, loginDto.clinicId);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return this.generateToken(user);
    }

    private generateToken(user: any) {
        const safeUser = this.sanitizeUser(user);
        const payload = { email: safeUser.email, sub: safeUser.id, role: safeUser.role, clinicId: safeUser.clinicId };
        return {
            access_token: this.jwtService.sign(payload),
            refresh_token: this.jwtService.sign(payload, { expiresIn: REFRESH_TOKEN_EXPIRY }),
            user: safeUser,
        };
    }

    /**
     * @deprecated Registration is disabled. Account creation happens exclusively
     * via Stripe webhook (checkout.session.completed). Will be removed in Story 1.5.
     */
    async register(_registerDto: RegisterDto) {
        throw new ForbiddenException(
            'Registration is disabled. Account creation happens via subscription checkout.',
        );
    }

    async requestMagicLink(email: string, clinicId: string) {
        const user = await this.prisma.user.findFirst({ where: { email, clinicId } });

        // Prevent user enumeration - always return same response
        if (!user) {
            return { message: 'If an account exists, a magic link has been sent' };
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = this.hashToken(rawToken);
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + MAGIC_LINK_TTL_MINUTES);

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
        this.cleanupExpiredMagicLinks().catch((err) =>
            this.logger.warn('Failed to cleanup expired magic links', err),
        );

        return this.generateToken(user);
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

    async refreshToken(token: string) {
        try {
            const payload = this.jwtService.verify(token);
            const user = await this.prisma.user.findFirst({
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
