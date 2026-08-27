import type { Locator, Page } from '@playwright/test';

/**
 * Sonner stacks toasts, so `[data-sonner-toast]` on its own is ambiguous the
 * moment an action fires a second one (save → then resend). Always match on the
 * wording.
 */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator('[data-sonner-toast]').filter({ hasText: text });
}

export function errorToast(page: Page): Locator {
  return page.locator('[data-sonner-toast][data-type="error"]');
}

/** shadcn Card root — the only stable handle on a card as a container. */
export const CARD = '[data-slot="card"]';
