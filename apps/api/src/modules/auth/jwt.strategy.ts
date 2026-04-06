import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis';
import type { EnvConfig } from '@/config/index';

interface JwtPayload {
    sub: string;
    email: string;
    role: string;
    clinicId?: string;
}

const USER_CACHE_TTL = 300; // 5 minutes
const cacheKey = (userId: string) => `user:${userId}`;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService<EnvConfig, true>,
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_SECRET', { infer: true }),
            algorithms: ['HS256'] as const,
        });
    }

    async validate(payload: JwtPayload) {
        // Try cache first
        const cached = await this.redis.get<{ id: string; clinicId: string }>(cacheKey(payload.sub));
        if (cached) {
            return { sub: payload.sub, email: payload.email, role: payload.role, clinicId: cached.clinicId };
        }

        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, clinicId: true },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        // Cache for subsequent requests
        await this.redis.set(cacheKey(user.id), { id: user.id, clinicId: user.clinicId }, USER_CACHE_TTL);

        return { sub: payload.sub, email: payload.email, role: payload.role, clinicId: user.clinicId };
    }
}
