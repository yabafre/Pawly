import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import type { EnvConfig } from '@/config/index';

interface JwtPayload {
    sub: string;
    email: string;
    role: string;
    clinicId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService<EnvConfig, true>,
        private readonly prisma: PrismaService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_SECRET', { infer: true }),
            algorithms: ['HS256'] as const,
        });
    }

    // TODO: Consider caching user lookups (e.g., Redis with short TTL) to reduce DB load per request
    async validate(payload: JwtPayload) {
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        // Always use current clinicId from DB, not JWT payload, in case user was transferred between clinics
        return { sub: payload.sub, email: payload.email, role: payload.role, clinicId: user.clinicId };
    }
}
