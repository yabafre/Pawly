import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from '@/config/index';
import { PrismaModule } from '@/prisma/prisma.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { MailModule } from '@/modules/mail/mail.module';
import { StripeModule } from '@/modules/stripe/stripe.module';
import { ClinicModule } from '@/modules/clinic/clinic.module';
import { EmployeeModule } from '@/modules/employee/employee.module';
import { PlanningModule } from '@/modules/planning/planning.module';
import { SchedulerModule } from '@/modules/scheduler/scheduler.module';
import { TRPCModule } from '@/trpc/trpc.module';
import { RedisModule } from '@/redis';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import type { EnvConfig } from '@/config/index';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    MailModule,
    StripeModule,
    ClinicModule,
    EmployeeModule,
    PlanningModule,
    ScheduleModule.forRoot(),
    SchedulerModule,
    TRPCModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig>) => {
        const redisUrl = config.get('REDIS_URL', { infer: true });
        let storage: ThrottlerStorageRedisService | undefined;
        if (redisUrl) {
          try {
            const isTls = redisUrl.startsWith('rediss://');
            const client = new Redis(redisUrl, {
              maxRetriesPerRequest: 3,
              ...(isTls && { tls: { rejectUnauthorized: false } }),
            });
            client.on('error', () => { /* swallow — fallback to in-memory */ });
            storage = new ThrottlerStorageRedisService(client);
          } catch {
            // Fall back to in-memory
          }
        }
        return {
          throttlers: [{ ttl: 60000, limit: 10 }],
          ...(storage ? { storage } : {}),
        };
      },
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
