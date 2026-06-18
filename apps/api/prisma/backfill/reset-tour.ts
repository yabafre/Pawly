import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Dev/QA helper: reset a user's tour so it re-fires on next login.
// Usage: ts-node prisma/backfill/reset-tour.ts [email]
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const email = process.argv[2] ?? 'admin@test.app';
  const res = await prisma.user.updateMany({
    where: { email },
    data: { tourCompletedAt: null, tourState: Prisma.DbNull },
  });
  const user = await prisma.user.findUnique({
    where: { email },
    select: { email: true, role: true, tourCompletedAt: true, tourState: true },
  });
  console.log(`Reset tour for ${res.count} user(s) matching ${email}.`);
  console.log(user);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
