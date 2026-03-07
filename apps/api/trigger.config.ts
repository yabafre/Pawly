import { defineConfig } from '@trigger.dev/sdk';
import { prismaExtension } from '@trigger.dev/build/extensions/prisma';

export default defineConfig({
  project: 'proj_glkfkpioovayliqompoo',
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
      prismaExtension({
        mode: 'modern',
      }),
    ],
  },
});
