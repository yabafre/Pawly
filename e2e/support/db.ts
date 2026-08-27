import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One thing, and only one thing, cannot be set up through the product: the
 * entitlement tier. It is written exclusively by the Stripe webhook, and the
 * E2E API is built without `rawBody`, so a signed webhook cannot even be
 * delivered here. Everything Professional-gated — the planning health bar, the
 * publish button that lives inside it, planning rules, the CP-SAT toggle —
 * would otherwise be untestable in a browser.
 *
 * So this file reaches past the API for that single UPDATE, against the
 * dedicated `pawly_e2e` database and never anything else. `pg` is resolved
 * from `apps/api`, which owns the dependency.
 */

const ROOT = join(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Client } = createRequire(join(ROOT, 'apps/api/package.json'))('pg') as any;

function databaseUrl(): string {
  // `.env.e2e` is gitignored — it holds a real connection string — so CI has no
  // copy and supplies the value through the environment instead.
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const path = join(ROOT, '.env.e2e');
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_URL=')) return trimmed.slice('DATABASE_URL='.length);
    }
  }

  throw new Error(
    'No DATABASE_URL: set it in the environment, or copy .env.e2e.example to .env.e2e.',
  );
}

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const url = databaseUrl();
  // The test database is a database of its own on the shared Neon project, so
  // "is it local" says nothing useful — what matters is that it is not the one
  // holding the real data. Same criterion as apps/api/test/setup-after-env.ts.
  if (!/\/pawly_e2e(\?|$)/.test(url)) {
    throw new Error(
      `Refusing to touch ${url.replace(/:[^:@]*@/, ':***@')} — these helpers write ` +
        'directly to the database and only run against the dedicated `pawly_e2e` one.',
    );
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } finally {
    await client.end();
  }
}

/**
 * Puts a clinic on the Professional tier, addressed by its admin's email so the
 * caller never has to learn a clinic id. Do it before the clinic's first
 * authenticated page load: the API caches `sub:{clinicId}` for 120s when Redis
 * is configured (it is not under `.env.e2e`, but the ordering costs nothing).
 */
export async function grantProfessionalTier(adminEmail: string): Promise<void> {
  const rows = await query<{ id: string }>(
    `UPDATE "Subscription" s
        SET entitlement_tier = 'professional', plan_key = 'professional_e2e'
       FROM "User" u
      WHERE u.email = $1 AND s.clinic_id = u.clinic_id
      RETURNING s.id`,
    [adminEmail]
  );
  if (rows.length === 0) throw new Error(`No subscription found for admin ${adminEmail}`);
}
