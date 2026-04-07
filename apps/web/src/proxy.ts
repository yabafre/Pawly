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

    // Prevent Cloudflare/CDN caching on auth routes (login, register, auth callbacks)
    const pathname = request.nextUrl.pathname;
    if (
        pathname.includes('/login') ||
        pathname.includes('/register') ||
        pathname.includes('/auth/') ||
        pathname.includes('/forgot-password') ||
        pathname.includes('/reset-password') ||
        pathname.includes('/onboarding')
    ) {
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        response.headers.set('Pragma', 'no-cache');
    }

    return response;
}

export const config = {
    // Match all pathnames except for:
    // - /api, /trpc, /_next, /_vercel
    // - All files with dots (e.g., favicon.ico, robots.txt, sitemap.xml)
    matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)'
};
