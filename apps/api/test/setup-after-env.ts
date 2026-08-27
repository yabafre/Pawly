// Nest's DI graph and Prisma's handshake are both slower than the Jest default
// on a cold container.
jest.setTimeout(30_000);

/**
 * These suites create and truncate tables. They share a Neon project with the
 * real data and are kept apart from it by database, so the one thing that must
 * never happen is a run whose connection string names `neondb`. The run stops
 * here, before a single test executes.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL is unset. Run integration tests via `pnpm test:integration`, which ' +
      'loads .env.e2e — see .env.e2e.example.',
  );
}
if (!/\/pawly_e2e(\?|$)/.test(url)) {
  throw new Error(
    `Refusing to run integration tests against ${url.replace(/:[^:@]*@/, ':***@')} — ` +
      'the connection string must name the dedicated `pawly_e2e` database, which is ' +
      'what keeps the truncations away from the real data.',
  );
}
