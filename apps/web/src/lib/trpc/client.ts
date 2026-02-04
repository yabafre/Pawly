import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@pawly/api/trpc-types';

// Type-only import keeps Next.js bundler safe while preserving end-to-end types
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/trpc` : 'http://localhost:3001/trpc',
    }),
  ],
});
