/**
 * Puts the dedicated E2E database back to a known shape: every table emptied,
 * then reseeded. Suites are meant to clean up after themselves, but fixtures
 * accumulate across runs and a long suite that assumes a small roster starts
 * failing for reasons that have nothing to do with the code under test.
 *
 * TRUNCATE rather than dropping the schema: it keeps the tables and their
 * constraints in place, so no `prisma db push` is needed afterwards.
 */
import { Pool } from 'pg';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url || !/\/pawly_e2e(\?|$)/.test(url)) {
    throw new Error(
      `Refusing to reset ${(url ?? '(unset)').replace(/:[^:@]*@/, ':***@')} — ` +
        'this only runs against the dedicated `pawly_e2e` database.',
    );
  }

  const pool = new Pool({ connectionString: url });
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (rows.length === 0) {
      console.log('No tables to truncate — run `prisma db push` first.');
      return;
    }

    const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
    await pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    console.log(`Truncated ${rows.length} tables in pawly_e2e.`);
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
