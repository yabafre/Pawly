import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Prisma 7 + driver adapters: the datasource has no `url`, so a bare
// `new PrismaClient()` cannot connect. Mirror PrismaService's adapter wiring.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const res = await prisma.user.updateMany({
    where: { role: 'ADMIN', tourCompletedAt: null },
    data: { tourCompletedAt: new Date() },
  });
  console.log(`Backfilled ${res.count} ADMIN user(s) as tour-completed.`);
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
