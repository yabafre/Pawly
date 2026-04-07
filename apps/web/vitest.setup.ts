import '@testing-library/jest-dom';
import { createElement, type ReactNode } from 'react';
import { vi } from 'vitest';

// Mock scrollIntoView for Radix UI components (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Mock ResizeObserver for Radix UI primitives in jsdom
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

if (typeof window !== "undefined" && !window.ResizeObserver) {
  (window as any).ResizeObserver = ResizeObserverMock;
}

if (typeof globalThis !== "undefined" && !("ResizeObserver" in globalThis)) {
  (globalThis as any).ResizeObserver = ResizeObserverMock;
}

// Mock next/headers (cookies, headers)
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
    getAll: () => [],
    has: () => false,
  })),
  headers: vi.fn(async () => new Map()),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  notFound: vi.fn(),
  redirect: vi.fn(),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock @/i18n/navigation (next-intl navigation wrappers)
vi.mock('@/i18n/navigation', () => ({
  Link: vi.fn(({ children, href }: { children: ReactNode; href: string }) =>
    createElement('a', { href }, children),
  ),
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
    NextIntlClientProvider: ({ children }: { children: ReactNode }) => {
      return children;
    },
    hasLocale: (locales: string[], locale: string) => locales.includes(locale),
  };
});

// Mock motion/react (framer-motion successor)
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ({ children, animate, initial, exit, style, ...props }: Record<string, unknown>) =>
          createElement(tag, { style: { ...(style as object), ...(animate as object) }, ...props }, children as ReactNode),
    },
  ),
  m: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ({ children, animate, initial, exit, style, ...props }: Record<string, unknown>) =>
          createElement(tag, { style: { ...(style as object), ...(animate as object) }, ...props }, children as ReactNode),
    },
  ),
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  LazyMotion: ({ children }: { children: ReactNode }) => children,
  domAnimation: {},
}));

// Mock next-intl/server
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getRequestConfig: vi.fn(),
  getTranslations: vi.fn(async () => {
    const t = (key: string) => key;
    t.raw = (key: string) => key;
    t.rich = (key: string) => key;
    t.markup = (key: string) => key;
    t.has = () => true;
    return t;
  }),
}));
