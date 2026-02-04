import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { EnvConfig } from '@/config/index';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private pool: Pool;

    constructor(configService: ConfigService<EnvConfig, true>) {
        const pool = new Pool({
            connectionString: configService.get('DATABASE_URL', { infer: true }),
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
