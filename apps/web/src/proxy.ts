import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

/**
 * i18n Locale Middleware (Next.js 16 proxy)
 *
 * CRITICAL: This middleware ONLY handles locale detection and routing.
 * Auth/subscription checks MUST remain in route layouts (admin/layout.tsx).
 *
 * @see docs/planning-artifacts/architecture.md - "Proxy Order" section
 */
export default createMiddleware(routing);

export const config = {
    // Match all pathnames except for:
    // - /api, /trpc, /_next, /_vercel
    // - All files with dots (e.g., favicon.ico, robots.txt, sitemap.xml)
    matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)'
};
