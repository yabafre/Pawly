import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ['fr', 'en'],

  // Used when no locale matches
  defaultLocale: 'fr',
  localePrefix: 'as-needed',
  localeCookie: {
    // Expire in one year
    maxAge: 60 * 60 * 24 * 365,
  },
});

/**
 * Locale type derived from routing configuration
 * Use this type for consistent locale typing across the application
 */
export type Locale = (typeof routing.locales)[number];
