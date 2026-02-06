import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppConfigModule } from '@/config/index';
import { PrismaModule } from '@/prisma/prisma.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { MailModule } from '@/modules/mail/mail.module';
import { StripeModule } from '@/modules/stripe/stripe.module';
import { TRPCModule } from '@/trpc/trpc.module';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuthModule,
    MailModule,
    StripeModule,
    TRPCModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
