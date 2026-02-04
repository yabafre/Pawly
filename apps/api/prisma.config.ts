// Prisma Configuration for Pawly API
// See: https://pris.ly/d/config-datasource
// Note: Environment variables are loaded by dotenv-cli from monorepo root
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  // Multi-file schema: point to the schema directory
  schema: 'prisma/schema',

  // Migrations configuration
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },

  // Database connection from environment
  datasource: {
    url: env('DATABASE_URL'),
  },
});