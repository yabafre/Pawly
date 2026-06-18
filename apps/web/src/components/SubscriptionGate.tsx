'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/lib/contexts/subscription-context';
import Link from 'next/link';

interface SubscriptionGateProps {
  requiredTier: string;
  children: ReactNode;
  locale?: string;
}

export function SubscriptionGate({ requiredTier, children, locale = 'fr' }: SubscriptionGateProps) {
  const t = useTranslations('billing.guard');
  const { canAccessFeature } = useSubscription();

  if (canAccessFeature(requiredTier)) {
    return <>{children}</>;
  }

  return (
    <Card className="rounded-2xl border-2 border-[#009588]/30 bg-[#009588]/5">
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-[#009588]/10 flex items-center justify-center">
          <Lock className="w-6 h-6 text-[#009588]" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-[#171717]">{t('upgrade.title')}</h3>
          <p className="text-sm text-[#737373] mt-1">{t('upgrade.description')}</p>
        </div>
        <Button asChild className="bg-[#009588] hover:bg-[#00796B] text-white rounded-xl px-6">
          <Link href={`/${locale}/admin/settings?tab=billing`}>{t('upgrade.action')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
