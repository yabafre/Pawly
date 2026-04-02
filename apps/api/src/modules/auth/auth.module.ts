import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { MailModule } from '@/modules/mail/mail.module';
import type { EnvConfig } from '@/config/index';

@Module({
    imports: [
        PassportModule,
        MailModule,
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService<EnvConfig, true>) => ({
                secret: configService.get('JWT_SECRET', { infer: true }),
                signOptions: { expiresIn: '1d', algorithm: 'HS256' as const },
            }),
        }),
    ],
    providers: [AuthService, JwtStrategy],
    controllers: [AuthController],
    exports: [AuthService, JwtModule],
})
export class AuthModule { }
