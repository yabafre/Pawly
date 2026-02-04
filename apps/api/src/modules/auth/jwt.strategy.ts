import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import type { EnvConfig } from '@/config/index';

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
        });
    }

    async validate(payload: any) {
        const user = await this.prisma.user.findFirst({
            where: { id: payload.sub, clinicId: payload.clinicId },
        });

        if (!user) {
            throw new UnauthorizedException('User no longer belongs to this clinic');
        }

        return { sub: payload.sub, email: payload.email, role: payload.role, clinicId: payload.clinicId };
    }
}
