import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

let _prisma: PrismaClient | undefined;
export function getPrisma(): PrismaClient {
  if (!_prisma) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      idleTimeoutMillis: 30_000,
      max: 5,
    });
    const adapter = new PrismaPg(pool);
    _prisma = new PrismaClient({ adapter });
  }
  return _prisma;
}
