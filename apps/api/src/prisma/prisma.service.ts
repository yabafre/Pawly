import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { EnvConfig } from '@/config/index';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool;

  constructor(configService: ConfigService<EnvConfig, true>) {
    const pool = new Pool({
      connectionString: configService.get('DATABASE_URL', { infer: true }),
      // Neon serverless: keep the per-instance connection footprint
      // explicit instead of relying on the pg driver default.
      max: Number(process.env.DB_POOL_MAX ?? '10'),
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
