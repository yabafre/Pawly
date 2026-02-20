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
 * Retries on:
 * 1. Connection errors (ECONNREFUSED, ECONNRESET) — API not yet started
 * 2. Server errors (5xx) — API overloaded or restarting
 * 3. Non-JSON responses — API returning error page during hot-reload
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
      const response = await fetch(input, init);

      // Retry on server errors (502, 503, etc. — API restarting or not ready)
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[tRPC] Server error ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Retry on non-JSON responses (API returning HTML error page during hot-reload)
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json') && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[tRPC] Non-JSON response (content-type: ${contentType || 'none'}) (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      // Retry on connection errors (ECONNREFUSED, ECONNRESET, etc.)
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

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
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
