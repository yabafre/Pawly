import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  notFound: vi.fn(),
}));

// Mock @/i18n/navigation (next-intl navigation wrappers)
vi.mock('@/i18n/navigation', () => ({
  Link: vi.fn(({ children, href }: { children: React.ReactNode; href: string }) => {
    const React = require('react');
    return React.createElement('a', { href }, children);
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  redirect: vi.fn(),
  getPathname: vi.fn(),
}));

// Mock next-intl
vi.mock('next-intl', async () => {
  const actual = await vi.importActual('next-intl');
  return {
    ...actual,
    useTranslations: () => (key: string) => key,
    useLocale: () => 'fr',
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => { return children; },
    hasLocale: (locales: string[], locale: string) => locales.includes(locale),
  };
});

// Mock next-intl/server
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getRequestConfig: vi.fn(),
}));
