import { defineConfig } from '@trigger.dev/sdk';
import type { BuildExtension } from '@trigger.dev/build';
import {
  syncEnvVars,
  additionalFiles,
  additionalPackages,
} from '@trigger.dev/build/extensions/core';

const SYNCED_ENV_KEYS = [
  'DATABASE_URL',
  'RESEND_API_KEY',
  'MAIL_FROM',
  'WEB_APP_URL',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
] as const;

function prismaGenerate(): BuildExtension {
  return {
    name: 'prisma-generate',
    onBuildComplete(context) {
      context.addLayer({
        id: 'prisma-generate',
        commands: [
          'DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" node node_modules/prisma/build/index.js generate --schema=prisma/schema',
        ],
        image: {
          pkgs: ['openssl'],
        },
      });
    },
  };
}

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID || '',
  runtime: 'node-22',
  dirs: ['src/trigger/tasks'],
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    external: [
      'react',
      'react-dom',
      '@react-email/render',
      '@react-email/components',
      '@prisma/client',
      '@prisma/adapter-pg',
      '.prisma/client/default',
      'pg',
      'zod',
    ],
    extensions: [
      additionalFiles({
        files: ['prisma/schema/**/*.prisma', 'prisma.config.ts'],
      }),
      additionalPackages({
        // react-dom is only a PEER of @react-email/render, so the generated image
        // package.json never listed it and `npm i` pulled the newest 19.x -- which then
        // demanded a matching react and clashed with the react the build pins from the
        // lockfile (prod deploy of v0.16.1 died on exactly that ERESOLVE). Pin it here so
        // the pair is fixed in the image; keep the version in step with apps/api's
        // react/react-dom, which are pinned exact for the same reason.
        packages: ['prisma@7.2.0', '@prisma/config@7.2.0', 'react-dom@19.2.7'],
      }),
      prismaGenerate(),
      syncEnvVars(async () => {
        const vars: Record<string, string> = {};
        for (const key of SYNCED_ENV_KEYS) {
          if (process.env[key]) {
            vars[key] = process.env[key]!;
          }
        }
        return vars;
      }),
    ],
  },
});
