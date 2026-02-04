import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
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

@Injectable()
export class AuthService {
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
        if (user && user.password && (await bcrypt.compare(pass, user.password))) {
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

    async register(registerDto: RegisterDto) {
        const hashedPassword = await bcrypt.hash(registerDto.password, BCRYPT_ROUNDS);
        try {
            const user = await this.prisma.user.create({
                data: {
                    email: registerDto.email,
                    password: hashedPassword,
                    clinicId: 'temp-clinic-id',
                    employee: {
                        create: {
                            firstName: registerDto.firstName,
                            lastName: registerDto.lastName,
                            jobType: registerDto.jobType as any,
                            clinicId: 'temp-clinic-id',
                        },
                    },
                },
                include: {
                    employee: true
                }
            });
            const { password, ...result } = user;
            return result;
        } catch (error: any) {
            if (error?.code === 'P2002') {
                throw new BadRequestException('Registration failed. Please try again.');
            }
            throw error;
        }
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
        expiresAt.setMinutes(expiresAt.getMinutes() + 15);

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

        return this.generateToken(user);
    }

    async refreshToken(token: string) {
        try {
            const payload = this.jwtService.verify(token);
            const user = await this.prisma.user.findFirst({
                where: { id: payload.sub },
            });
            if (!user) {
                throw new UnauthorizedException('Invalid refresh token');
            }
            return this.generateToken(user);
        } catch {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
    }
}
