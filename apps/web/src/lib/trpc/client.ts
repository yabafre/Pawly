import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@pawly/api/trpc-types';

const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/trpc`
    : 'http://localhost:3001/trpc';

// Type-only import keeps Next.js bundler safe while preserving end-to-end types
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      transformer: superjson,
      url: getBaseUrl(),
      async headers() {
        // Read auth token from httpOnly cookie (set by server actions after login)
        try {
          const { cookies } = await import('next/headers');
          const cookieStore = await cookies();
          const token = cookieStore.get('auth-token')?.value;
          return token ? { authorization: `Bearer ${token}` } : {};
        } catch {
          return {};
        }
      },
    }),
  ],
});
