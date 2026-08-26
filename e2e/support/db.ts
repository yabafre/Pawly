import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
 * throwaway Postgres in `.env.e2e` and never anything else. `pg` is resolved
 * from `apps/api`, which owns the dependency.
 */

const ROOT = join(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Client } = createRequire(join(ROOT, 'apps/api/package.json'))('pg') as any;

function databaseUrl(): string {
  const raw = readFileSync(join(ROOT, '.env.e2e'), 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) return trimmed.slice('DATABASE_URL='.length);
  }
  throw new Error('DATABASE_URL missing from .env.e2e');
}

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const url = databaseUrl();
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error(`Refusing to touch a non-local database: ${url.replace(/:[^:@]*@/, ':***@')}`);
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
