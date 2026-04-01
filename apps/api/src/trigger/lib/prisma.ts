import type { PrismaClient as PrismaClientType } from '@prisma/client';
import prismaClientPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pgPkg from 'pg';

const { PrismaClient } = prismaClientPkg;
const { Pool } = pgPkg;

let _prisma: PrismaClientType | undefined;
export function getPrisma(): PrismaClientType {
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
