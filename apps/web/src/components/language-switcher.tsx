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

/**
 * LanguageSwitcher component for instant locale switching without page reload.
 * Uses next-intl's useRouter.replace() for client-side navigation.
 * Follows the "Clinique Zen" aesthetic using shadcn/ui Select.
 */
export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('common.language');
  const [isPending, startTransition] = useTransition();

  const handleLocaleChange = (newLocale: string) => {
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
