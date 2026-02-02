import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private mailService: MailService,
    ) { }

    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (user && user.password && (await bcrypt.compare(pass, user.password))) {
            const { password, ...result } = user;
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

    private generateToken(user: any) {
        const payload = { email: user.email, sub: user.id, role: user.role };
        return {
            access_token: this.jwtService.sign(payload),
            user: user,
        };
    }

    async register(registerDto: RegisterDto) {
        const hashedPassword = await bcrypt.hash(registerDto.password, 10);
        const user = await this.prisma.user.create({
            data: {
                email: registerDto.email,
                password: hashedPassword,
                clinicId: 'temp-clinic-id', // TODO: Extract from context or request
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
    }

    async requestMagicLink(email: string) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new UnauthorizedException('User not found');
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

        const baseUrl = process.env.WEB_APP_URL || 'http://localhost:3000';
        const callbackUrl = `${baseUrl}/auth/callback?token=${rawToken}`;
        await this.mailService.sendMagicLink(user.email, callbackUrl);

        return { message: 'Magic link sent' };
    }

    async validateMagicLink(token: string) {
        const hashedToken = this.hashToken(token);
        const magicLink = await this.prisma.magicLink.findUnique({
            where: { token: hashedToken },
            include: { user: true },
        });

        if (!magicLink) {
            throw new UnauthorizedException('Invalid magic link');
        }

        if (magicLink.used || magicLink.expiresAt < new Date()) {
            throw new UnauthorizedException('Magic link expired or already used');
        }

        await this.prisma.magicLink.update({
            where: { token },
            data: { used: true },
        });

        return this.generateToken(magicLink.user);
    }
}
