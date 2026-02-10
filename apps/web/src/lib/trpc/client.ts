import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@pawly/api/trpc-types';

const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/trpc`
    : 'http://localhost:3001/trpc';

/**
 * Fetch wrapper with retry logic for server-side calls.
 *
 * When running `pnpm dev`, Turborepo starts Next.js and NestJS simultaneously.
 * Next.js boots faster and may attempt SSR tRPC calls before the API is ready,
 * causing ECONNREFUSED errors. This wrapper retries with exponential backoff
 * to handle the startup race condition gracefully.
 */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;

      // Only retry on connection errors (ECONNREFUSED, ECONNRESET, etc.)
      // Don't retry if the server responded (even with an error status)
      const isConnectionError =
        error instanceof TypeError &&
        error.message === 'fetch failed' &&
        error.cause &&
        typeof error.cause === 'object' &&
        'code' in error.cause &&
        typeof (error.cause as { code?: string }).code === 'string' &&
        ['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT'].includes(
          (error.cause as { code: string }).code,
        );

      if (!isConnectionError || attempt === MAX_RETRIES) {
        throw error;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 500ms, 1000ms, 2000ms
      console.warn(
        `[tRPC] API connection failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Type-only import keeps Next.js bundler safe while preserving end-to-end types
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      transformer: superjson,
      url: getBaseUrl(),
      fetch: fetchWithRetry,
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
