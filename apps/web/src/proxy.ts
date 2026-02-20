import createMiddleware from 'next-intl/middleware';
import { type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

/**
 * i18n Locale Middleware (Next.js 16 proxy)
 *
 * CRITICAL: This middleware ONLY handles locale detection and routing.
 * Auth/subscription checks MUST remain in route layouts (admin/layout.tsx).
 * The x-pathname header is added for server-side route detection in layouts.
 *
 * @see docs/planning-artifacts/architecture.md - "Proxy Order" section
 */
export default function middleware(request: NextRequest) {
    const response = intlMiddleware(request);
    response.headers.set('x-pathname', request.nextUrl.pathname);
    return response;
}

export const config = {
    // Match all pathnames except for:
    // - /api, /trpc, /_next, /_vercel
    // - All files with dots (e.g., favicon.ico, robots.txt, sitemap.xml)
    matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)'
};
