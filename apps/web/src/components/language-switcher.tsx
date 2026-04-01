'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Globe } from 'lucide-react';
import { routing, type Locale } from '@/i18n/routing';
import { isStandalone } from '@/lib/pwa-utils';

/**
 * LanguageSwitcher component for instant locale switching without page reload.
 * Uses next-intl's useRouter.replace() for client-side navigation.
 * In PWA standalone mode, uses window.location to avoid iOS breaking out of standalone.
 */
interface LanguageSwitcherProps {
  onLocaleChange?: (locale: string) => void;
}

export function LanguageSwitcher({ onLocaleChange }: LanguageSwitcherProps = {}) {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('common.language');
  const [isPending, startTransition] = useTransition();

  const handleLocaleChange = (newLocale: string) => {
    onLocaleChange?.(newLocale);

    if (isStandalone()) {
      // In PWA standalone mode, use window.location to stay in standalone context.
      // next-intl's router.replace() triggers a Next.js soft navigation that
      // causes iOS to break out of standalone and show Safari chrome.
      const defaultLocale = routing.defaultLocale;
      const currentPath = window.location.pathname;

      // Strip existing locale prefix if present
      let basePath = currentPath;
      for (const loc of routing.locales) {
        if (currentPath.startsWith(`/${loc}/`) || currentPath === `/${loc}`) {
          basePath = currentPath.slice(`/${loc}`.length) || '/';
          break;
        }
      }

      // Set NEXT_LOCALE cookie before navigating — next-intl middleware reads this
      // to determine locale. Without it, the middleware redirects back to the old locale.
      const maxAge = 60 * 60 * 24 * 365;
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${maxAge};SameSite=Lax`;

      // Build new path: default locale has no prefix (localePrefix: 'as-needed')
      const newPath = newLocale === defaultLocale ? basePath : `/${newLocale}${basePath}`;
      window.location.replace(newPath);
      return;
    }

    startTransition(() => {
      router.replace(pathname, { locale: newLocale as Locale });
    });
  };

  return (
    <Select
      value={locale}
      onValueChange={handleLocaleChange}
      disabled={isPending}
    >
      <SelectTrigger
        className="w-auto gap-2 border-none bg-transparent hover:bg-neutral-100 transition-colors"
        aria-label={t('switchTo')}
        size="sm"
      >
        <Globe className="h-4 w-4 text-neutral-500" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" position="popper" sideOffset={4}>
        {routing.locales.map((loc) => (
          <SelectItem key={loc} value={loc}>
            {t(loc)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
